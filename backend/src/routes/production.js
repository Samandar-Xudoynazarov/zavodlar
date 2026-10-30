// Kunlik hisobot, ombor qoldig'i, tayyor mahsulot, buyurtmalar, reja, grafiklar
import { Router } from "express";
import { q, one, rows, tx } from "../db.js";
import { WRITE_ROLES } from "../auth.js";
import { audit } from "../audit.js";
import { ConflictError, validMonth, SPEC, clean, insertSql, updateSql, prodLines, matLines, shipLines, isId, validDate, BRAK_REASONS, ValidationError } from "../valid.js";
import { getSettings, openingOf, loadDays, loadMoves, loadPmoves, nextNo, notFound, todayTashkent, who } from "../common.js";
import { stockReport } from "../stock.js";
import { planOrders, checkNewOrder, addDays } from "../plan.js";
import { itemsOf, orderView, planLines, shipKey } from "../orders.js";
import { createDailyPlanNotification } from "../notifications.js";
import { deliverTelegramNotification } from "../telegram.js";

const r = Router();
const OPEN0 = "0000-00-00";

/* ---------- Kunlik hisobotlar ---------- */
r.get("/days", async (req, res) => {
  const { from, to, month } = req.query;
  let a = OPEN0;
  let b = "9999-12-31";
  if (validMonth(month)) [a, b] = [`${month}-01`, `${month}-31`];
  else {
    if (validDate(from)) a = from;
    if (validDate(to)) b = to;
  }
  res.json(await rows("SELECT * FROM days WHERE factory_id = $1 AND date >= $2 AND date <= $3 ORDER BY date LIMIT 1000", [req.factoryId, a, b]));
});
r.get("/days/:date", async (req, res) => {
  if (!validDate(req.params.date)) return res.status(400).json({ error: "Sana formati YYYY-MM-DD" });
  const doc = await one("SELECT * FROM days WHERE factory_id = $1 AND date = $2", [req.factoryId, req.params.date]);
  res.json(doc || { date: req.params.date, note: "", production: [], materials: [], shipments: [], isNew: true });
});
r.put("/days/:date", async (req, res) => {
  const date = req.params.date;
  if (!validDate(date)) return res.status(400).json({ error: "Sana formati YYYY-MM-DD" });
  const b = req.body || {};
  const data = {};
  if (b.note !== undefined) data.note = String(b.note ?? "").slice(0, 1000);
  for (const k of ["production", "materials", "shipments"]) {
    if (b[k] === undefined || b[k] === null) continue;
    if (!Array.isArray(b[k])) return res.status(400).json({ error: `«${k}» ro'yxat (massiv) bo'lishi kerak` });
    data[k] = b[k].filter((l) => l && typeof l === "object" && !Array.isArray(l));
  }
  // Bir kunni bir vaqtda ikki xodim saqlasa, ikkinchisi birinchisining o'zgarishini bilmasdan o'chirib yubormasin:
  // brauzer yuklagan versiyani (baseUpdatedAt) yuboradi, bazadagi versiya boshqacha bo'lsa — 409.
  // baseUpdatedAt umuman yuborilmasa (eski brauzer) — tekshirilmaydi.
  const checkVer = Object.prototype.hasOwnProperty.call(b, "baseUpdatedAt");
  const base = checkVer && b.baseUpdatedAt ? new Date(b.baseUpdatedAt).getTime() : null;
  const { before, doc, notificationId } = await tx(async (c) => {
  await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`day:${req.factoryId}:${date}`]);
  const before = await one("SELECT * FROM days WHERE factory_id = $1 AND date = $2", [req.factoryId, date], c);
  if (checkVer && before && new Date(before.updatedAt).getTime() !== base)
    throw new ConflictError("Bu kunni siz ochgandan keyin boshqa xodim saqlagan. Uning o'zgarishlari o'chib ketmasligi uchun saqlanmadi — kunni qayta yuklang.");
  // Sex boshlig'i (usta) reja, fakt, xomashyo sarfi va izohni o'zgartiradi: kirim va jo'natish avvalgidek qoladi
  if (!WRITE_ROLES.includes(req.user.role)) {
    const old = before || { production: [], materials: [], shipments: [] };
    if (data.materials) {
      const kirim = new Map((old.materials || []).map((l) => [String(l.materialId), +l.kirim || 0]));
      const ids = new Set();
      data.materials = data.materials.map((l) => {
        ids.add(String(l.materialId));
        return { materialId: l.materialId, sarf: l.sarf, kirim: kirim.get(String(l.materialId)) || 0 };
      });
      for (const [id, k] of kirim) if (!ids.has(id) && k) data.materials.push({ materialId: id, sarf: 0, kirim: k });
    }
    delete data.shipments;
  }
  // bo'sh qatorlarni tashlab yuboramiz, keyin tekshiramiz
  if (data.production)
    data.production = prodLines(
      data.production
        .filter((l) => l.productId && ((+l.plan || 0) || (+l.fact || 0) || (+l.brak || 0) || l.note))
        .map((l) => ({ ...l, brakReason: +l.brak > 0 ? (BRAK_REASONS.includes(l.brakReason) ? l.brakReason : "boshqa") : "" })),
      "production"
    );
  if (data.materials) data.materials = matLines(data.materials.filter((l) => l.materialId && ((+l.sarf || 0) || (+l.kirim || 0))), "materials");
  if (data.shipments)
    data.shipments = shipLines(
      data.shipments.filter((l) => l.productId && +l.qty > 0).map((l) => ({ ...l, orderId: isId(l.orderId) ? l.orderId : null })),
      "shipments"
    );
  // JSONB ichidagi IDlar ham shu zavod katalogiga tegishli bo'lishi shart.
  for (const [table, key, lines, label] of [
    ["products", "productId", [...(data.production || []), ...(data.shipments || [])], "Mahsulot"],
    ["materials", "materialId", data.materials || [], "Material"],
  ]) {
    for (const line of lines) line[key] = line[key].toLowerCase();
    const ids = [...new Set(lines.map((l) => l[key]))];
    if (!ids.length) continue;
    const found = await rows(`SELECT id FROM ${table} WHERE factory_id = $1 AND id = ANY($2::uuid[]) FOR KEY SHARE`, [req.factoryId, ids], c);
    if (found.length !== ids.length) throw new ValidationError(`${label} topilmadi yoki boshqa zavodga tegishli`);
  }
  // jo'natish faqat shu mahsulot bor (shu zavoddagi) buyurtmaga bog'lanadi, aks holda bog'lanmagan bo'lib qoladi
  if (data.shipments?.some((l) => l.orderId)) {
    const ids = [...new Set(data.shipments.filter((l) => l.orderId).map((l) => l.orderId))];
    const has = new Map((await rows("SELECT id, items FROM orders WHERE factory_id = $1 AND id = ANY($2::uuid[])", [req.factoryId, ids], c)).map((o) => [o.id, new Set(itemsOf(o).map((i) => String(i.productId)))]));
    for (const l of data.shipments) if (l.orderId && !has.get(l.orderId)?.has(String(l.productId))) l.orderId = null;
  }
  const cols = Object.keys(data);
  const vals = cols.map((k) => (typeof data[k] === "string" ? data[k] : JSON.stringify(data[k])));
  const doc = await one(
    `INSERT INTO days (factory_id, date${cols.map((c) => `, ${c}`).join("")}) VALUES ($1, $2${cols.map((_, i) => `, $${i + 3}`).join("")})
     ON CONFLICT (factory_id, date) DO UPDATE SET updated_at = now()${cols.map((c) => `, ${c} = EXCLUDED.${c}`).join("")}
     RETURNING *`,
    [req.factoryId, date, ...vals],
    c
  );
  const notificationId = await createDailyPlanNotification(req, before, doc, c);
  return { before, doc, notificationId };
  });
  if (notificationId) {
    try {
      await deliverTelegramNotification(notificationId);
    } catch {
      // Xabar bazada navbatda qoladi: Telegram xatosi muvaffaqiyatli saqlashni bekor qilmasin.
      console.error("Telegram xabari yuborilmadi; navbatda saqlandi");
    }
  }
  await audit(req, { action: before ? "update" : "create", entity: "day", entityId: date, label: date, before, after: doc });
  res.json(doc);
});
r.delete("/days/:date", async (req, res) => {
  const doc = await one("DELETE FROM days WHERE factory_id = $1 AND date = $2 RETURNING *", [req.factoryId, String(req.params.date)]);
  if (!doc) return notFound(res);
  await audit(req, { action: "delete", entity: "day", entityId: doc.date, label: doc.date, before: doc });
  res.json({ ok: true });
});

