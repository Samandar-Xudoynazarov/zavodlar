// Eski (tizimdan oldingi) buyurtma jo'natmalari va oy bo'yicha hisob-kitob.
// /api/finance/archive ostida ulanadi — faqat admin, rahbar va buxgalter (finance.js tekshiradi).
// Eski jo'natma ombor qoldig'iga va kunlik hisobotga ta'sir qilmaydi, faqat buyurtmaning «jo'natildi» soniga qo'shiladi.
import { Router } from 'express';
import { one, rows, tx } from '../db.js';
import { isId, validDate, ValidationError, ConflictError } from '../valid.js';
import { money, number, text, today } from '../payroll.js';
import { pdfContent, sendPdf, actor } from '../dispatch.js';
import { itemsOf, orderView } from '../orders.js';
import { shippedByOrder } from './production.js';
import { assertInvoiceCoverage, financeLock } from '../finance-integrity.js';
import { audit } from '../audit.js';
import { cleanCustomerName, customerKey } from '../customer-name.js';

const r = Router();
export const ARCHIVE_FROM = '2025-01-01';
const cols = 'id,order_id,product_id,date,qty,dispatch_no,vehicle,receiver,note,name,size_bytes,created_by,created_at,voided_at,void_reason';

// Oyni yopish moliya bo'limida qilinadi (finance-period-lock.js). Fayl hali bo'lmasa — tekshiruvsiz ishlaydi.
let periodLock = null;
async function assertOpen(c, f, date) {
  if (periodLock === null) {
    try { periodLock = (await import('../finance-period-lock.js')).assertMonthOpen || false; }
    catch (e) { if (e?.code !== 'ERR_MODULE_NOT_FOUND') throw e; periodLock = false; }
  }
  if (periodLock) await periodLock(c, f, date);
}

const scopedOrder = async (c, f, id, lock = false) => {
  if (!isId(id)) throw new ValidationError('Buyurtma topilmadi');
  const o = await one(`SELECT * FROM orders WHERE factory_id=$1 AND id=$2${lock ? ' FOR UPDATE' : ''}`, [f, id], c);
  if (!o) throw new ValidationError('Buyurtma topilmadi');
  return o;
};
const label = (o, s) => `№${o.no} ${o.customer} · eski jo‘natma ${s.date}${s.dispatchNo ? ' · накладная ' + s.dispatchNo : ''}`;

/* ---------- Buyurtmaning eski jo'natmalari ---------- */
r.get('/orders/:id/legacy-shipments', async (req, res) => {
  const o = await scopedOrder(null, req.factoryId, req.params.id);
  res.json(await rows(`SELECT ${cols} FROM legacy_shipments WHERE factory_id=$1 AND order_id=$2 ORDER BY date DESC,created_at DESC`, [req.factoryId, o.id]));
});

r.post('/orders/:id/legacy-shipments', async (req, res) => {
  const b = req.body || {};
  if (!isId(b.requestId)) throw new ValidationError('So‘rov raqami noto‘g‘ri');
  const result = await tx(async (c) => {
    await financeLock(c, req.factoryId);
    const o = await scopedOrder(c, req.factoryId, req.params.id, true);
    const old = await one(`SELECT ${cols} FROM legacy_shipments WHERE factory_id=$1 AND request_id=$2`, [req.factoryId, b.requestId], c);
    if (old) { if (old.orderId !== o.id) throw new ConflictError('So‘rov boshqa buyurtmaga tegishli'); return { o, doc: old, repeat: true }; }
    if (!validDate(b.date) || b.date < ARCHIVE_FROM || b.date > today()) throw new ValidationError(`Sana ${ARCHIVE_FROM} dan bugungacha bo‘lsin`);
    await assertOpen(c, req.factoryId, b.date);
    const productId = String(b.productId || '').toLowerCase();
    const line = orderView(o, await shippedByOrder(req.factoryId, [o.id], c)).items.find((i) => i.productId === productId);
    if (!line) throw new ValidationError('Mahsulot bu buyurtmada yo‘q');
    const qty = number(b.qty, 'Soni', 0.001, 1e9);
    if (line.shipped + qty > line.qty + 0.00001)
      throw new ValidationError(`Jami jo‘natilgan (${line.shipped + qty}) buyurtma sonidan (${line.qty}) oshib ketadi. «Oldin jo‘natilgan» sonini kamaytiring yoki buyurtmani tuzating`);
    let pdf = null;
    if (b.contentBase64) pdf = pdfContent(b.contentBase64);
    const doc = await one(
      `INSERT INTO legacy_shipments(factory_id,request_id,order_id,product_id,date,qty,dispatch_no,vehicle,receiver,note,name,content_base64,size_bytes,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING ${cols}`,
      [req.factoryId, b.requestId, o.id, productId, b.date, qty, text(b.dispatchNo, 80), text(b.vehicle, 40), text(b.receiver, 160), text(b.note, 1000),
        pdf ? text(b.name, 160) || 'Nakladnaya.pdf' : '', pdf ? b.contentBase64 : '', pdf ? pdf.length : 0, actor(req)], c);
    return { o, doc };
  });
  if (!result.repeat) await audit(req, { action: 'create', entity: 'legacy_shipment', entityId: result.doc.id, label: label(result.o, result.doc), after: result.doc });
  res.status(result.repeat ? 200 : 201).json(result.doc);
});

