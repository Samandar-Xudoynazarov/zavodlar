// Buxgalteriya material hisoboti va tasdiqlangan oylik ishlab chiqarish rejasi (har zavodga alohida)
import { Router } from "express";
import { q, one, rows } from "../db.js";
import { WRITE_ROLES, MPLAN_ROLES } from "../auth.js";
import { audit } from "../audit.js";
import { isId, validDate, validMonth } from "../valid.js";
import { notFound, who } from "../common.js";

const r = Router();
const MONTH_RE = { test: validMonth };
const badMonth = (res) => res.status(400).json({ error: "Oy formati YYYY-MM" });

/* ---------- Buxgalteriya: oylik material hisoboti ---------- */
// Saqlash — buxgalter, ПТО, admin, rahbar (app.js: ACCT_ROLES); ko'rish — hamma
// Saqlangan hisobot (bo'lmasa null) va oldingi hisobotdagi imzo qo'yuvchilar — yangi oy uchun
r.get("/acct-reports/:month", async (req, res) => {
  const month = req.params.month;
  if (!MONTH_RE.test(month)) return badMonth(res);
  const f = req.factoryId;
  const [report, last] = await Promise.all([
    one("SELECT * FROM acct_reports WHERE factory_id = $1 AND month = $2", [f, month]),
    // imzolar — shu oydan OLDINGI eng oxirgi hisobotdan (kelajakdagi oy hisobotidan emas)
    one("SELECT director, chief, accountant FROM acct_reports WHERE factory_id = $1 AND month < $2 ORDER BY month DESC LIMIT 1", [f, month]),
  ]);
  res.json({ report, lastSigners: last ? { director: last.director, chief: last.chief, accountant: last.accountant } : null });
});
r.put("/acct-reports/:month", async (req, res) => {
  const month = req.params.month;
  if (!MONTH_RE.test(month)) return badMonth(res);
  const b = req.body || {};
  if (b.date && !validDate(b.date)) return res.status(400).json({ error: "Sana formati YYYY-MM-DD" });
  if (!Array.isArray(b.rows) || b.rows.length > 300) return res.status(400).json({ error: "Qatorlar ro'yxati noto'g'ri" });
  const pos = (v) => Math.max(0, +v || 0);
  const list = b.rows.map((x) => ({
    productId: isId(x?.productId) ? x.productId : null,
    name: String(x?.name ?? "").trim().slice(0, 200),
    unit: String(x?.unit ?? "м3").trim().slice(0, 20),
    qty: pos(x?.qty),
    m3: pos(x?.m3),
    unitCost: pos(x?.unitCost),
    unitPrice: pos(x?.unitPrice),
  }));
  const f = req.factoryId;
  const before = await one("SELECT * FROM acct_reports WHERE factory_id = $1 AND month = $2", [f, month]);
  const doc = await one(
    `INSERT INTO acct_reports (factory_id, month, date, rows, other_costs, director, chief, accountant, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (factory_id, month) DO UPDATE SET date = EXCLUDED.date, rows = EXCLUDED.rows, other_costs = EXCLUDED.other_costs,
       director = EXCLUDED.director, chief = EXCLUDED.chief, accountant = EXCLUDED.accountant, updated_by = EXCLUDED.updated_by, updated_at = now()
     RETURNING *`,
    [f, month, b.date || "", JSON.stringify(list), +b.otherCosts || 0, String(b.director ?? "").slice(0, 120), String(b.chief ?? "").slice(0, 120), String(b.accountant ?? "").slice(0, 120), who(req.user)]
  );
  await audit(req, { action: before ? "update" : "create", entity: "acct", entityId: month, label: `Material hisoboti ${month}`, before, after: doc });
  res.json(doc);
});
r.delete("/acct-reports/:month", async (req, res) => {
  const doc = await one("DELETE FROM acct_reports WHERE factory_id = $1 AND month = $2 RETURNING *", [req.factoryId, String(req.params.month)]);
  if (!doc) return notFound(res);
  await audit(req, { action: "delete", entity: "acct", entityId: doc.month, label: `Material hisoboti ${doc.month}`, before: doc });
  res.json({ ok: true });
});