/* ---------- Ombor qoldig'i ---------- */
r.get("/stock", async (req, res) => {
  const { from, to } = req.query;
  if (!validDate(from) || !validDate(to) || from > to) return res.status(400).json({ error: "from va to sanalarini YYYY-MM-DD formatida bering" });
  const f = req.factoryId;
  const opening = await openingOf(f);
  const start = opening.date || OPEN0;
  const [days, moves, pmoves] = await Promise.all([loadDays(f, start, to), loadMoves(f, start, to), loadPmoves(f, start, to)]);
  res.json(stockReport(opening, days, from, to, moves, pmoves));
});

/* ---------- Tayyor mahsulot ombori va brak ---------- */
async function productStockAt(f, date, client) {
  const opening = await openingOf(f, client);
  const start = opening.date || OPEN0;
  const [days, pmoves] = await Promise.all([loadDays(f, start, date, client), loadPmoves(f, start, date, client)]);
  return stockReport(opening, days, date, date, [], pmoves).products;
}
const pmLabel = (m, p) => `Brakka chiqarildi: ${p?.code || "?"} ${m.qty} dona (${m.date})`;
const fixLabel = (m, a, b) => `Marka tuzatildi: ${a?.code || "?"} → ${b?.code || "?"}, ${m.qty} dona (${m.date})`;

