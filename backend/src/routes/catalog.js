// Materiallar, mahsulotlar, sozlamalar
import { Router } from "express";
import { q, one, rows, tx } from "../db.js";
import { WRITE_ROLES } from "../auth.js";
import { audit } from "../audit.js";
import { SPEC, clean, insertSql, updateSql, calc as cleanCalc, isId, validDate, ValidationError } from "../valid.js";
import { getSettings, notFound } from "../common.js";
import { DEFAULT_SCHEMES, assignSchemes } from "../schemes.js";
import { planConfig } from "../plan.js";

const r = Router();
const contains = (key, id) => JSON.stringify([{ [key]: id }]);

/* ---------- Materiallar ---------- */
const STORE_MATERIAL_FIELDS = ["name", "group", "code", "minQty"]; // omborchi shularnigina o'zgartira oladi (birlik — yo'q)
const materialOnly = (req) => (WRITE_ROLES.includes(req.user.role) ? null : STORE_MATERIAL_FIELDS);

r.get("/materials", async (req, res) => {
  res.json(await rows("SELECT * FROM materials WHERE factory_id = $1 ORDER BY sort, name", [req.factoryId]));
});
// nomni solishtirish: katta-kichik harf, «ё/е» va bo'shliqlar farqi hisobga olinmaydi
const matKey = (s) => String(s || "").toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
r.post("/materials", async (req, res) => {
  const name = matKey(req.body?.name);
  if (name) {
    const dup = (await rows("SELECT name, archived FROM materials WHERE factory_id = $1", [req.factoryId])).find((m) => matKey(m.name) === name);
    if (dup) return res.status(409).json({ error: dup.archived ? "Bu nomdagi material arxivda bor — «Materiallar» bo'limida arxivdan chiqaring" : "Bu nomdagi material allaqachon bor" });
  }
  const only = materialOnly(req);
  const data = clean(SPEC.material, only ? { ...Object.fromEntries(only.map((k) => [k, req.body?.[k]])), unit: req.body?.unit } : req.body);
  if (req.body?.sort === undefined) data.sort = (await q("SELECT COALESCE(max(sort), 0) + 1 AS n FROM materials WHERE factory_id = $1", [req.factoryId])).rows[0].n;
  const s = insertSql("materials", { factoryId: req.factoryId, ...data });
  const doc = await one(s.text, s.values);
  await audit(req, { action: "create", entity: "material", entityId: doc.id, label: doc.name, after: doc });
  res.status(201).json(doc);
});
r.put("/materials/:id", async (req, res) => {
  if (!isId(req.params.id)) return notFound(res);
  const before = await one("SELECT * FROM materials WHERE id = $1 AND factory_id = $2", [req.params.id, req.factoryId]);
  if (!before) return notFound(res);
  const data = clean(SPEC.material, req.body, { partial: true, only: materialOnly(req) });
  // birlik o'zgarsa butun tarix noto'g'ri bo'lib qoladi — harakat bo'lgan materialda ruxsat yo'q
  if (data.unit !== undefined && data.unit !== before.unit) {
    const used = (await q("SELECT 1 FROM movements WHERE material_id = $1 LIMIT 1", [before.id])).rowCount || (await q("SELECT 1 FROM days WHERE factory_id = $1 AND materials @> $2::jsonb LIMIT 1", [req.factoryId, contains("materialId", before.id)])).rowCount;
    if (used) throw new ValidationError("Materialda ombor tarixi bor — o'lchov birligini o'zgartirib bo'lmaydi. Yangi material yarating.");
  }
  if (!Object.keys(data).length) return res.json(before);
  const s = updateSql("materials", req.params.id, req.factoryId, data);
  const doc = await one(s.text, s.values);
  await audit(req, { action: "update", entity: "material", entityId: doc.id, label: doc.name, before, after: doc });
  res.json(doc);
});
r.delete("/materials/:id", async (req, res) => {
  const id = req.params.id;
  if (!isId(id)) return notFound(res);
  const f = req.factoryId;
  const c = contains("materialId", id);
  const used = await q(
    `SELECT EXISTS (SELECT 1 FROM products WHERE factory_id = $1 AND (norms @> $2::jsonb OR calc->'items' @> $2::jsonb))
         OR EXISTS (SELECT 1 FROM materials WHERE factory_id = $1 AND (recipe @> $2::jsonb OR writeoff @> $2::jsonb))
         OR EXISTS (SELECT 1 FROM days WHERE factory_id = $1 AND materials @> $2::jsonb)
         OR EXISTS (SELECT 1 FROM movements WHERE material_id = $3)
         OR EXISTS (SELECT 1 FROM material_invoices WHERE factory_id=$1 AND items @> $2::jsonb)
         OR EXISTS (SELECT 1 FROM inventories WHERE factory_id = $1 AND lines @> $2::jsonb)
         OR EXISTS (SELECT 1 FROM settings WHERE factory_id = $1 AND opening->'materials' ? $3::text) AS used`,
    [f, c, id]
  );
  if (used.rows[0].used) return res.status(409).json({ error: "Material normalarda, retseptda, kunlik hisobotda, ombor tarixida, inventarizatsiyada yoki boshlang'ich qoldiqda bor — o'chirib bo'lmaydi. Uni arxivga o'tkazing." });
  const doc = await one("DELETE FROM materials WHERE id = $1 AND factory_id = $2 RETURNING *", [id, f]);
  if (!doc) return notFound(res);
  await audit(req, { action: "delete", entity: "material", entityId: doc.id, label: doc.name, before: doc });
  res.json({ ok: true });
});

