import express from "express";
import cors from "cors";
import { q, one, rows, migrate, tx, dbUrl, DB_VARS } from "./db.js";
import { ROLES, HQ_ROLES, ADMIN_ROLES, WRITE_ROLES, ACCT_ROLES, MPLAN_ROLES, STORE_ROLES, DAY_ROLES, hashPassword, verifyPassword, safeEqual, passwordProblem, issueToken, readToken, publicUser } from "./auth.js";
import { audit, diff } from "./audit.js";
import { USER_LIMIT, USER_LOCK_MIN, IP_LIMIT, IP_LOCK_MIN, clientIp, userKey, ipKey, takeAttempt, lock, loginSucceeded, clearUserLocks } from "./limits.js";
import { ValidationError, ConflictError, SPEC, clean, insertSql, updateSql, isId, validDate } from "./valid.js";
import { notFound } from "./common.js";
import catalog from "./routes/catalog.js";
import production from "./routes/production.js";
import store from "./routes/store.js";
import overview from "./routes/overview.js";
import reports from "./routes/reports.js";
import hr from "./routes/hr.js";
import finance from "./routes/finance.js";
import materialInvoices from "./routes/material-invoices.js";
import factoryImport from "./routes/factory-import.js";
import notifications from "./routes/notifications.js";
import telegramSettings, { telegramWebhook } from "./routes/telegram.js";

const app = express();
if (process.env.TRUST_PROXY) app.set("trust proxy", true);

/* ---------- CORS ---------- */
const origins = (process.env.CORS_ORIGIN || "*")
  .split(",")
  .map((s) => s.trim().replace(/\/+$/, ""))
  .filter(Boolean);