r.get("/finished", async (req, res) => {
  const { from, to, productId } = req.query;
  if (!validDate(from) || !validDate(to) || from > to) return res.status(400).json({ error: "from va to sanalarini YYYY-MM-DD formatida bering" });
  const f = req.factoryId;
  const opening = await openingOf(f);
  const start = opening.date || OPEN0;
  const [days, pmoves] = await Promise.all([
    loadDays(f, start, to),
    rows("SELECT * FROM product_moves WHERE factory_id = $1 AND date >= $2 AND date <= $3 ORDER BY date, created_at", [f, start, to]),
  ]);
  const report = stockReport(opening, days, from, to, [], pmoves);
  const brak = [];
  const events = [];
  const pid = isId(productId) ? String(productId) : null;
  for (const d of days) {
    if (d.date < from) continue;
    const ev = pid && { date: d.date, fact: 0, brak: 0, shipped: 0, writeoff: 0, customers: [] };
    for (const l of d.production || []) {
      if (+l.brak > 0) brak.push({ date: d.date, productId: String(l.productId), qty: +l.brak, reason: l.brakReason || "boshqa", source: "ishlab", note: l.note || "" });
      if (ev && String(l.productId) === pid) {
        ev.fact += +l.fact || 0;
        ev.brak += +l.brak || 0;
      }
    }
    if (ev)
      for (const l of d.shipments || [])
        if (String(l.productId) === pid) {
          ev.shipped += +l.qty || 0;
          if (l.customer) ev.customers.push(l.customer);
        }
    if (ev && (ev.fact || ev.brak || ev.shipped)) events.push(ev);
  }
  const list = [];
  const fixes = [];
  for (const m of pmoves) {
    if (m.date < from) continue;
    if (m.type === "fix") {
      const fx = { id: m.id, date: m.date, productId: m.productId, toProductId: m.toProductId, qty: m.qty, note: m.note, createdBy: m.createdBy, createdAt: m.createdAt };
      fixes.push(fx);
      if (pid && (fx.productId === pid || fx.toProductId === pid)) {
        let ev = events.find((e) => e.date === m.date);
        if (!ev) events.push((ev = { date: m.date, fact: 0, brak: 0, shipped: 0, writeoff: 0, corr: 0, customers: [] }));
        ev.corr = (ev.corr || 0) + (fx.toProductId === pid ? m.qty : -m.qty);
      }
      continue;
    }
    const o = { id: m.id, date: m.date, productId: m.productId, qty: m.qty, reason: m.reason, source: "ombor", note: m.note, createdBy: m.createdBy, createdAt: m.createdAt };
    brak.push(o);
    list.push(o);
    if (pid && o.productId === pid) {
      let ev = events.find((e) => e.date === m.date);
      if (!ev) events.push((ev = { date: m.date, fact: 0, brak: 0, shipped: 0, writeoff: 0, customers: [] }));
      ev.writeoff += m.qty;
    }
  }
  brak.sort((a, b) => b.date.localeCompare(a.date));
  events.sort((a, b) => b.date.localeCompare(a.date));
  fixes.sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt).localeCompare(String(a.createdAt)));
  res.json({ from, to, openingDate: report.openingDate, products: report.products, brak, writeoffs: list, fixes, ...(pid && { events }) });
});
r.post("/product-moves", async (req, res) => {
  const b = req.body || {};
  const f = req.factoryId;
  const date = b.date === undefined || b.date === "" ? todayTashkent() : b.date;
  if (!validDate(date) || date > todayTashkent()) return res.status(400).json({ error: "Sana noto'g'ri" });
  if (!isId(b.productId)) return res.status(400).json({ error: "Mahsulot topilmadi" });
  const p = await one("SELECT * FROM products WHERE id = $1 AND factory_id = $2", [b.productId, f]);
  if (!p) return res.status(400).json({ error: "Mahsulot topilmadi" });
  const qty = Math.floor(+b.qty);
  if (!(qty >= 1)) return res.status(400).json({ error: "Soni kamida 1" });
  // xato kiritilgan markani tuzatish (пересортица) — faqat ПТО, administrator va rahbar
  if (b.type === "fix") {
    if (!WRITE_ROLES.includes(req.user.role)) return res.status(403).json({ error: "Markani tuzatishni faqat ПТО, administrator yoki rahbar qila oladi" });
    if (!isId(b.toProductId) || b.toProductId === p.id) return res.status(400).json({ error: "To'g'ri mahsulotni tanlang (boshqa marka bo'lishi kerak)" });
    const to = await one("SELECT * FROM products WHERE id = $1 AND factory_id = $2", [b.toProductId, f]);
    if (!to) return res.status(400).json({ error: "Mahsulot topilmadi" });
    const doc = await tx(async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`pm:${p.id}`]);
      const [at, now] = [await productStockAt(f, date, c), await productStockAt(f, todayTashkent(), c)];
      const have = Math.min(at[p.id]?.end || 0, now[p.id]?.end || 0);
      if (have < qty) throw new ValidationError(`Omborda yetarli emas. Qoldiq: ${Math.max(0, have)} dona`);
      const s = insertSql("product_moves", { factoryId: f, type: "fix", date, productId: p.id, toProductId: to.id, qty, reason: "boshqa", note: String(b.note ?? "").trim().slice(0, 300), createdBy: who(req.user) });
      return one(s.text, s.values, c);
    });
    await audit(req, { action: "create", entity: "productMove", entityId: doc.id, label: fixLabel(doc, p, to), after: doc });
    return res.status(201).json(doc);
  }
  const reason = BRAK_REASONS.includes(b.reason) ? b.reason : "boshqa";
  const doc = await tx(async (c) => {
    // bir mahsulot bo'yicha parallel brakka chiqarishlar navbat bilan tekshiriladi
    await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`pm:${p.id}`]);
    const [at, now] = [await productStockAt(f, date, c), await productStockAt(f, todayTashkent(), c)];
    const have = Math.min(at[p.id]?.end || 0, now[p.id]?.end || 0);
    if (have < qty) throw new ValidationError(`Omborda yetarli emas. Qoldiq: ${Math.max(0, have)} dona`);
    const s = insertSql("product_moves", { factoryId: f, type: "brak", date, productId: p.id, qty, reason, note: String(b.note ?? "").trim().slice(0, 300), createdBy: who(req.user) });
    return one(s.text, s.values, c);
  });
  await audit(req, { action: "create", entity: "productMove", entityId: doc.id, label: pmLabel(doc, p), after: doc });
  res.status(201).json(doc);
});
// bekor qilish: ПТО/admin — istalganini; usta — o'zi kiritganini 24 soat ichida
r.delete("/product-moves/:id", async (req, res) => {
  if (!isId(req.params.id)) return notFound(res);
  const doc = await one("SELECT * FROM product_moves WHERE id = $1 AND factory_id = $2", [req.params.id, req.factoryId]);
  if (!doc) return notFound(res);
  if (doc.type === "fix") {
    if (!WRITE_ROLES.includes(req.user.role)) return res.status(403).json({ error: "Markani tuzatishni faqat ПТО, administrator yoki rahbar bekor qila oladi" });
    const [a, t] = await Promise.all([one("SELECT code FROM products WHERE id = $1", [doc.productId]), one("SELECT code FROM products WHERE id = $1", [doc.toProductId])]);
    await tx(async (c) => {
      // bekor qilinsa, to'g'ri markadan qaytib olinadi — u yerda yetarli bo'lishi kerak
      await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`pm:${doc.toProductId}`]);
      const now = await productStockAt(req.factoryId, todayTashkent(), c);
      const have = now[doc.toProductId]?.end || 0;
      if (have < doc.qty) throw new ValidationError(`Bekor qilib bo'lmaydi: to'g'ri markadan keyin jo'natilgan. Qoldiq: ${Math.max(0, have)} dona`);
      await c.query("DELETE FROM product_moves WHERE id = $1", [doc.id]);
    });
    await audit(req, { action: "delete", entity: "productMove", entityId: doc.id, label: `${fixLabel(doc, a, t)} — bekor qilindi`, before: doc });
    return res.json({ ok: true });
  }
  if (!WRITE_ROLES.includes(req.user.role) && (doc.createdBy?.id !== req.user.id || Date.now() - doc.createdAt > 24 * 36e5))
    return res.status(403).json({ error: "Faqat o'zingiz kiritgan yozuvni 24 soat ichida bekor qila olasiz" });
  const p = await one("SELECT code FROM products WHERE id = $1", [doc.productId]);
  await q("DELETE FROM product_moves WHERE id = $1", [doc.id]);
  await audit(req, { action: "delete", entity: "productMove", entityId: doc.id, label: pmLabel(doc, p), before: doc });
  res.json({ ok: true });
});