// Keyinroq накладная PDF biriktirish (faqat PDF hali yo'q bo'lsa; almashtirish uchun yozuvni bekor qilib qayta kiriting)
r.post('/legacy-shipments/:id/pdf', async (req, res) => {
  if (!isId(req.params.id)) throw new ValidationError('Yozuv topilmadi');
  const b = req.body || {};
  const pdf = pdfContent(b.contentBase64);
  const result = await tx(async (c) => {
    await financeLock(c, req.factoryId);
    const s = await one('SELECT id,order_id,date,dispatch_no,size_bytes,voided_at FROM legacy_shipments WHERE factory_id=$1 AND id=$2 FOR UPDATE', [req.factoryId, req.params.id], c);
    if (!s || s.voidedAt) throw new ConflictError('Yozuv topilmadi yoki bekor qilingan');
    if (s.sizeBytes > 0) throw new ConflictError('PDF allaqachon biriktirilgan. Almashtirish uchun yozuvni bekor qilib, qayta kiriting');
    await assertOpen(c, req.factoryId, s.date);
    const no = text(b.dispatchNo, 80);
    const doc = await one(`UPDATE legacy_shipments SET name=$3,content_base64=$4,size_bytes=$5,dispatch_no=CASE WHEN $6<>'' THEN $6 ELSE dispatch_no END WHERE factory_id=$1 AND id=$2 RETURNING ${cols}`,
      [req.factoryId, s.id, text(b.name, 160) || 'Nakladnaya.pdf', b.contentBase64, pdf.length, no], c);
    return { o: await scopedOrder(c, req.factoryId, s.orderId), doc };
  });
  await audit(req, { action: 'update', entity: 'legacy_shipment', entityId: result.doc.id, label: label(result.o, result.doc) + ' · PDF', after: result.doc });
  res.json(result.doc);
});

r.get('/legacy-shipments/:id/pdf', async (req, res) => {
  if (!isId(req.params.id)) return res.status(404).json({ error: 'Накладная topilmadi' });
  const file = await one('SELECT name,content_base64 FROM legacy_shipments WHERE factory_id=$1 AND id=$2 AND size_bytes>0', [req.factoryId, req.params.id]);
  if (!file) return res.status(404).json({ error: 'Накладная topilmadi' });
  sendPdf(res, file);
});

r.post('/legacy-shipments/:id/void', async (req, res) => {
  const reason = text(req.body?.reason, 500);
  if (!isId(req.params.id) || !reason) throw new ValidationError('Bekor qilish sababi majburiy');
  const result = await tx(async (c) => {
    await financeLock(c, req.factoryId);
    const s = await one('SELECT id,order_id,date FROM legacy_shipments WHERE factory_id=$1 AND id=$2 AND voided_at IS NULL FOR UPDATE', [req.factoryId, req.params.id], c);
    if (!s) throw new ConflictError('Yozuv topilmadi yoki bekor qilingan');
    await assertOpen(c, req.factoryId, s.date);
    const doc = await one(`UPDATE legacy_shipments SET voided_at=now(),void_reason=$3 WHERE factory_id=$1 AND id=$2 RETURNING ${cols}`, [req.factoryId, s.id, reason], c);
    await assertInvoiceCoverage(c, req.factoryId); // shu jo'natmaga faktura yozilgan bo'lsa — bekor qilib bo'lmaydi
    return { o: await scopedOrder(c, req.factoryId, s.orderId), doc };
  });
  await audit(req, { action: 'update', entity: 'legacy_shipment', entityId: result.doc.id, label: label(result.o, result.doc) + ' · bekor qilindi', before: { ...result.doc, voidedAt: null, voidReason: '' }, after: result.doc });
  res.json(result.doc);
});