/* ---------- Xarajat andozalari: birinchi marta ikki sxema yaratiladi va mahsulotlar taqsimlanadi ---------- */
const schemesInit = new Map();
export async function ensureSchemes(req) {
  const s = await getSettings(req.factoryId);
  if (Array.isArray(s.costSchemes)) return s;
  const fid = req.factoryId;
  if (!schemesInit.has(fid)) {
    schemesInit.set(
      fid,
      tx(async (c) => {
        const fresh = await one("SELECT cost_schemes FROM settings WHERE factory_id = $1 FOR UPDATE", [fid], c);
        if (Array.isArray(fresh?.costSchemes)) return;
        const products = (await rows("SELECT id, grp, calc FROM products WHERE factory_id = $1", [fid], c)).map((p) => ({ ...p, _id: p.id }));
        const map = assignSchemes(products, DEFAULT_SCHEMES);
        for (const [id, scheme] of map)
          await c.query("UPDATE products SET calc = jsonb_set(calc, '{scheme}', to_jsonb($2::text)) WHERE id = $1 AND COALESCE(calc->>'scheme', '') = ''", [id, scheme]);
        await c.query("UPDATE settings SET cost_schemes = $2, updated_at = now() WHERE factory_id = $1", [fid, JSON.stringify(DEFAULT_SCHEMES)]);
        const n = (id) => [...map.values()].filter((x) => x === id).length;
        await audit(req, { action: "update", entity: "settings", entityId: "main", label: `Xarajat andozalari yaratildi: ${DEFAULT_SCHEMES.map((x) => `${x.name} — ${n(x.id)} ta mahsulot`).join("; ")}`, changes: [{ p: "costSchemes", a: null, b: DEFAULT_SCHEMES.map((x) => x.name).join(", ") }] });
      }).finally(() => schemesInit.delete(fid))
    );
  }
  await schemesInit.get(fid);
  return getSettings(fid);
}

