// Ombor: sex va texnika, kirim/chiqim, texnika hisobi, inventarizatsiya, ta'minotchilar
import { Router } from "express";
import { q, one, rows, tx } from "../db.js";
import { WRITE_ROLES } from "../auth.js";
import { audit } from "../audit.js";
import { SPEC, clean, insertSql, updateSql, isId, validDate, ValidationError, MOVE_TYPES, MATERIAL_GROUPS, VEHICLE_LOG_KINDS } from "../valid.js";
import { openingOf, loadDays, loadMoves, nextNo, notFound, todayTashkent, round3, round6, who } from "../common.js";
import { stockReport } from "../stock.js";
import { vehicleStats } from "../fleet.js";
import { meterFactor } from "../metal.js";

const r = Router();
const OPEN0 = "0000-00-00";
const NORM = (x) => `lower(regexp_replace(btrim(${x}), '\\s+', ' ', 'g'))`;
const normName = (s) => String(s ?? "").trim().replace(/\s+/g, " ");

/* ---------- qoldiq tekshiruvi ---------- */
/**
 * Materialning `date` kunidan boshlab (kelajakdagi yozuvlar ham) har bir kun oxiridagi eng kichik qoldig'i.
 * Chiqim (yoki kirimni bekor qilish) shu kundan keyingi birorta kunni ham minusga tushirmasligi kerak.
 */
async function minBalanceFrom(f, materialId, date, client) {
  const opening = await openingOf(f, client);
  const start = opening.date || OPEN0;
  const [days, moves] = await Promise.all([
    q("SELECT date, materials FROM days WHERE factory_id = $1 AND date >= $2 AND materials @> $3::jsonb", [f, start, JSON.stringify([{ materialId }])], client),
    q("SELECT date, type, qty FROM movements WHERE factory_id = $1 AND material_id = $2 AND date >= $3", [f, materialId, start], client),
  ]);
  const delta = new Map();
  const add = (d, v) => delta.set(d, (delta.get(d) || 0) + v);
  for (const d of days.rows) for (const l of d.materials || []) if (String(l.materialId) === materialId) add(d.date, (+l.kirim || 0) - (+l.sarf || 0));
  for (const m of moves.rows) add(m.date, m.type === "in" ? +m.qty : -m.qty);
  // eng kichik qoldiq: `date` kuni oxiridagi qoldiq va undan keyingi har bir harakatli kun oxiridagi qoldiq.
  // (`date` kuni boshqa harakat bo'lmasa ham uning qoldig'i hisobga olinadi — aks holda keyingi kirim
  // eski sanadagi yetishmovchilikni yashirib qo'yardi)
  let bal = +opening.materials?.[materialId] || 0;
  let min = null;
  for (const d of [...delta.keys()].sort()) {
    if (d > date && min === null) min = bal; // `date` kuni oxiridagi qoldiq
    bal += delta.get(d);
    if (d >= date) min = Math.min(min ?? bal, bal);
  }
  return round6(min === null ? bal : Math.min(min, bal));
}
// bir material bo'yicha yozuvlar navbat bilan (parallel ikki chiqim qoldiqdan o'tib ketmasin)
const lockMaterial = (c, id) => c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`mat:${id}`]);

/* ---------- Sex va texnika ---------- */
r.get("/targets", async (req, res) => {
  res.json(await rows("SELECT * FROM targets WHERE factory_id = $1 ORDER BY kind, archived, name", [req.factoryId]));
});
r.post("/targets", async (req, res) => {
  const s = insertSql("targets", { factoryId: req.factoryId, ...clean(SPEC.target, req.body) });
  const doc = await one(s.text, s.values);
  await audit(req, { action: "create", entity: "target", entityId: doc.id, label: doc.name, after: doc });
  res.status(201).json(doc);
});
r.put("/targets/:id", async (req, res) => {
  if (!isId(req.params.id)) return notFound(res);
  const before = await one("SELECT * FROM targets WHERE id = $1 AND factory_id = $2", [req.params.id, req.factoryId]);
  if (!before) return notFound(res);
  const data = clean(SPEC.target, req.body, { partial: true });
  delete data.kind;
  if (!Object.keys(data).length) return res.json(before);
  const s = updateSql("targets", req.params.id, req.factoryId, data);
  const doc = await one(s.text, s.values);
  await audit(req, { action: "update", entity: "target", entityId: doc.id, label: doc.name, before, after: doc });
  res.json(doc);
});
r.delete("/targets/:id", async (req, res) => {
  if (!isId(req.params.id)) return notFound(res);
  const doc = await one("SELECT * FROM targets WHERE id = $1 AND factory_id = $2", [req.params.id, req.factoryId]);
  if (!doc) return notFound(res);
  const used = (await q("SELECT 1 FROM movements WHERE department_id = $1 OR vehicle_id = $1 UNION ALL SELECT 1 FROM vehicle_logs WHERE vehicle_id = $1 LIMIT 1", [doc.id])).rowCount;
  if (used) {
    await q("UPDATE targets SET archived = true, updated_at = now() WHERE id = $1", [doc.id]);
    await audit(req, { action: "update", entity: "target", entityId: doc.id, label: doc.name, changes: [{ p: "archived", a: false, b: true }] });
    return res.json({ ok: true, archived: true });
  }
  await q("DELETE FROM targets WHERE id = $1", [doc.id]);
  await audit(req, { action: "delete", entity: "target", entityId: doc.id, label: doc.name, before: doc });
  res.json({ ok: true });
});