/* ---------- Buyurtmalar ---------- */
// Bitta buyurtmada bir nechta mahsulot: items = [{ productId, qty, price, shippedBefore }]
// shippedBefore — tizim ishga tushishidan oldin jo'natilgani; qolgani kunlik hisobotdan (orderId + productId) olinadi
const orderLabel = (o) => `№${o.no} ${o.customer}${o.contractNo ? ` (shartnoma ${o.contractNo})` : ""}`;
/** Jo'natilgan: Map(shipKey(orderId, productId) → dona) — kunlik hisobotdagi buyurtmaga bog'langan jo'natishlardan */
export const shippedByOrder = async (f, orderIds = null, client = null) =>
  new Map(
    (
      await q(
        `SELECT s->>'orderId' AS oid, s->>'productId' AS pid, sum((s->>'qty')::numeric) AS qty
           FROM days, jsonb_array_elements(shipments) s
          WHERE factory_id = $1 AND s->>'orderId' IS NOT NULL ${orderIds ? "AND s->>'orderId' = ANY($2::text[])" : ""}
          GROUP BY 1, 2`,
        orderIds ? [f, orderIds] : [f],
        client
      )
    ).rows.map((x) => [shipKey(x.oid, x.pid), +x.qty || 0])
  );
// eski shakl (bitta mahsulot: productId, qty, price) va zavodlar'ning oldingi «lines» shakli ham qabul qilinadi
function orderBody(b) {
  if (!b || typeof b !== "object") return b;
  if (b.items === undefined && Array.isArray(b.lines)) return { ...b, items: b.lines };
  if (b.items === undefined && b.productId !== undefined) return { ...b, items: [{ productId: b.productId, qty: b.qty, price: b.price, shippedBefore: b.shippedBefore }] };
  return b;
}
async function checkProducts(f, items) {
  const ids = items.map((l) => l.productId);
  const n = (await q("SELECT count(*) AS n FROM products WHERE factory_id = $1 AND id = ANY($2::uuid[])", [f, ids])).rows[0].n;
  if (n !== ids.length) throw new ValidationError("Mahsulot topilmadi");
}
const orderOut = async (f, doc) => orderView(doc, await shippedByOrder(f, [doc.id]));