/* ---------- Oylik ishlab chiqarish rejasi (rahbar tasdiqlagan) ---------- */
// Excel'dan yuklangan yoki qo'lda tuzilgan reja. Saqlash — ПТО, admin, rahbar, usta; o'chirish — usta'siz; ko'rish — hamma
const num0 = (v, max = 1e7) => {
  const n = +v;
  return Number.isFinite(n) ? Math.min(max, Math.max(-max, Math.round(n * 1000) / 1000)) : 0;
};
const cleanLabels = (arr, max) => (Array.isArray(arr) ? arr.slice(0, max).map((x) => String(x ?? "").trim().slice(0, 80)) : []);
function cleanMonthPlan(b, month) {
  const customers = cleanLabels(b.customers, 12);
  const extraCols = cleanLabels(b.extraCols, 4);
  if (!Array.isArray(b.rows) || b.rows.length > 400) return { error: "Qatorlar ro'yxati noto'g'ri" };
  const [y, m] = month.split("-").map(Number);
  const nDays = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const list = b.rows.map((x) => ({
    productId: isId(x?.productId) ? x.productId : null,
    name: String(x?.name ?? "").trim().slice(0, 200),
    unit: String(x?.unit ?? "шт").trim().slice(0, 20) || "шт",
    orders: customers.map((_, i) => Math.max(0, num0(x?.orders?.[i]))),
    shipped: Math.max(0, num0(x?.shipped)),
    extra: extraCols.map((_, i) => num0(x?.extra?.[i])),
    days: Array.from({ length: nDays }, (_, i) => Math.max(0, num0(x?.days?.[i], 1e5))),
    m3: Math.max(0, num0(x?.m3, 1000)),
    note: String(x?.note ?? "").slice(0, 300),
  }));
  if (list.some((x) => !x.productId && !x.name)) return { error: "Har bir qatorda mahsulot tanlang yoki nomini yozing" };
  return {
    data: {
      title: String(b.title ?? "").trim().slice(0, 200),
      source: ["excel", "qolda", "dastur"].includes(b.source) ? b.source : "qolda",
      fileName: String(b.fileName ?? "").slice(0, 200),
      note: String(b.note ?? "").slice(0, 1000),
      customers,
      extraCols,
      rows: list,
    },
  };
}
// saqlash — ПТО, admin, rahbar va usta; o'chirish — usta'siz
const planOnly = (req, res, next) => (MPLAN_ROLES.includes(req.user.role) ? next() : res.status(403).json({ error: "Sizda bu amal uchun ruxsat yo'q" }));
const writeOnly = (req, res, next) => (WRITE_ROLES.includes(req.user.role) ? next() : res.status(403).json({ error: "Sizda bu amal uchun ruxsat yo'q" }));

// oylar ro'yxati (qaysi oylarga reja bor)
r.get("/month-plans", async (req, res) => {
  const list = await rows("SELECT month, title, source, rows, updated_at, updated_by FROM month_plans WHERE factory_id = $1 ORDER BY month DESC", [req.factoryId]);
  res.json(
    list.map((p) => ({
      month: p.month,
      title: p.title,
      source: p.source,
      rows: (p.rows || []).length,
      total: (p.rows || []).reduce((s, x) => s + (x.days || []).reduce((a, d) => a + (+d || 0), 0), 0),
      updatedAt: p.updatedAt,
      updatedBy: p.updatedBy,
    }))
  );
});
r.get("/month-plans/:month", async (req, res) => {
  const month = req.params.month;
  if (!MONTH_RE.test(month)) return badMonth(res);
  res.json({ plan: await one("SELECT * FROM month_plans WHERE factory_id = $1 AND month = $2", [req.factoryId, month]) });
});
r.put("/month-plans/:month", planOnly, async (req, res) => {
  const month = req.params.month;
  if (!MONTH_RE.test(month)) return badMonth(res);
  const c = cleanMonthPlan(req.body || {}, month);
  if (c.error) return res.status(400).json({ error: c.error });
  const f = req.factoryId;
  const ids = [...new Set(c.data.rows.filter((x) => x.productId).map((x) => x.productId))];
  if (ids.length && (await q("SELECT count(*) AS n FROM products WHERE factory_id = $1 AND id = ANY($2::uuid[])", [f, ids])).rows[0].n !== ids.length)
    return res.status(400).json({ error: "Mahsulot topilmadi" });
  const d = c.data;
  const before = await one("SELECT * FROM month_plans WHERE factory_id = $1 AND month = $2", [f, month]);
  const doc = await one(
    `INSERT INTO month_plans (factory_id, month, title, source, file_name, note, customers, extra_cols, rows, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (factory_id, month) DO UPDATE SET title = EXCLUDED.title, source = EXCLUDED.source, file_name = EXCLUDED.file_name, note = EXCLUDED.note,
       customers = EXCLUDED.customers, extra_cols = EXCLUDED.extra_cols, rows = EXCLUDED.rows, updated_by = EXCLUDED.updated_by, updated_at = now()
     RETURNING *`,
    [f, month, d.title, d.source, d.fileName, d.note, JSON.stringify(d.customers), JSON.stringify(d.extraCols), JSON.stringify(d.rows), who(req.user)]
  );
  await audit(req, { action: before ? "update" : "create", entity: "mplan", entityId: month, label: `Oylik reja ${month}`, before, after: doc });
  res.json(doc);
});
r.delete("/month-plans/:month", writeOnly, async (req, res) => {
  const doc = await one("DELETE FROM month_plans WHERE factory_id = $1 AND month = $2 RETURNING *", [req.factoryId, String(req.params.month)]);
  if (!doc) return notFound(res);
  await audit(req, { action: "delete", entity: "mplan", entityId: doc.month, label: `Oylik reja ${doc.month}`, before: doc });
  res.json({ ok: true });
});

export default r;