/* ---------- Mahsulotlar ---------- */
r.get("/products", async (req, res) => {
  await ensureSchemes(req);
  res.json(await rows("SELECT * FROM products WHERE factory_id = $1 ORDER BY sort, code", [req.factoryId]));
});
// bir nechta mahsulotni andozaga bog'lash: { scheme: "id" | "", productIds: [...] } ("" — o'z qatorlari)
r.post("/products/scheme", async (req, res) => {
  const b = req.body || {};
  const ids = Array.isArray(b.productIds) ? b.productIds.filter(isId).slice(0, 1000) : [];
  if (!ids.length) return res.status(400).json({ error: "Mahsulot tanlanmagan" });
  const scheme = String(b.scheme ?? "");
  const s = await ensureSchemes(req);
  if (scheme && !(s.costSchemes || []).some((x) => x.id === scheme)) return res.status(400).json({ error: "Bunday andoza yo'q" });
  const u = await q(
    "UPDATE products SET calc = jsonb_set(calc, '{scheme}', to_jsonb($2::text)), updated_at = now() WHERE factory_id = $1 AND id = ANY($3::uuid[]) AND COALESCE(calc->>'scheme', '') <> $2",
    [req.factoryId, scheme, ids]
  );
  const name = (s.costSchemes || []).find((x) => x.id === scheme)?.name || "alohida";
  await audit(req, { action: "update", entity: "product", entityId: "scheme", label: `${u.rowCount} ta mahsulot → ${name}`, changes: [{ p: "calc.scheme", a: null, b: name }] });
  res.json({ ok: true, modified: u.rowCount });
});
r.post("/products", async (req, res) => {
  const body = { ...(req.body || {}) };
  if (!body.calc) {
    const st = await ensureSchemes(req);
    body.calc = st.costSchemes?.length ? { scheme: st.costSchemes[0].id } : st.calcTemplate || {};
  }
  const data = clean(SPEC.product, body);
  if (body.sort === undefined) data.sort = (await q("SELECT COALESCE(max(sort), 0) + 1 AS n FROM products WHERE factory_id = $1", [req.factoryId])).rows[0].n;
  const s = insertSql("products", { factoryId: req.factoryId, ...data });
  const doc = await one(s.text, s.values);
  await audit(req, { action: "create", entity: "product", entityId: doc.id, label: doc.code, after: doc });
  res.status(201).json(doc);
});
r.put("/products/:id", async (req, res) => {
  if (!isId(req.params.id)) return notFound(res);
  const before = await one("SELECT * FROM products WHERE id = $1 AND factory_id = $2", [req.params.id, req.factoryId]);
  if (!before) return notFound(res);
  const data = clean(SPEC.product, req.body, { partial: true });
  if (!Object.keys(data).length) return res.json(before);
  const s = updateSql("products", req.params.id, req.factoryId, data);
  const doc = await one(s.text, s.values);
  await audit(req, { action: "update", entity: "product", entityId: doc.id, label: doc.code, before, after: doc });
  res.json(doc);
});
r.delete("/products/:id", async (req, res) => {
  const id = req.params.id;
  if (!isId(id)) return notFound(res);
  const f = req.factoryId;
  const c = contains("productId", id);
  const used = await q(
    `SELECT EXISTS (SELECT 1 FROM orders WHERE factory_id = $1 AND items @> $2::jsonb)
         OR EXISTS (SELECT 1 FROM days WHERE factory_id = $1 AND (production @> $2::jsonb OR shipments @> $2::jsonb))
         OR EXISTS (SELECT 1 FROM product_moves WHERE product_id = $3 OR to_product_id = $3)
         OR EXISTS (SELECT 1 FROM month_plans WHERE factory_id = $1 AND rows @> $2::jsonb)
         OR EXISTS (SELECT 1 FROM acct_reports WHERE factory_id = $1 AND rows @> $2::jsonb)
         OR EXISTS (SELECT 1 FROM settings WHERE factory_id = $1 AND opening->'products' ? $3::text) AS used`,
    [f, c, id]
  );
  if (used.rows[0].used) return res.status(409).json({ error: "Mahsulot buyurtma, kunlik hisobot, tasdiqlangan reja, material hisoboti yoki boshlang'ich qoldiqda bor — o'chirib bo'lmaydi" });
  const doc = await one("DELETE FROM products WHERE id = $1 AND factory_id = $2 RETURNING *", [id, f]);
  if (!doc) return notFound(res);
  await audit(req, { action: "delete", entity: "product", entityId: doc.id, label: doc.code, before: doc });
  res.json({ ok: true });
});