r.get("/orders", async (req, res) => {
  const [orders, shipped] = await Promise.all([rows("SELECT * FROM orders WHERE factory_id = $1 ORDER BY no", [req.factoryId]), shippedByOrder(req.factoryId)]);
  res.json(orders.map((o) => orderView(o, shipped)));
});
r.post("/orders", async (req, res) => {
  const data = clean(SPEC.order, orderBody(req.body));
  await checkProducts(req.factoryId, data.items);
  const doc = await tx(async (c) => {
    const s = insertSql("orders", { factoryId: req.factoryId, no: await nextNo(req.factoryId, "order", "orders", c), ...data });
    return one(s.text, s.values, c);
  });
  await audit(req, { action: "create", entity: "order", entityId: doc.id, label: orderLabel(doc), after: doc });
  res.status(201).json(await orderOut(req.factoryId, doc));
});
r.put("/orders/:id", async (req, res) => {
  if (!isId(req.params.id)) return notFound(res);
  const f = req.factoryId;
  const before = await one("SELECT * FROM orders WHERE id = $1 AND factory_id = $2", [req.params.id, f]);
  if (!before) return notFound(res);
  const data = clean(SPEC.order, orderBody(req.body), { partial: true });
  if (data.items) {
    await checkProducts(f, data.items);
    // buyurtmadan olib tashlangan mahsulotga kunlik hisobotda jo'natish bog'langan bo'lsa — ruxsat yo'q
    const keep = new Set(data.items.map((i) => i.productId));
    const gone = itemsOf(before).map((i) => String(i.productId)).filter((id) => !keep.has(id));
    if (gone.length) {
      const used = await q(
        `SELECT 1 FROM days, jsonb_array_elements(shipments) s WHERE factory_id = $1 AND s->>'orderId' = $2 AND s->>'productId' = ANY($3::text[]) LIMIT 1`,
        [f, before.id, gone]
      );
      if (used.rowCount) throw new ValidationError("Olib tashlanayotgan mahsulot kunlik hisobotda shu buyurtma bo'yicha jo'natilgan — avval o'sha jo'natishni boshqa buyurtmaga bog'lang");
    }
  }
  if (!Object.keys(data).length) return res.json(await orderOut(f, before));
  const s = updateSql("orders", req.params.id, f, data);
  const doc = await one(s.text, s.values);
  await audit(req, { action: "update", entity: "order", entityId: doc.id, label: orderLabel(doc), before, after: doc });
  res.json(await orderOut(f, doc));
});
r.delete("/orders/:id", async (req, res) => {
  if (!isId(req.params.id)) return notFound(res);
  const f = req.factoryId;
  const doc = await tx(async (c) => {
    const d = await one("DELETE FROM orders WHERE id = $1 AND factory_id = $2 RETURNING *", [req.params.id, f], c);
    if (!d) return null;
    // jo'natishlardagi bog'lanish uziladi (jo'natishning o'zi qoladi)
    await c.query(
      `UPDATE days SET shipments = (
         SELECT COALESCE(jsonb_agg(CASE WHEN e->>'orderId' = $2 THEN jsonb_set(e, '{orderId}', 'null') ELSE e END), '[]')
           FROM jsonb_array_elements(shipments) e), updated_at = now()
       WHERE factory_id = $1 AND shipments @> $3::jsonb`,
      [f, d.id, JSON.stringify([{ orderId: d.id }])]
    );
    return d;
  });
  if (!doc) return notFound(res);
  await audit(req, { action: "delete", entity: "order", entityId: doc.id, label: orderLabel(doc), before: doc });
  res.json({ ok: true });
});