/* ---------- Kirim / chiqim ---------- */
const moveLabel = (m, mat) => `${m.type === "in" ? "Kirim" : "Chiqim"}: ${mat?.name || "?"} ${m.qty} ${mat?.unit || ""}`.trim();

// ?from=&to=&type=&materialId=&targetId=&limit=&page=
r.get("/movements", async (req, res) => {
  const { from, to, type, materialId, targetId } = req.query;
  const where = ["factory_id = $1"];
  const p = [req.factoryId];
  const add = (sql, v) => {
    p.push(v);
    where.push(sql.replaceAll("?", `$${p.length}`));
  };
  if (validDate(from)) add("date >= ?", from);
  if (validDate(to)) add("date <= ?", to);
  if (MOVE_TYPES.includes(type)) add("type = ?", type);
  if (isId(materialId)) add("material_id = ?", materialId);
  if (isId(targetId)) add("(department_id = ? OR vehicle_id = ?)", targetId);
  const limit = Math.min(2000, Math.max(1, +req.query.limit || 100));
  const page = Math.max(1, +req.query.page || 1);
  const list = await rows(`SELECT * FROM movements WHERE ${where.join(" AND ")} ORDER BY date DESC, created_at DESC, id LIMIT ${limit + 1} OFFSET ${(page - 1) * limit}`, p);
  res.json({ items: list.slice(0, limit), hasMore: list.length > limit, page });
});