app.use(
  cors({
    origin: origins.includes("*") ? true : origins,
    allowedHeaders: ["Content-Type", "Authorization", "X-Factory"],
    exposedHeaders: ["Content-Disposition"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  })
);
app.use(["/api/days", "/api/hr/personnel", "/api/finance", "/api/admin/factory-imports"], express.json({ limit: "12mb" }));
app.use(express.json({ limit: "2mb" }));

/* ---------- ochiq yo'llar ---------- */
// Holat: baza ulanishi va jadvallar. Xato bo'lsa — sababi (parolsiz), Vercel sozlamasini tekshirish uchun
app.get("/api/health", async (_req, res) => {
  const url = dbUrl();
  let host = "";
  try {
    host = url ? new URL(url).hostname : "";
  } catch {
    host = "noto'g'ri yozilgan";
  }
  const info = { db: "postgres", dbVar: DB_VARS.find((k) => process.env[k]) || null, dbHost: host };
  try {
    await migrate();
    await q("SELECT 1");
    res.json({ ok: true, ...info, time: new Date().toISOString() });
  } catch (err) {
    const msg = String(err?.message || err).replace(/\/\/[^@\s]+@/g, "//***@");
    const hint = !url
      ? "DATABASE_URL o'rnatilmagan: Vercel → loyiha → Storage → Neon bazasini shu loyihaga ulang, keyin Redeploy"
      : /^(localhost|127\.0\.0\.1)$/.test(host) && process.env.VERCEL
        ? "DATABASE_URL kompyuterdagi bazaga (localhost) qarayapti — Vercel unga ulana olmaydi. Neon bazasining ulanish qatorini qo'ying"
        : "";
    res.status(503).json({ ok: false, ...info, error: msg, code: err?.code || null, hint });
  }
});

app.use("/api", async (_req, _res, next) => {
  await migrate(); // birinchi so'rovda jadvallar yaratiladi / yangilanadi
  next();
});

app.use("/api/telegram/webhook", telegramWebhook);

const BAD_LOGIN = "Login yoki parol noto'g'ri";
// mavjud bo'lmagan login uchun ham scrypt ishlatiladi — javob vaqtidan login borligini bilib bo'lmaydi
const DUMMY_HASH = hashPassword("pto-dummy-password");

app.post("/api/login", async (req, res) => {
  const username = String(req.body?.username || "").trim().toLowerCase().slice(0, 60);
  const password = String(req.body?.password || "");
  if (!username || !password) return res.status(400).json({ error: "Login va parolni kiriting" });

  const ip = clientIp(req);
  const locked = (until) => {
    const min = Math.max(1, Math.ceil((new Date(until) - Date.now()) / 60000));
    return res.status(429).json({ error: `Ko'p marta noto'g'ri parol kiritildi. ${min} daqiqadan keyin urinib ko'ring` });
  };
  const ipTry = await takeAttempt(ipKey(ip), IP_LIMIT, IP_LOCK_MIN);
  if (ipTry.locked) return locked(ipTry.locked);
  const key = userKey(username, ip);
  const userTry = await takeAttempt(key, USER_LIMIT, USER_LOCK_MIN);
  if (userTry.locked) return locked(userTry.locked);
  const failed = async () => {
    if (userTry.count >= USER_LIMIT) await lock(key, USER_LOCK_MIN);
    return res.status(401).json({ error: BAD_LOGIN });
  };

  // Birinchi kirish: foydalanuvchi yo'q bo'lsa, "admin" + APP_PASSWORD bilan bosh administrator va 1-zavod yaratiladi
  if (!(await q("SELECT 1 FROM users LIMIT 1")).rowCount) {
    const boot = process.env.APP_PASSWORD;
    if (!boot) return res.status(503).json({ error: "Foydalanuvchi yo'q. Birinchi kirish uchun serverda APP_PASSWORD ni o'rnating" });
    if (username !== "admin" || !safeEqual(password, boot)) return failed();
    const user = await tx(async (c) => {
      await c.query("INSERT INTO factories (code, name, kind) VALUES ('zavod-1', '1-zavod', 'beton') ON CONFLICT (code) DO NOTHING");
      return one(
        "INSERT INTO users (username, name, role, password_hash, must_change_password, last_login_at) VALUES ('admin', 'Administrator', 'admin', $1, true, now()) RETURNING *",
        [await hashPassword(password)],
        c
      );
    });
    await loginSucceeded(username, ip);
    req.user = user;
    await audit(req, { action: "login", entity: "user", entityId: user.id, label: "Birinchi kirish — administrator yaratildi", factoryId: null });
    return res.json({ token: issueToken(user), user: publicUser(user) });
  }

  const user = await one("SELECT * FROM users WHERE username = $1", [username]);
  const ok = await verifyPassword(password, user?.active ? user.passwordHash : await DUMMY_HASH);
  if (!user || !user.active || !ok) return failed();

  await loginSucceeded(username, ip);
  const u = await one("UPDATE users SET last_login_at = now() WHERE id = $1 RETURNING *", [user.id]);
  req.user = u;
  await audit(req, { action: "login", entity: "user", entityId: u.id, label: u.username, factoryId: u.factoryId });
  // jurnalning ~13 oydan eski yozuvlari vaqti-vaqti bilan o'chiriladi
  if (Math.random() < 0.02) await q("DELETE FROM audit_log WHERE created_at < now() - interval '400 days'");
  res.json({ token: issueToken(u), user: publicUser(u) });
});

/* ---------- himoya: token va rol ---------- */
app.use("/api", async (req, res, next) => {
  const token = (req.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const t = readToken(token);
  if (!t || !isId(t.u)) return res.status(401).json({ error: "Qaytadan kiring" });
  const user = await one("SELECT * FROM users WHERE id = $1", [t.u]);
  if (!user || !user.active || (user.tokenVersion || 0) !== t.v) return res.status(401).json({ error: "Qaytadan kiring" });
  req.user = user;
  if (user.mustChangePassword && req.path !== "/me" && req.path !== "/me/password") {
    return res.status(403).json({ error: "Avval o'zingizning parolingizni o'rnating", code: "mustChangePassword" });
  }
  next();
});

/* ---------- zavod tanlash ---------- */
// Zavodga bog'langan foydalanuvchi — faqat o'z zavodi. Bosh ofis foydalanuvchisi «X-Factory» sarlavhasi
// (yoki ?factory=) bilan tanlaydi; berilmasa — birinchi faol zavod.
app.use("/api", async (req, res, next) => {
  const u = req.user;
  const list = await rows("SELECT * FROM factories ORDER BY archived, sort, name");
  req.factories = list;
  if (u.factoryId) {
    req.factory = list.find((f) => f.id === u.factoryId) || null;
  } else {
    const want = req.get("x-factory") || req.query.factory;
    req.factory = (isId(want) && list.find((f) => f.id === want)) || list.find((f) => !f.archived) || list[0] || null;
  }
  req.factoryId = req.factory?.id || null;
  if (!req.factoryId && !/^\/(me|users|factories|audit|notifications)(\/|$)/.test(req.path)) {
    return res.status(400).json({ error: "Zavod topilmadi — «Boshqaruv → Zavodlar» bo'limida zavod qo'shing" });
  }
  next();
});

// Kuzatuvchi xabarni o'qilgan deb belgilashi mumkin; umumiy yozish huquqi talab qilinmaydi.
app.use("/api", notifications);
app.use("/api", telegramSettings);

// Personnel/payroll has its own stricter permissions, including read access.
app.use("/api/hr", hr);
app.use("/api/finance/material-invoices", materialInvoices);
app.use("/api/finance", finance);
app.use("/api/admin/factory-imports", factoryImport);
app.use('/api/acct-reports',(req,res,next)=>['admin','rahbar','buxgalter'].includes(req.user.role)?next():res.status(403).json({error:'Material hisoboti faqat admin, buxgalter va rahbar uchun'}));
app.use("/api", (req, res, next) => {
  if (req.user.role === "kadrlar" && !/^\/me(\/password)?$/.test(req.path))
    return res.status(403).json({ error: "Sizda bu amal uchun ruxsat yo'q" });
  next();
});

// Yozish huquqlari:
//   admin, rahbar — hammasi, shu jumladan foydalanuvchilar, zaxira va o'zgarishlar tarixi
//   pto          — hammasi (foydalanuvchilarsiz)
//   omborchi     — ombor harakatlari, sex/texnika, material qo'shish/tahrirlash (narx va retseptsiz)
//   buxgalter    — hamma narsani ko'radi, faqat oylik material hisobotini (/acct-reports) saqlaydi
//   kuzatuvchi, kurator — faqat ko'radi. O'z parolini almashtirish hammaga ruxsat.
const STORE_PATH = /^\/(movements|targets|inventories|suppliers|vehicle-logs)(\/|$)/;
app.use("/api", (req, res, next) => {
  if (req.method === "GET" || req.path === "/me/password" || (req.method === "POST" && req.path === "/plan/check")) return next();
  const role = req.user.role;
  if (WRITE_ROLES.includes(role)) return next();
  if (ACCT_ROLES.includes(role) && /^\/acct-reports(\/|$)/.test(req.path)) return next();
  // tasdiqlangan reja: usta ham tuzadi va saqlaydi (o'chira olmaydi)
  if (MPLAN_ROLES.includes(role) && req.method === "PUT" && /^\/month-plans\/[^/]+$/.test(req.path)) return next();
  if (STORE_ROLES.includes(role) && (STORE_PATH.test(req.path) || (/^\/materials(\/|$)/.test(req.path) && req.method !== "DELETE"))) return next();
  if (DAY_ROLES.includes(role) && req.method === "PUT" && /^\/days\/[^/]+$/.test(req.path)) return next();
  if (DAY_ROLES.includes(role) && /^\/product-moves(\/|$)/.test(req.path)) return next();
  return res.status(403).json({ error: "Sizda bu amal uchun ruxsat yo'q" });
});

const adminOnly = (req, res, next) =>
  ADMIN_ROLES.includes(req.user.role) ? next() : res.status(403).json({ error: "Bu bo'lim faqat administrator uchun" });
// bosh ofis administratori (zavodga bog'lanmagan)
const hqAdmin = (req, res, next) =>
  ADMIN_ROLES.includes(req.user.role) && !req.user.factoryId ? next() : res.status(403).json({ error: "Bu amal faqat bosh ofis administratori uchun" });

/* ---------- Joriy foydalanuvchi ---------- */
app.get("/api/me", (req, res) =>
  res.json({
    ...publicUser(req.user),
    factory: req.factory ? { id: req.factory.id, code: req.factory.code, name: req.factory.name, kind: req.factory.kind } : null,
    // bosh ofis foydalanuvchisi zavodlar orasida almasha oladi
    factories: (req.user.factoryId ? req.factories.filter((f) => f.id === req.user.factoryId) : req.factories.filter((f) => !f.archived)).map((f) => ({ id: f.id, code: f.code, name: f.name, kind: f.kind })),
  })
);

app.put("/api/me/password", async (req, res) => {
  const { current, next: nextPw } = req.body || {};
  const u = req.user;
  if (!(await verifyPassword(current, u.passwordHash))) return res.status(400).json({ error: "Joriy parol noto'g'ri" });
  const problem = passwordProblem(nextPw);
  if (problem) return res.status(400).json({ error: problem });
  if (current === nextPw) return res.status(400).json({ error: "Yangi parol eskisidan farq qilsin" });
  const nu = await one(
    "UPDATE users SET password_hash = $2, must_change_password = false, token_version = token_version + 1, updated_at = now() WHERE id = $1 RETURNING *",
    [u.id, await hashPassword(nextPw)]
  );
  await audit(req, { action: "update", entity: "user", entityId: u.id, label: u.username, changes: [{ p: "password", a: "••••", b: "••••" }], factoryId: u.factoryId });
  res.json({ token: issueToken(nu), user: publicUser(nu) });
});

/* ---------- Zavodlar ---------- */
app.get("/api/factories", (req, res) => res.json(req.user.factoryId ? req.factories.filter((f) => f.id === req.user.factoryId) : req.factories));
app.post("/api/factories", hqAdmin, async (req, res) => {
  const data = clean(SPEC.factory, req.body);
  const ins = insertSql("factories", data);
  const doc = await one(ins.text, ins.values);
  await q("INSERT INTO settings (factory_id) VALUES ($1) ON CONFLICT DO NOTHING", [doc.id]);
  await audit(req, { action: "create", entity: "factory", entityId: doc.id, label: doc.name, after: doc, factoryId: doc.id });
  res.status(201).json(doc);
});
app.put("/api/factories/:id", hqAdmin, async (req, res) => {
  if (!isId(req.params.id)) return notFound(res);
  const before = await one("SELECT * FROM factories WHERE id = $1", [req.params.id]);
  if (!before) return notFound(res);
  const data = clean(SPEC.factory, req.body, { partial: true });
  const s = updateSql("factories", req.params.id, null, data);
  const doc = await one(s.text, s.values);
  await audit(req, { action: "update", entity: "factory", entityId: doc.id, label: doc.name, before, after: doc, factoryId: doc.id });
  res.json(doc);
});

/* ---------- Foydalanuvchilar ---------- */
// Zavod administratori faqat o'z zavodi foydalanuvchilarini ko'radi va boshqaradi
const myUsers = (req) => (req.user.factoryId ? { sql: "WHERE factory_id = $1", p: [req.user.factoryId] } : { sql: "", p: [] });
function userFactory(req, role, factoryId) {
  if (req.user.factoryId) return req.user.factoryId; // zavod admini faqat o'z zavodiga qo'sha oladi
  if (factoryId === null || factoryId === "" || factoryId === undefined) {
    if (!HQ_ROLES.includes(role)) throw new ValidationError("Bosh ofisga faqat administrator, kuzatuvchi yoki kurator biriktiriladi — bu rol uchun zavodni tanlang");
    return null;
  }
  if (!isId(factoryId) || !req.factories.some((f) => f.id === factoryId)) throw new ValidationError("Zavod topilmadi");
  return factoryId;
}

app.get("/api/users", adminOnly, async (req, res) => {
  const w = myUsers(req);
  res.json((await rows(`SELECT * FROM users ${w.sql} ORDER BY created_at`, w.p)).map(publicUser));
});

app.post("/api/users", adminOnly, async (req, res) => {
  const { username, name, role, password, factoryId } = req.body || {};
  if (!ROLES.includes(role)) return res.status(400).json({ error: "Rol noto'g'ri" });
  const problem = passwordProblem(password);
  if (problem) return res.status(400).json({ error: problem });
  const login = String(username || "").trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(login)) return res.status(400).json({ error: "Login 3–40 belgi: lotin harflari, raqam, nuqta, _ va -" });
  const fid = userFactory(req, role, factoryId);
  const user = await one(
    "INSERT INTO users (username, name, role, factory_id, password_hash, must_change_password) VALUES ($1, $2, $3, $4, $5, true) RETURNING *",
    [login, String(name || "").trim().slice(0, 120), role, fid, await hashPassword(password)]
  );
  await audit(req, { action: "create", entity: "user", entityId: user.id, label: user.username, after: publicUser(user), factoryId: fid });
  res.status(201).json(publicUser(user));
});

async function adminsLeft(exceptId, client) {
  const r = await q("SELECT count(*) AS n FROM users WHERE role = ANY($1) AND active AND factory_id IS NULL AND id <> $2", [ADMIN_ROLES, exceptId], client);
  return r.rows[0].n;
}
const isHqAdmin = (u) => ADMIN_ROLES.includes(u.role) && !u.factoryId && u.active;

async function findManaged(req, res, client) {
  if (!isId(req.params.id)) return notFound(res), null;
  const user = await one("SELECT * FROM users WHERE id = $1 FOR UPDATE", [req.params.id], client);
  if (!user || (req.user.factoryId && user.factoryId !== req.user.factoryId)) return notFound(res), null;
  return user;
}

app.put("/api/users/:id", adminOnly, async (req, res) => {
  const result = await tx(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(4243)");
    const user = await findManaged(req, res, c);
    if (!user) return;
    const before = publicUser(user);
    const b = req.body || {};
    if (b.role !== undefined && !ROLES.includes(b.role)) throw new ValidationError("Rol noto'g'ri");
    const next = { name: user.name, role: user.role, active: user.active, factoryId: user.factoryId };
    if (b.name !== undefined) next.name = String(b.name).trim().slice(0, 120);
    if (b.role !== undefined) next.role = b.role;
    if (b.active !== undefined) next.active = Boolean(b.active);
    if (b.factoryId !== undefined || b.role !== undefined) next.factoryId = userFactory(req, next.role, b.factoryId !== undefined ? b.factoryId : user.factoryId);
    if (isHqAdmin(user) && !isHqAdmin(next) && !(await adminsLeft(user.id, c))) throw new ValidationError("Kamida bitta faol bosh administrator qolishi kerak");

    let pwHash = null;
    if (b.password) {
      const problem = passwordProblem(b.password);
      if (problem) throw new ValidationError(problem);
      pwHash = await hashPassword(b.password);
    }
    const bump = pwHash || (user.active && !next.active) || next.factoryId !== user.factoryId || next.role !== user.role;
    const nu = await one(
      `UPDATE users SET name = $2, role = $3, active = $4, factory_id = $5,
         password_hash = COALESCE($6, password_hash), must_change_password = must_change_password OR $6 IS NOT NULL,
         token_version = token_version + $7, updated_at = now()
       WHERE id = $1 RETURNING *`,
      [user.id, next.name, next.role, next.active, next.factoryId, pwHash, bump ? 1 : 0], c
    );
    return { user, before, nu, pwHash };
  });
  if (!result || res.headersSent) return;
  const { user, before, nu, pwHash } = result;
  if (pwHash) await clearUserLocks(user.username);
  const after = publicUser(nu);
  const changes = diff("user", before, after);
  if (pwHash) changes.push({ p: "password", a: "••••", b: "yangi parol" });
  await audit(req, { action: "update", entity: "user", entityId: user.id, label: user.username, changes, factoryId: nu.factoryId });
  res.json(after);
});