/* ---------- Sozlamalar ---------- */
r.get("/settings", async (req, res) => {
  res.json(await ensureSchemes(req));
});
r.put("/settings", async (req, res) => {
  const s = await getSettings(req.factoryId);
  const before = structuredClone(s);
  const b = req.body || {};
  if (b.electrodePct !== undefined) s.electrodePct = Math.max(0, +b.electrodePct || 0);
  if (b.company !== undefined) s.company = String(b.company).slice(0, 200);
  if (b.plan && typeof b.plan === "object") {
    const holidays = Array.isArray(b.plan.holidays) ? b.plan.holidays : s.plan?.holidays || [];
    if (holidays.some((d) => !validDate(d))) return res.status(400).json({ error: "Dam olish kuni sanasi noto'g'ri" });
    s.plan = planConfig({ ...(s.plan || {}), ...b.plan, holidays: [...new Set(holidays)].sort().slice(-400) });
  }
  if (Array.isArray(b.signers)) s.signers = b.signers.map((x) => String(x).slice(0, 120)).slice(0, 6);
  if (b.costSchemes !== undefined) {
    if (!Array.isArray(b.costSchemes) || b.costSchemes.length > 20) return res.status(400).json({ error: "Andozalar ro'yxati noto'g'ri" });
    const out = [];
    const seen = new Set();
    for (const x of b.costSchemes) {
      if (!x || typeof x !== "object") return res.status(400).json({ error: "Andozalar ro'yxati noto'g'ri" });
      const id = String(x.id ?? "").trim();
      const name = String(x.name ?? "").trim().slice(0, 80);
      if (!/^[a-z0-9-]{1,40}$/.test(id) || seen.has(id)) return res.status(400).json({ error: "Andoza kodi noto'g'ri" });
      if (!name) return res.status(400).json({ error: "Andoza nomi kiritilmagan" });
      seen.add(id);
      const c = cleanCalc({ prodRows: x.prodRows, otherRows: x.otherRows, margin: x.margin, vat: x.vat });
      out.push({ id, name, prodRows: c.prodRows, otherRows: c.otherRows, margin: c.margin, vat: c.vat });
    }
    const gone = (s.costSchemes || []).map((x) => x.id).filter((id) => !seen.has(id));
    if (gone.length) {
      const used = (await q("SELECT count(*) AS n FROM products WHERE factory_id = $1 AND calc->>'scheme' = ANY($2)", [req.factoryId, gone])).rows[0].n;
      if (used) return res.status(400).json({ error: `O'chirilayotgan andozaga ${used} ta mahsulot bog'langan — avval ularni boshqa andozaga o'tkazing` });
    }
    s.costSchemes = out;
  }
  if (b.calcTemplate !== undefined) {
    if (b.calcTemplate === null) s.calcTemplate = null;
    else {
      if (typeof b.calcTemplate !== "object" || Array.isArray(b.calcTemplate)) return res.status(400).json({ error: "Kalkulyatsiya andozasi noto'g'ri" });
      s.calcTemplate = { ...cleanCalc(b.calcTemplate), items: [] };
    }
  }
  if (b.opening) {
    if (b.opening.date !== undefined && b.opening.date !== "" && !validDate(b.opening.date)) return res.status(400).json({ error: "Boshlang'ich qoldiq sanasi noto'g'ri" });
    const cl = (o) => Object.fromEntries(Object.entries(o || {}).filter(([k, v]) => isId(k) && Number.isFinite(+v) && +v !== 0).map(([k, v]) => [k, +v]));
    s.opening = {
      date: b.opening.date ?? s.opening?.date ?? "",
      materials: b.opening.materials ? cl(b.opening.materials) : s.opening?.materials || {},
      products: b.opening.products ? cl(b.opening.products) : s.opening?.products || {},
    };
  }
  await q(
    `UPDATE settings SET electrode_pct = $2, company = $3, signers = $4, opening = $5, calc_template = $6, cost_schemes = $7, plan = $8, updated_at = now() WHERE factory_id = $1`,
    [req.factoryId, s.electrodePct, s.company, JSON.stringify(s.signers), JSON.stringify(s.opening), s.calcTemplate === null ? null : JSON.stringify(s.calcTemplate), s.costSchemes === null ? null : JSON.stringify(s.costSchemes), JSON.stringify(s.plan)]
  );
  const after = await getSettings(req.factoryId);
  await audit(req, { action: "update", entity: "settings", entityId: "main", label: "Sozlamalar", before, after });
  res.json(after);
});

export default r;