/* ---------- Oy bo'yicha hisob-kitob (mijoz × oy) ---------- */
const validMonthStr = (m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(m || ''));
// openings — mijozlarning boshlang'ich qoldig'i (finance_customer_openings): qarz (+) yoki avans (−), o'z oyida qarzga qo'shiladi.
// Buyurtmaga bog'lanmagan to'lov (order_id bo'sh) mijoz nomi bo'yicha hisoblanadi.
export function monthlySummary({ orders, shipments, invoices, receipts, openings = [], from, to }) {
  const orderById = new Map(orders.map((o) => [o.id, o]));
  const priceOf = new Map();
  for (const o of orders) for (const it of itemsOf(o)) priceOf.set(o.id + ':' + it.productId, +it.price || 0);
  // bir mijozning turli yozilishlari (tirnoq, apostrof) bitta qatorga jamlanadi
  const norm = customerKey;
  const nameOf = new Map();
  for (const o of orders) if (!nameOf.has(norm(o.customer))) nameOf.set(norm(o.customer), cleanCustomerName(o.customer) || '—');
  const key = (o) => nameOf.get(norm(o?.customer)) || '—';
  const byName = (name) => nameOf.get(norm(name)) || cleanCustomerName(name) || '—';
  const acc = new Map(); // customer -> month -> sums
  const cell = (customer, month) => {
    if (!acc.has(customer)) acc.set(customer, new Map());
    const m = acc.get(customer);
    if (!m.has(month)) m.set(month, { shippedQty: 0, shipped: 0, unpricedQty: 0, invoiced: 0, paid: 0, opening: 0 });
    return m.get(month);
  };
  for (const s of shipments) {
    const o = orderById.get(s.orderId); if (!o || !validDate(s.date)) continue;
    const c = cell(key(o), s.date.slice(0, 7)), price = priceOf.get(s.orderId + ':' + s.productId) || 0;
    c.shippedQty += +s.qty || 0;
    if (price > 0) c.shipped += (+s.qty || 0) * price; else c.unpricedQty += +s.qty || 0;
  }
  for (const i of invoices) { const o = orderById.get(i.orderId); if (o && validDate(i.date)) cell(key(o), i.date.slice(0, 7)).invoiced += +i.amount || 0; }
  for (const p of receipts) {
    const o = orderById.get(p.orderId); if (!validDate(p.date)) continue;
    if (o) cell(key(o), p.date.slice(0, 7)).paid += +p.amount || 0;
    else if (!p.orderId && String(p.customer || '').trim()) cell(byName(p.customer), p.date.slice(0, 7)).paid += +p.amount || 0;
  }
  for (const op of openings) {
    if (op.voidedAt || !validDate(op.date)) continue;
    cell(byName(op.customer), op.date.slice(0, 7)).opening += op.kind === 'advance' ? -(+op.amount || 0) : +op.amount || 0;
  }
  const out = [];
  for (const [customer, months] of [...acc].sort((a, b) => a[0].localeCompare(b[0]))) {
    let shippedTotal = 0, invoicedTotal = 0, paidTotal = 0, openingTotal = 0;
    const list = [];
    for (const [month, c] of [...months].sort((a, b) => a[0].localeCompare(b[0]))) {
      shippedTotal += c.shipped; invoicedTotal += c.invoiced; paidTotal += c.paid; openingTotal += c.opening;
      if (month < from || month > to) continue;
      list.push({ month, shippedQty: c.shippedQty, shipped: money(c.shipped), unpricedQty: c.unpricedQty, invoiced: money(c.invoiced), paid: money(c.paid), opening: money(c.opening),
        debt: money(openingTotal + invoicedTotal - paidTotal), notInvoiced: money(Math.max(0, shippedTotal - invoicedTotal)) });
    }
    if (list.length) out.push({ customer, months: list });
  }
  return out;
}
r.get('/monthly', async (req, res) => {
  const now = today().slice(0, 7);
  const from = validMonthStr(req.query.from) ? req.query.from : ARCHIVE_FROM.slice(0, 7);
  const to = validMonthStr(req.query.to) ? req.query.to : now;
  if (from > to) throw new ValidationError('Oylar oralig‘i noto‘g‘ri');
  const f = [req.factoryId];
  const data = await tx(async (c) => {
    await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
    return {
      orders: await rows('SELECT id,no,customer,items FROM orders WHERE factory_id=$1', f, c),
      shipments: (await rows(`SELECT d.date, s->>'orderId' AS order_id, s->>'productId' AS product_id, (s->>'qty')::numeric AS qty
        FROM days d, jsonb_array_elements(d.shipments) s WHERE d.factory_id=$1 AND s->>'orderId' IS NOT NULL`, f, c))
        .concat(await rows('SELECT date,order_id,product_id,qty FROM legacy_shipments WHERE factory_id=$1 AND voided_at IS NULL', f, c)),
      invoices: await rows('SELECT order_id,date,amount FROM finance_invoices WHERE factory_id=$1 AND voided_at IS NULL', f, c),
      receipts: await rows('SELECT order_id,customer,date,amount FROM finance_receipts WHERE factory_id=$1 AND voided_at IS NULL', f, c),
      openings: await rows('SELECT customer,date,kind,amount FROM finance_customer_openings WHERE factory_id=$1 AND voided_at IS NULL', f, c),
    };
  });
  const undated = data.orders.reduce((s, o) => s + itemsOf(o).reduce((x, it) => x + (+it.shippedBefore || 0), 0), 0);
  res.json({ from, to, customers: monthlySummary({ ...data, from, to }), undatedShippedBefore: undated });
});

export default r;