app.delete("/api/users/:id", adminOnly, async (req, res) => {
  const user = await tx(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(4243)");
    const user = await findManaged(req, res, c);
    if (!user) return;
    if (user.id === req.user.id) throw new ValidationError("O'zingizni o'chira olmaysiz");
    if (isHqAdmin(user) && !(await adminsLeft(user.id, c))) throw new ValidationError("Kamida bitta faol bosh administrator qolishi kerak");
    await q("DELETE FROM users WHERE id = $1", [user.id], c);
    return user;
  });
  if (!user || res.headersSent) return;
  await audit(req, { action: "delete", entity: "user", entityId: user.id, label: user.username, before: publicUser(user), factoryId: user.factoryId });
  res.json({ ok: true });
});

/* ---------- O'zgarishlar jurnali ---------- */
app.get("/api/audit", adminOnly, async (req, res) => {
  const { entity, user, action, from, to, before } = req.query;
  const where = [];
  const p = [];
  const add = (sql, v) => {
    p.push(v);
    where.push(sql.replace("?", `$${p.length}`));
  };
  if (req.user.factoryId) add("factory_id = ?", req.user.factoryId);
  else if (isId(req.query.factory)) add("factory_id = ?", req.query.factory);
  if (typeof entity === "string" && entity) add("entity = ?", entity);
  if (typeof action === "string" && action) add("action = ?", action);
  if (typeof user === "string" && user) add(`"user"->>'id' = ?`, user);
  if (validDate(from)) add("created_at >= ?", `${from}T00:00:00+05:00`);
  if (validDate(to)) add("created_at <= ?", `${to}T23:59:59.999+05:00`);
  if (typeof before === "string" && !Number.isNaN(Date.parse(before))) add("created_at < ?", new Date(before));
  const limit = Math.min(200, Math.max(1, +req.query.limit || 50));
  const list = await rows(`SELECT * FROM audit_log ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC, id DESC LIMIT ${limit + 1}`, p);
  res.json({ items: list.slice(0, limit).map((x) => ({ ...x, id: String(x.id) })), hasMore: list.length > limit });
});