r.post("/movements", async (req, res) => {
  const b = req.body || {};
  const f = req.factoryId;
  if (!MOVE_TYPES.includes(b.type)) return res.status(400).json({ error: "Harakat turi noto'g'ri (kirim yoki chiqim)" });
  const today = todayTashkent();
  const date = b.date === undefined || b.date === "" ? today : b.date;
  if (!validDate(date)) return res.status(400).json({ error: "Sana formati YYYY-MM-DD" });
  if (date > today) return res.status(400).json({ error: "Kelajakdagi sana bilan yozib bo'lmaydi" });
  if (!isId(b.materialId)) return res.status(400).json({ error: "Materialni tanlang" });
  const mat = await one("SELECT * FROM materials WHERE id = $1 AND factory_id = $2", [b.materialId, f]);
  if (!mat || mat.archived) return res.status(400).json({ error: "Material topilmadi" });
  if (!mat.stock) return res.status(400).json({ error: "Bu material omborda hisobga olinmaydi" });

  // metrda yozilgan bo'lsa — koeffitsiyent serverda hisoblanadi (brauzerga ishonilmaydi)
  let qty;
  let conv = {};
  if (b.inputUnit === "m") {
    const fc = meterFactor(mat);
    if (!fc) return res.status(400).json({ error: "Bu material uchun metrdan aylantirish koeffitsiyenti yo'q" });
    const inputQty = round3(+b.inputQty);
    if (!(inputQty > 0)) return res.status(400).json({ error: "Miqdorni to'g'ri kiriting" });
    qty = Math.round(inputQty * fc.perM * 1e6) / 1e6;
    conv = { inputQty, inputUnit: "m", factor: fc.perM };
  } else qty = round3(+b.qty);
  if (!(qty > 0)) return res.status(400).json({ error: "Miqdorni to'g'ri kiriting" });

  const data = { factoryId: f, type: b.type, date, materialId: mat.id, qty, ...conv, note: String(b.note ?? "").trim().slice(0, 300), person: String(b.person ?? "").trim().slice(0, 120) };
  if (b.type === "in") {
    data.price = Math.max(0, +b.price || 0);
    data.supplier = normName(b.supplier).slice(0, 160);
    data.docNumber = String(b.docNumber ?? "").trim().slice(0, 60);
  } else {
    for (const [k, kind] of [["departmentId", "department"], ["vehicleId", "vehicle"]]) {
      if (b[k] === undefined || b[k] === null || b[k] === "") continue;
      if (!isId(b[k]) || !(await q("SELECT 1 FROM targets WHERE id = $1 AND factory_id = $2 AND kind = $3", [b[k], f, kind])).rowCount)
        return res.status(400).json({ error: kind === "vehicle" ? "Texnika topilmadi" : "Bo'lim topilmadi" });
      data[k] = b[k];
    }
    if (!data.departmentId && !data.vehicleId && !data.person) return res.status(400).json({ error: "Qayerga ketganini kiriting: bo'lim, texnika yoki mas'ul shaxs" });
    if (data.vehicleId && b.meter !== undefined && b.meter !== null && b.meter !== "") {
      const meter = round3(+b.meter);
      if (!(meter >= 0)) return res.status(400).json({ error: "Spidometr / motosoat ko'rsatkichi noto'g'ri" });
      const last = await lastMeter(data.vehicleId);
      if (last && last.meter > meter && last.date <= date) return res.status(400).json({ error: `Ko'rsatkich oldingisidan kam bo'lishi mumkin emas (${last.meter}, ${last.date})` });
      data.meter = meter;
    }
    data.price = +mat.price || 0;
  }
  data.createdBy = who(req.user);
  const doc = await tx(async (c) => {
    if (b.type === "out") {
      await lockMaterial(c, mat.id);
      // shu kundan keyingi hech bir kun minusga tushmasin (orqa sana bilan yozilgan chiqim ham)
      const min = await minBalanceFrom(f, mat.id, date, c);
      if (min + 1e-9 < qty) throw new ValidationError(`Omborda yetarli emas. Qoldiq: ${round3(Math.max(0, min))} ${mat.unit}`);
    }
    const s = insertSql("movements", data);
    return one(s.text, s.values, c);
  });
  if (data.supplier) await rememberSupplier(f, data.supplier);
  await audit(req, { action: "create", entity: "movement", entityId: doc.id, label: moveLabel(doc, mat), after: doc });
  res.status(201).json(doc);
});

// Bekor qilish: admin va ПТО — istalganini; omborchi — o'zi kiritganini 24 soat ichida
r.delete("/movements/:id", async (req, res) => {
  if (!isId(req.params.id)) return notFound(res);
  const f = req.factoryId;
  const doc = await one("SELECT * FROM movements WHERE id = $1 AND factory_id = $2", [req.params.id, f]);
  if (!doc) return notFound(res);
  const u = req.user;
  if (doc.reason === "inventar") return res.status(400).json({ error: "Bu inventarizatsiya to'g'rilashi — uni inventarizatsiya bo'limida bekor qiling" });
  if (!WRITE_ROLES.includes(u.role)) {
    const own = doc.createdBy?.id === u.id;
    if (!own || Date.now() - doc.createdAt > 24 * 36e5) return res.status(403).json({ error: "Faqat o'zingiz kiritgan yozuvni 24 soat ichida bekor qila olasiz" });
  }
  const mat = await one("SELECT name, unit FROM materials WHERE id = $1", [doc.materialId]);
  await tx(async (c) => {
    if (doc.type === "in") {
      await lockMaterial(c, doc.materialId);
      const min = await minBalanceFrom(f, doc.materialId, doc.date, c);
      if (min + 1e-9 < doc.qty) throw new ValidationError("Bu kirimdan keyin material ishlatilgan — bekor qilsangiz qoldiq manfiy bo'lib qoladi");
    }
    await c.query("DELETE FROM movements WHERE id = $1", [doc.id]);
  });
  await audit(req, { action: "delete", entity: "movement", entityId: doc.id, label: moveLabel(doc, mat), before: doc });
  res.json({ ok: true });
});