/* ---------- Buyurtmalar rejasi (qancha kunda tugatamiz) ---------- */
/** only — faqat shu buyurtmalar (id to'plami) rejalashtiriladi; bo'sh — hammasi */
export async function planInput(f, { only = null } = {}) {
  const today = todayTashkent();
  const s = await getSettings(f);
  const opening = s.opening?.date ? s.opening : { date: "", materials: {}, products: {} };
  const start = opening.date || OPEN0;
  const histFrom = addDays(today, -60);
  const [products, beton, orders, shipped, days, recent, pmoves] = await Promise.all([
    rows("SELECT id, code, forms, cycle_days, norms FROM products WHERE factory_id = $1", [f]),
    rows("SELECT id FROM materials WHERE factory_id = $1 AND grp = 'beton'", [f]),
    rows("SELECT * FROM orders WHERE factory_id = $1", [f]),
    shippedByOrder(f),
    loadDays(f, start, today),
    rows("SELECT date, production FROM days WHERE factory_id = $1 AND date >= $2 AND date < $3", [f, histFrom, today]),
    loadPmoves(f, start, today),
  ]);
  const betonSet = new Set(beton.map((m) => m.id));
  const hist = {};
  for (const d of recent)
    for (const l of d.production || [])
      if (+l.fact > 0) {
        const h = (hist[String(l.productId)] ||= { sum: 0, n: 0 });
        h.sum += +l.fact;
        h.n++;
      }
  const todayDoc = days.find((d) => d.date === today);
  const todayFact = {};
  for (const l of todayDoc?.production || []) todayFact[String(l.productId)] = (todayFact[String(l.productId)] || 0) + (+l.fact || 0) + (+l.brak || 0); // brak ham qolipni band qilgan
  const stock = stockReport(opening, days, today, today, [], pmoves).products;
  return {
    today,
    settings: s.plan,
    products: products.map((p) => ({
      id: p.id,
      code: p.code,
      forms: p.forms || 0,
      cycleDays: p.cycleDays || 1,
      volume: (p.norms || []).reduce((t, l) => t + (betonSet.has(String(l.materialId)) ? +l.norm || 0 : 0), 0),
    })),
    // buyurtmaning har bir mahsuloti — alohida reja qatori (id: "buyurtma:mahsulot"); to'liq jo'natilganlari kirmaydi
    // tanlangan buyurtmalar bilan birga «tayyor» buyurtmalar ham beriladi — ular rejaga kirmaydi, lekin omborda o'z mahsulotini band qiladi
    orders: planLines(only ? orders.filter((o) => only.has(o.id) || o.status === "tayyor") : orders, shipped),
    stock: Object.fromEntries(Object.entries(stock).map(([k, v]) => [k, v.end])),
    history: Object.fromEntries(Object.entries(hist).map(([k, h]) => [k, Math.round((h.sum / h.n) * 100) / 100])),
    todayFact,
  };
}
// ?orders=id1,id2 — faqat tanlangan buyurtmalar (boshqalari quvvatni band qilmaydi deb hisoblanadi)
// ?days=N — kunlik taklifda nechta ish kuni (oylik rejaga nusxalash uchun ko'proq kerak)
r.get("/plan", async (req, res) => {
  const ids = String(req.query.orders || "").split(",").filter(isId).slice(0, 500);
  const showDays = Math.min(80, Math.max(1, Math.floor(+req.query.days) || 24));
  res.json(planOrders({ ...(await planInput(req.factoryId, { only: ids.length ? new Set(ids) : null })), showDays }));
});
// { lines: [{ productId, qty }], deadline, customer } — eski shakl { productId, qty } ham qabul qilinadi
r.post("/plan/check", async (req, res) => {
  const b = req.body || {};
  const raw = Array.isArray(b.lines) ? b.lines : [{ productId: b.productId, qty: b.qty }];
  const lines = raw.filter((l) => l && (l.productId || l.qty)).map((l) => ({ productId: l.productId, qty: Math.floor(+l.qty) }));
  if (!lines.length) return res.status(400).json({ error: "Mahsulot tanlanmagan" });
  if (lines.length > 100) return res.status(400).json({ error: "Mahsulotlar juda ko'p" });
  const ids = lines.map((l) => l.productId);
  if (ids.some((id) => !isId(id)) || new Set(ids).size !== ids.length) return res.status(400).json({ error: "Mahsulot topilmadi yoki ikki marta tanlangan" });
  if ((await q("SELECT count(*) AS n FROM products WHERE factory_id = $1 AND id = ANY($2::uuid[])", [req.factoryId, ids])).rows[0].n !== ids.length) return res.status(400).json({ error: "Mahsulot topilmadi" });
  if (lines.some((l) => !(l.qty >= 1 && l.qty <= 1e6))) return res.status(400).json({ error: "Soni kamida 1 bo'lishi kerak" });
  if (b.deadline && !validDate(b.deadline)) return res.status(400).json({ error: "Muddat sanasi noto'g'ri" });
  res.json(checkNewOrder(await planInput(req.factoryId), { lines, deadline: b.deadline || "", customer: String(b.customer || "").slice(0, 200) }));
});