/* ---------- Zaxira nusxa (bosh ofis admini: hamma zavod; zavod admini: o'z zavodi) ---------- */
export const BACKUP_TABLES = ["factories", "settings", "materials", "products", "days", "orders", "targets", "inventories", "movements", "suppliers", "product_moves", "vehicle_logs", "acct_reports", "month_plans", "counters", "hr_departments", "hr_employees", "hr_rates", "hr_months", "hr_payments", "hr_events", "hr_records", "hr_leave_allowances", "hr_employers", "hr_employment_docs", "hr_employee_files", "hr_company_files", "dispatch_documents", "finance_order_progress", "finance_invoices", "finance_receipts", "factory_imports", "material_invoices"];
app.get("/api/backup", adminOnly, async (req, res) => {
  const fid = req.user.factoryId;
  const data = await tx(async (c) => {
    await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
    const data = {};
    for (const t of BACKUP_TABLES) {
      const col = t === "factories" ? "id" : "factory_id";
      data[t] = (await q(`SELECT * FROM ${t} ${fid ? `WHERE ${col} = $1` : ""}`, fid ? [fid] : [], c)).rows;
    }
    data.users = (await q(`SELECT id, username, name, role, factory_id, active, must_change_password, last_login_at, created_at, updated_at FROM users ${fid ? "WHERE factory_id = $1" : ""}`, fid ? [fid] : [], c)).rows;
    return data;
  });
  const now = new Date();
  const stamp = new Date(now.getTime() + 5 * 36e5).toISOString().slice(0, 16).replace(/[T:]/g, "-");
  const counts = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length]));
  await audit(req, { action: "backup", entity: "backup", label: Object.entries(counts).map(([k, n]) => `${k}: ${n}`).join(", ").slice(0, 200), factoryId: fid });
  res.setHeader("Content-Disposition", `attachment; filename="zavod-backup-${stamp}.json"`);
  res.json({ app: "zavodlar", format: 2, db: "postgres", createdAt: now.toISOString(), createdBy: req.user.username, scope: fid || "all", counts, data });
});