/* ---------- Texnika hisobi ---------- */
async function lastMeter(vehicleId) {
  const x = await one(
    `SELECT date, meter FROM (
       SELECT date, meter, created_at FROM movements WHERE vehicle_id = $1 AND meter IS NOT NULL
       UNION ALL
       SELECT date, meter, created_at FROM vehicle_logs WHERE vehicle_id = $1 AND meter IS NOT NULL
     ) t ORDER BY date DESC, meter DESC LIMIT 1`,
    [vehicleId]
  );
  return x ? { meter: x.meter, date: x.date } : null;
}
async function fleetData(f, to, vehicleId) {
  const [vehicles, moves, logs] = await Promise.all([
    rows(`SELECT * FROM targets WHERE factory_id = $1 AND kind = 'vehicle' ${vehicleId ? "AND id = $2" : ""} ORDER BY archived, name`, vehicleId ? [f, vehicleId] : [f]),
    rows(
      `SELECT m.id, m.date, m.created_at, m.qty, m.price, m.meter, m.material_id, m.vehicle_id, m.note, m.person, m.created_by, m.reason, mt.grp AS "group"
         FROM movements m JOIN materials mt ON mt.id = m.material_id
        WHERE m.factory_id = $1 AND m.type = 'out' AND m.date <= $2 AND ${vehicleId ? "m.vehicle_id = $3" : "m.vehicle_id IS NOT NULL"}`,
      vehicleId ? [f, to, vehicleId] : [f, to]
    ),
    rows(`SELECT * FROM vehicle_logs WHERE factory_id = $1 AND date <= $2 ${vehicleId ? "AND vehicle_id = $3" : ""}`, vehicleId ? [f, to, vehicleId] : [f, to]),
  ]);
  return { vehicles, moves, logs };
}
const vInfo = (v) => ({ id: v.id, meterUnit: v.meterUnit, fuelNorm: v.fuelNorm || 0, serviceEvery: v.serviceEvery || 0 });

r.get("/vehicles/report", async (req, res) => {
  const { from, to } = req.query;
  if (!validDate(from) || !validDate(to) || from > to) return res.status(400).json({ error: "from va to sanalarini YYYY-MM-DD formatida bering" });
  const { vehicles, moves, logs } = await fleetData(req.factoryId, to);
  const by = (arr, v) => arr.filter((x) => x.vehicleId === v.id);
  res.json(
    vehicles.map((v) => ({
      vehicle: { id: v.id, name: v.name, code: v.code, archived: v.archived, meterUnit: v.meterUnit || "km", fuelNorm: v.fuelNorm || 0, serviceEvery: v.serviceEvery || 0 },
      ...vehicleStats(vInfo(v), by(moves, v), by(logs, v), from, to),
    }))
  );
});
r.get("/vehicles/:id", async (req, res) => {
  const { from, to } = req.query;
  if (!isId(req.params.id)) return notFound(res);
  if (!validDate(from) || !validDate(to) || from > to) return res.status(400).json({ error: "from va to sanalarini YYYY-MM-DD formatida bering" });
  const { vehicles, moves, logs } = await fleetData(req.factoryId, to, req.params.id);
  const v = vehicles[0];
  if (!v) return notFound(res);
  const stats = vehicleStats(vInfo(v), moves, logs, from, to);
  const inP = (x) => x.date >= from && x.date <= to;
  const desc = (a, b) => b.date.localeCompare(a.date) || String(b.createdAt?.toISOString?.() || "").localeCompare(String(a.createdAt?.toISOString?.() || ""));
  res.json({ ...stats, moves: moves.filter(inP).sort(desc), logs: logs.filter(inP).sort(desc) });
});
r.get("/vehicles/:id/last", async (req, res) => {
  if (!isId(req.params.id)) return notFound(res);
  if (!(await q("SELECT 1 FROM targets WHERE id = $1 AND factory_id = $2", [req.params.id, req.factoryId])).rowCount) return notFound(res);
  res.json(await lastMeter(req.params.id));
});
r.post("/vehicle-logs", async (req, res) => {
  const b = req.body || {};
  const f = req.factoryId;
  const v = isId(b.vehicleId) ? await one("SELECT * FROM targets WHERE id = $1 AND factory_id = $2 AND kind = 'vehicle'", [b.vehicleId, f]) : null;
  if (!v) return res.status(400).json({ error: "Texnika topilmadi" });
  const date = b.date === undefined || b.date === "" ? todayTashkent() : b.date;
  if (!validDate(date) || date > todayTashkent()) return res.status(400).json({ error: "Sana noto'g'ri" });
  const kind = VEHICLE_LOG_KINDS.includes(b.kind) ? b.kind : "tamir";
  const data = { factoryId: f, vehicleId: v.id, date, kind, cost: Math.max(0, Math.round(+b.cost || 0)), note: String(b.note ?? "").trim().slice(0, 300), createdBy: who(req.user) };
  if (b.meter !== undefined && b.meter !== null && b.meter !== "") {
    const meter = round3(+b.meter);
    if (!(meter >= 0)) return res.status(400).json({ error: "Spidometr / motosoat ko'rsatkichi noto'g'ri" });
    const last = await lastMeter(v.id);
    if (last && last.meter > meter && last.date <= date) return res.status(400).json({ error: `Ko'rsatkich oldingisidan kam bo'lishi mumkin emas (${last.meter}, ${last.date})` });
    data.meter = meter;
  } else if (kind === "meter") return res.status(400).json({ error: "Ko'rsatkichni kiriting" });
  const s = insertSql("vehicle_logs", data);
  const doc = await one(s.text, s.values);
  await audit(req, { action: "create", entity: "vehicleLog", entityId: doc.id, label: `${v.name}: ${kind} ${date}`, after: doc });
  res.status(201).json(doc);
});
r.delete("/vehicle-logs/:id", async (req, res) => {
  if (!isId(req.params.id)) return notFound(res);
  const doc = await one("SELECT * FROM vehicle_logs WHERE id = $1 AND factory_id = $2", [req.params.id, req.factoryId]);
  if (!doc) return notFound(res);
  if (!WRITE_ROLES.includes(req.user.role) && (doc.createdBy?.id !== req.user.id || Date.now() - doc.createdAt > 24 * 36e5))
    return res.status(403).json({ error: "Faqat o'zingiz kiritgan yozuvni 24 soat ichida bekor qila olasiz" });
  await q("DELETE FROM vehicle_logs WHERE id = $1", [doc.id]);
  await audit(req, { action: "delete", entity: "vehicleLog", entityId: doc.id, label: `${doc.kind} ${doc.date}`, before: doc });
  res.json({ ok: true });
});