/* ---------- Grafiklar paneli ---------- */
/** Kunlik hisobot, ombor harakati va brakka chiqarishni `keyOf(sana)` bo'yicha guruhlab jamlaydi */
export async function dashAggregate(f, keys, keyOf, from, to) {
  const [days, moves, pmoves] = await Promise.all([loadDays(f, from, to), loadMoves(f, from, to, null, "AND reason <> 'inventar'"), loadPmoves(f, from, to)]);
  const M = new Map(keys.map((k) => [k, { key: k, plan: 0, fact: 0, brak: 0, writeoff: 0, shipped: 0, activeDays: 0, prod: {}, ship: {}, sarf: {}, chiqim: {}, kirimSum: 0 }]));
  const add = (o, k, v) => (o[k] = Math.round(((o[k] || 0) + v) * 1e6) / 1e6);
  for (const d of days) {
    const x = M.get(keyOf(d.date));
    if (!x) continue;
    let dayFact = 0;
    for (const l of d.production || []) {
      x.plan += +l.plan || 0;
      x.fact += +l.fact || 0;
      x.brak += +l.brak || 0;
      dayFact += +l.fact || 0;
      if (+l.fact) add(x.prod, String(l.productId), +l.fact);
    }
    if (dayFact) x.activeDays++;
    for (const l of d.shipments || []) {
      x.shipped += +l.qty || 0;
      if (+l.qty) add(x.ship, String(l.productId), +l.qty);
    }
    for (const l of d.materials || []) if (+l.sarf) add(x.sarf, String(l.materialId), +l.sarf);
  }
  for (const m of moves) {
    const x = M.get(keyOf(m.date));
    if (!x) continue;
    if (m.type === "out") add(x.chiqim, String(m.materialId), +m.qty || 0);
    else x.kirimSum += (+m.qty || 0) * (+m.price || 0);
  }
  for (const p of pmoves) {
    if (p.type === "fix") continue; // marka tuzatish — jami o'zgarmaydi
    const x = M.get(keyOf(p.date));
    if (x) x.writeoff += +p.qty || 0;
  }
  return [...M.values()].map((x) => ({ ...x, kirimSum: Math.round(x.kirimSum) }));
}
export const monthShift = (ym, n) => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1)).toISOString().slice(0, 7);