/* ---------- bo'limlar ---------- */
app.use("/api", catalog);
app.use("/api", production);
app.use("/api", store);
app.use("/api", overview);
app.use("/api", reports);

/* ---------- 404 va xatolar ---------- */
app.use("/api", (_req, res) => res.status(404).json({ error: "Bunday API yo'li yo'q" }));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
  if (err instanceof ConflictError) return res.status(409).json({ error: err.message, code: "conflict" });
  if (err?.type === "entity.parse.failed") return res.status(400).json({ error: "JSON noto'g'ri" });
  if (err?.type === "entity.too.large") return res.status(413).json({ error: "Fayl yoki so‘rov hajmi ruxsat etilgan chegaradan oshdi" });
  // PostgreSQL xatolari
  if (err?.code === "23505") return res.status(409).json({ error: "Bunday yozuv allaqachon bor" });
  if (err?.code === "23503") return res.status(409).json({ error: "Bog'langan yozuv bor yoki topilmadi" });
  if (err?.code === "23514" || err?.code === "22P02" || err?.code === "23502") return res.status(400).json({ error: "Noto'g'ri qiymat" });
  console.error(err);
  if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|password authentication|database ".*" does not exist|DATABASE_URL/i.test(String(err?.message))) {
    return res.status(503).json({ error: "Ma'lumotlar bazasiga ulanib bo'lmadi — DATABASE_URL ni tekshiring (batafsil: /api/health)" });
  }
  res.status(500).json({ error: "Serverda xatolik" });
});

export default app;