/* ---------- Inventarizatsiya ---------- */
// Omborchi (yoki ПТО) sanaydi va qoralama sifatida saqlaydi; ПТО yoki admin tasdiqlaganda farqlar
// kirim (ortiqcha) / chiqim (kamomad) harakati sifatida yoziladi — bitta tranzaksiyada.
async function stockAt(f, date, client) {
  const opening = await openingOf(f, client);
  const start = opening.date || OPEN0;
  const [days, moves] = await Promise.all([loadDays(f, start, date, client), loadMoves(f, start, date, client)]);
  return stockReport(opening, days, date, date, moves).materials;
}
const invLabel = (d) => `Inventarizatsiya №${d.no} (${d.date})`;
const invOut = (d) => ({ ...d, group: d.group ?? "" });
async function invView(doc, user, f) {
  const o = invOut(structuredClone(doc));
  if (o.status === "draft") {
    const st = await stockAt(f, o.date);
    for (const l of o.lines) l.system = round6(st[String(l.materialId)]?.end || 0);
  }
  if (o.blind && o.status === "draft" && !WRITE_ROLES.includes(user.role)) for (const l of o.lines) l.system = null;
  return o;
}

r.get("/inventories", async (req, res) => {
  const list = await rows("SELECT * FROM inventories WHERE factory_id = $1 ORDER BY no DESC LIMIT 200", [req.factoryId]);
  res.json(
    list.map(({ lines, ...d }) => {
      const counted = lines.filter((l) => l.actual !== null && l.actual !== undefined);
      const diff = (sign) => counted.reduce((s, l) => { const x = (l.actual - l.system) * (l.price || 0); return s + (sign * x > 0 ? Math.abs(x) : 0); }, 0);
      return { ...invOut(d), total: lines.length, counted: counted.length, shortage: d.status === "done" ? Math.round(diff(-1)) : null, surplus: d.status === "done" ? Math.round(diff(1)) : null };
    })
  );
});
r.get("/inventories/:id", async (req, res) => {
  if (!isId(req.params.id)) return notFound(res);
  const doc = await one("SELECT * FROM inventories WHERE id = $1 AND factory_id = $2", [req.params.id, req.factoryId]);
  if (!doc) return notFound(res);
  res.json(await invView(doc, req.user, req.factoryId));
});
r.post("/inventories", async (req, res) => {
  const b = req.body || {};
  const f = req.factoryId;
  const date = b.date || todayTashkent();
  if (!validDate(date) || date > todayTashkent()) return res.status(400).json({ error: "Inventarizatsiya sanasi noto'g'ri" });
  const group = MATERIAL_GROUPS.includes(b.group) ? b.group : "";
  if ((await q("SELECT 1 FROM inventories WHERE factory_id = $1 AND status = 'draft'", [f])).rowCount) return res.status(400).json({ error: "Tugallanmagan inventarizatsiya bor — avval uni tasdiqlang yoki o'chiring" });
  const mats = await rows(`SELECT id, price FROM materials WHERE factory_id = $1 AND stock AND NOT archived ${group ? "AND grp = $2" : ""} ORDER BY grp, sort, name`, group ? [f, group] : [f]);
  if (!mats.length) return res.status(400).json({ error: "Sanash uchun material yo'q" });
  const st = await stockAt(f, date);
  const doc = await tx(async (c) => {
    const s = insertSql("inventories", {
      factoryId: f,
      no: await nextNo(f, "inventory", "inventories", c),
      date,
      group,
      blind: Boolean(b.blind) && WRITE_ROLES.includes(req.user.role),
      note: String(b.note ?? "").trim().slice(0, 500),
      lines: mats.map((m) => ({ materialId: m.id, system: round6(st[m.id]?.end || 0), actual: null, price: +m.price || 0 })),
      createdBy: who(req.user),
    });
    return one(s.text, s.values, c);
  });
  await audit(req, { action: "create", entity: "inventory", entityId: doc.id, label: invLabel(doc) });
  res.status(201).json(await invView(doc, req.user, f));
});
// sanalgan miqdorlarni saqlash (faqat qoralama): { lines: [{ materialId, actual }], note }
r.put("/inventories/:id", async (req, res) => {
  if (!isId(req.params.id)) return notFound(res);
  const b = req.body || {};
  if (b.lines !== undefined && !Array.isArray(b.lines)) return res.status(400).json({ error: "«lines» ro'yxat (massiv) bo'lishi kerak" });
  // ikki xodim bir vaqtda sanasa, biri ikkinchisinikini o'chirmasin: hujjat qulflanadi, faqat yuborilgan qatorlar o'zgaradi
  const r0 = await tx(async (c) => {
    const doc = await one("SELECT * FROM inventories WHERE id = $1 AND factory_id = $2 FOR UPDATE", [req.params.id, req.factoryId], c);
    if (!doc) return null;
    if (doc.status !== "draft") throw new ValidationError("Tasdiqlangan inventarizatsiyani o'zgartirib bo'lmaydi");
    const byMat = new Map(doc.lines.map((l) => [String(l.materialId), l]));
    const changed = [];
    for (const x of b.lines || []) {
      const l = byMat.get(String(x?.materialId));
      if (!l) continue;
      let v = null;
      if (!(x.actual === null || x.actual === "" || x.actual === undefined)) {
        v = +x.actual;
        if (!Number.isFinite(v) || v < 0) throw new ValidationError("Manfiy son kiritib bo'lmaydi");
        v = round6(v);
      }
      if (v !== l.actual) changed.push({ id: String(l.materialId), a: l.actual ?? null, b: v });
      l.actual = v;
    }
    const note = b.note !== undefined ? String(b.note).trim().slice(0, 500) : doc.note;
    const nd = await one("UPDATE inventories SET lines = $2, note = $3, updated_at = now() WHERE id = $1 RETURNING *", [doc.id, JSON.stringify(doc.lines), note], c);
    return { doc, nd, changed, noteChanged: note !== doc.note };
  });
  if (!r0) return notFound(res);
  const { nd, changed } = r0;
  if (changed.length || r0.noteChanged) {
    const names = new Map((await rows("SELECT id, name FROM materials WHERE id = ANY($1::uuid[])", [changed.map((x) => x.id)])).map((m) => [m.id, m.name]));
    const changes = changed.map((x) => ({ p: `sanaldi: ${names.get(x.id) || x.id}`, a: x.a, b: x.b }));
    if (r0.noteChanged) changes.push({ p: "note", a: r0.doc.note, b: nd.note });
    await audit(req, { action: "update", entity: "inventory", entityId: nd.id, label: `${invLabel(nd)} — sanash`, changes });
  }
  res.json(await invView(nd, req.user, req.factoryId));
});
// tasdiqlash — faqat ПТО va admin; hujjat va to'g'rilashlar bitta tranzaksiyada
r.post("/inventories/:id/approve", async (req, res) => {
  if (!WRITE_ROLES.includes(req.user.role)) return res.status(403).json({ error: "Inventarizatsiyani faqat ПТО yoki administrator tasdiqlaydi" });
  if (!isId(req.params.id)) return notFound(res);
  const f = req.factoryId;
  const result = await tx(async (c) => {
    const doc = await one("SELECT * FROM inventories WHERE id = $1 AND factory_id = $2 FOR UPDATE", [req.params.id, f], c);
    if (!doc) return null;
    if (doc.status !== "draft") throw new ValidationError("Bu inventarizatsiya allaqachon tasdiqlangan");
    if (!doc.lines.some((l) => l.actual !== null && l.actual !== undefined)) throw new ValidationError("Hech bir material sanalmagan");
    const st = await stockAt(f, doc.date, c);
    let n = 0;
    for (const l of doc.lines) {
      l.system = round6(st[String(l.materialId)]?.end || 0);
      if (l.actual === null || l.actual === undefined) continue;
      const d = round6(l.actual - l.system);
      if (Math.abs(d) < 1e-6) continue;
      const s = insertSql("movements", {
        factoryId: f, type: d > 0 ? "in" : "out", date: doc.date, materialId: l.materialId, qty: Math.abs(d), price: l.price || 0, reason: "inventar", inventoryId: doc.id,
        person: `Inventarizatsiya №${doc.no}`, note: d > 0 ? "Ortiqcha (inventarizatsiya)" : "Kamomad (inventarizatsiya)", createdBy: who(req.user),
      });
      await c.query(s.text, s.values);
      n++;
    }
    const nd = await one("UPDATE inventories SET status = 'done', lines = $2, approved_by = $3, updated_at = now() WHERE id = $1 RETURNING *", [doc.id, JSON.stringify(doc.lines), JSON.stringify({ ...who(req.user), at: new Date() })], c);
    return { doc: nd, n };
  });
  if (!result) return notFound(res);
  await audit(req, {
    action: "update", entity: "inventory", entityId: result.doc.id, label: `${invLabel(result.doc)} tasdiqlandi: ${result.n} ta to'g'rilash`,
    changes: [{ p: "status", a: "draft", b: "done" }, { p: "to'g'rilashlar (kirim/chiqim)", a: 0, b: result.n }],
  });
  res.json({ ...(await invView(result.doc, req.user, f)), adjustments: result.n });
});
// o'chirish: qoralama — muallif yoki ПТО/admin; tasdiqlangan — faqat ПТО/admin (to'g'rilashlar ham bekor qilinadi)
r.delete("/inventories/:id", async (req, res) => {
  if (!isId(req.params.id)) return notFound(res);
  const doc = await one("SELECT * FROM inventories WHERE id = $1 AND factory_id = $2", [req.params.id, req.factoryId]);
  if (!doc) return notFound(res);
  const boss = WRITE_ROLES.includes(req.user.role);
  if (doc.status === "done" && !boss) return res.status(403).json({ error: "Tasdiqlangan inventarizatsiyani faqat ПТО yoki administrator bekor qiladi" });
  if (doc.status === "draft" && !boss && doc.createdBy?.id !== req.user.id) return res.status(403).json({ error: "Faqat o'zingiz boshlagan inventarizatsiyani o'chira olasiz" });
  const n = await tx(async (c) => {
    const d = await c.query("DELETE FROM movements WHERE inventory_id = $1", [doc.id]);
    await c.query("DELETE FROM inventories WHERE id = $1", [doc.id]);
    return d.rowCount;
  });
  await audit(req, { action: "delete", entity: "inventory", entityId: doc.id, label: `${invLabel(doc)} o'chirildi (${n} ta to'g'rilash bekor qilindi)` });
  res.json({ ok: true });
});