r.get("/dashboard", async (req, res) => {
  const f = req.factoryId;
  const today = todayTashkent();
  if (req.query.month !== undefined) {
    const ym = String(req.query.month);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym) || ym > today.slice(0, 7) || ym < "2000-01") return res.status(400).json({ error: "Oy noto'g'ri" });
    const last = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate();
    const dates = [];
    for (let d = 1; d <= last; d++) {
      const s = `${ym}-${String(d).padStart(2, "0")}`;
      if (s <= today) dates.push(s);
    }
    const prev = monthShift(ym, -1);
    const [days, totals] = await Promise.all([
      dashAggregate(f, dates, (d) => d, dates[0], dates[dates.length - 1]),
      dashAggregate(f, [prev, ym], (d) => d.slice(0, 7), `${prev}-01`, dates[dates.length - 1]),
    ]);
    return res.json({ month: ym, days, total: totals[1], prevTotal: totals[0] });
  }
  const n = Math.min(24, Math.max(1, Math.floor(+req.query.months || 12)));
  const months = [];
  for (let i = n - 1; i >= 0; i--) months.push(monthShift(today.slice(0, 7), -i));
  const list = await dashAggregate(f, months, (d) => d.slice(0, 7), `${months[0]}-01`, today);
  res.json({ months: list.map(({ key, ...x }) => ({ month: key, ...x })) });
});

export default r;