/* ---------- Ta'minotchilar ---------- */
async function rememberSupplier(f, name) {
  const n = normName(name);
  if (!n) return;
  await q("INSERT INTO suppliers (factory_id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING", [f, n]);
}
// ?from=&to= — shu davrdagi xaridlar statistikasi bilan; ?lite=1 — faqat nomlar
r.get("/suppliers", async (req, res) => {
  const f = req.factoryId;
  if (req.query.lite) return res.json((await q("SELECT name FROM suppliers WHERE factory_id = $1 AND NOT archived ORDER BY name", [f])).rows.map((s) => s.name));
  const { from, to } = req.query;
  const [list, moves] = await Promise.all([
    rows("SELECT * FROM suppliers WHERE factory_id = $1 ORDER BY name", [f]),
    rows(
      `SELECT date, material_id, qty, price, supplier FROM movements
        WHERE factory_id = $1 AND type = 'in' AND reason <> 'inventar' AND supplier <> '' AND date >= $2 AND date <= $3
        ORDER BY date, created_at`,
      [f, validDate(from) ? from : OPEN0, validDate(to) ? to : "9999-12-31"]
    ),
  ]);
  const key = (s) => normName(s).toLowerCase();
  const stats = new Map();
  for (const m of moves) {
    const k = key(m.supplier);
    const s = stats.get(k) || { name: m.supplier.trim(), count: 0, total: 0, first: m.date, last: m.date, materials: {} };
    s.count++;
    s.total += m.qty * (m.price || 0);
    s.last = m.date;
    const mid = m.materialId;
    const mt = (s.materials[mid] ||= { materialId: mid, qty: 0, total: 0, count: 0, minPrice: null, maxPrice: null, lastPrice: null, prevPrice: null, lastDate: "" });
    mt.qty += m.qty;
    mt.total += m.qty * (m.price || 0);
    mt.count++;
    if (m.price > 0) {
      mt.minPrice = mt.minPrice === null ? m.price : Math.min(mt.minPrice, m.price);
      mt.maxPrice = mt.maxPrice === null ? m.price : Math.max(mt.maxPrice, m.price);
      if (mt.lastPrice !== null && mt.lastPrice !== m.price) mt.prevPrice = mt.lastPrice;
      mt.lastPrice = m.price;
    }
    mt.lastDate = m.date;
    stats.set(k, s);
  }
  const out = list.map((s) => ({ ...s, stats: stats.get(key(s.name)) || null }));
  for (const [k, st] of stats) if (!list.some((s) => key(s.name) === k)) out.push({ id: null, name: st.name, phone: "", inn: "", contact: "", note: "", archived: false, stats: st });
  for (const s of out) if (s.stats) s.stats = { ...s.stats, total: Math.round(s.stats.total), materials: Object.values(s.stats.materials).map((m) => ({ ...m, total: Math.round(m.total), qty: round6(m.qty) })) };
  res.json(out);
});
r.post("/suppliers", async (req, res) => {
  const data = clean(SPEC.supplier, { ...req.body, name: normName(req.body?.name) });
  const s = insertSql("suppliers", { factoryId: req.factoryId, ...data });
  let doc;
  try {
    doc = await one(s.text, s.values);
  } catch (err) {
    if (err?.code === "23505") return res.status(409).json({ error: "Bunday ta'minotchi allaqachon bor" });
    throw err;
  }
  await audit(req, { action: "create", entity: "supplier", entityId: doc.id, label: doc.name, after: doc });
  res.status(201).json(doc);
});
r.put("/suppliers/:id", async (req, res) => {
  if (!isId(req.params.id)) return notFound(res);
  const f = req.factoryId;
  const before = await one("SELECT * FROM suppliers WHERE id = $1 AND factory_id = $2", [req.params.id, f]);
  if (!before) return notFound(res);
  const body = { ...req.body };
  if (body.name !== undefined) body.name = normName(body.name);
  const data = clean(SPEC.supplier, body, { partial: true });
  if (!Object.keys(data).length) return res.json(before);
  let doc;
  try {
    doc = await tx(async (c) => {
      const s = updateSql("suppliers", req.params.id, f, data);
      const d = await one(s.text, s.values, c);
      // nomi o'zgarsa — eski kirimlardagi nom ham yangilanadi (statistika uzilmasin)
      if (data.name && data.name !== before.name)
        await c.query(`UPDATE movements SET supplier = $3 WHERE factory_id = $1 AND type = 'in' AND ${NORM("supplier")} = ${NORM("$2")}`, [f, before.name, data.name]);
      return d;
    });
  } catch (err) {
    if (err?.code === "23505") return res.status(409).json({ error: "Bunday ta'minotchi allaqachon bor" });
    throw err;
  }
  await audit(req, { action: "update", entity: "supplier", entityId: doc.id, label: doc.name, before, after: doc });
  res.json(doc);
});
r.delete("/suppliers/:id", async (req, res) => {
  if (!WRITE_ROLES.includes(req.user.role)) return res.status(403).json({ error: "Sizda bu amal uchun ruxsat yo'q" });
  if (!isId(req.params.id)) return notFound(res);
  const f = req.factoryId;
  const doc = await one("SELECT * FROM suppliers WHERE id = $1 AND factory_id = $2", [req.params.id, f]);
  if (!doc) return notFound(res);
  if ((await q(`SELECT 1 FROM movements WHERE factory_id = $1 AND type = 'in' AND ${NORM("supplier")} = ${NORM("$2")} LIMIT 1`, [f, doc.name])).rowCount) {
    await q("UPDATE suppliers SET archived = true, updated_at = now() WHERE id = $1", [doc.id]);
    return res.json({ ok: true, archived: true });
  }
  await q("DELETE FROM suppliers WHERE id = $1", [doc.id]);
  await audit(req, { action: "delete", entity: "supplier", entityId: doc.id, label: doc.name, before: doc });
  res.json({ ok: true });
});

export default r;
