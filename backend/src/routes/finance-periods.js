// Oyni yopish: tekshiruv ro'yxati, qulflash va sababi bilan qayta ochish.
// /api/finance/periods ostida ulanadi. Yopish — admin, rahbar, buxgalter; qayta ochish — faqat admin va rahbar.
import { Router } from 'express';
import { one, rows, tx } from '../db.js';
import { ValidationError, ConflictError } from '../valid.js';
import { text, today, monthEnd } from '../payroll.js';
import { actor } from '../dispatch.js';
import { itemsOf, shipKey } from '../orders.js';
import { financeLock } from '../finance-integrity.js';
import { listLocks, requireMonth, monthLabel } from '../finance-period-lock.js';
import { loadFinance } from './finance-customers.js';
import { audit } from '../audit.js';

const r = Router();
const REOPEN_ROLES = ['admin', 'rahbar'];

/** Oy yopilishidan oldingi tekshiruvlar (sof funksiya). status: ok | warn | bad */
export function monthChecklist({ month, orders, shipments, invoices, receipts, materialInvoices = [], payroll = null }) {
  const end = monthEnd(month), inMonth = (d) => String(d || '').slice(0, 7) === month;
  const orderById = new Map(orders.map((o) => [o.id, o]));
  const shipped = new Map(), invoiced = new Map(), touched = new Set();
  for (const o of orders) for (const it of itemsOf(o)) if (+it.shippedBefore) shipped.set(shipKey(o.id, it.productId), +it.shippedBefore);
  for (const s of shipments) {
    if (!orderById.has(s.orderId) || s.date > end) continue;
    const k = shipKey(s.orderId, s.productId); shipped.set(k, (shipped.get(k) || 0) + (+s.qty || 0));
    if (inMonth(s.date)) touched.add(k);
  }
  for (const i of invoices) if (!i.voidedAt && i.date <= end) for (const it of i.items || []) { const k = shipKey(i.orderId, it.productId); invoiced.set(k, (invoiced.get(k) || 0) + (+it.qty || 0)); }
  const noInvoice = new Map(), noPrice = new Map();
  for (const [k, q] of shipped) {
    const [orderId, productId] = k.split(':'), o = orderById.get(orderId);
    if (q > (invoiced.get(k) || 0) + 0.00001) noInvoice.set(orderId, o);
    const line = itemsOf(o).find((it) => String(it.productId) === productId);
    if (touched.has(k) && !(+line?.price > 0)) noPrice.set(orderId, o);
  }
  const names = (m) => [...m.values()].slice(0, 4).map((o) => `№${o.no} ${o.customer}`).join(', ') + (m.size > 4 ? ` va yana ${m.size - 4} ta` : '');
  const monthShipments = shipments.filter((s) => inMonth(s.date) && orderById.has(s.orderId)).length;
  const monthReceipts = receipts.filter((p) => !p.voidedAt && inMonth(p.date));
  const noDoc = monthReceipts.filter((p) => p.method !== 'naqd' && !p.docNumber).length;
  const monthMat = materialInvoices.filter((m) => !m.voidedAt && inMonth(m.date));
  const noPdf = monthMat.filter((m) => !m.sizeBytes).length;
  const checks = [
    { key: 'invoices', status: noInvoice.size ? 'bad' : 'ok', title: noInvoice.size ? `${noInvoice.size} ta buyurtmada jo‘natilgan mahsulotga faktura yozilmagan` : 'Jo‘natilgan mahsulotlarning hammasiga faktura yozilgan', detail: noInvoice.size ? names(noInvoice) : `${monthShipments} ta jo‘natma` , go: 'finance-customers' },
    { key: 'prices', status: noPrice.size ? 'bad' : 'ok', title: noPrice.size ? `${noPrice.size} ta buyurtmada sotuv narxi kiritilmagan` : 'Jo‘natilgan mahsulotlarning sotuv narxi bor', detail: noPrice.size ? names(noPrice) + ' · tannarx bilan hisoblanmaydi' : '', go: 'ord' },
    { key: 'receipts', status: noDoc ? 'warn' : 'ok', title: noDoc ? `${noDoc} ta bank/karta to‘lovida hujjat raqami yo‘q` : 'To‘lovlarda hujjat raqami bor', detail: `${monthReceipts.length} ta to‘lov`, go: 'finance-customers' },
    { key: 'materials', status: noPdf ? 'warn' : 'ok', title: noPdf ? `${noPdf} ta material fakturasining PDF nusxasi yo‘q` : 'Material fakturalari PDF bilan', detail: `${monthMat.length} ta faktura`, go: 'finance-materials' },
    { key: 'payroll', status: payroll && ['approved', 'closed'].includes(payroll.status) ? 'ok' : 'warn', title: !payroll ? 'Oylik hisobi ochilmagan' : payroll.status === 'closed' ? 'Oylik yopilgan' : payroll.status === 'approved' ? 'Oylik tasdiqlangan' : 'Oylik hali tasdiqlanmagan (qoralama)', detail: '', go: 'finance-payroll' },
  ];
  return { month, checks, ready: checks.every((c) => c.status !== 'bad') };
}

r.get('/', async (req, res) => {
  res.json({ today: today(), locks: await listLocks(req.factoryId) });
});

r.get('/:month/checklist', async (req, res) => {
  const month = requireMonth(req.params.month);
  const data = await tx(async (c) => {
    await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
    const d = await loadFinance(c, req.factoryId);
    d.materialInvoices = await rows('SELECT id,date,size_bytes,voided_at FROM material_invoices WHERE factory_id=$1 AND left(date,7)=$2', [req.factoryId, month], c);
    d.payroll = await one('SELECT status FROM hr_months WHERE factory_id=$1 AND month=$2', [req.factoryId, month], c);
    d.lock = await one('SELECT month,locked_at,locked_by,note,reopened_at,reopened_by,reopen_reason FROM finance_period_locks WHERE factory_id=$1 AND month=$2', [req.factoryId, month], c);
    return d;
  });
  res.json({ ...monthChecklist({ ...data, month }), lock: data.lock });
});

r.post('/:month/lock', async (req, res) => {
  const month = requireMonth(req.params.month);
  if (month > today().slice(0, 7)) throw new ValidationError('Hali boshlanmagan oyni yopib bo‘lmaydi');
  const lock = await tx(async (c) => {
    await financeLock(c, req.factoryId);
    const old = await one('SELECT month,reopened_at FROM finance_period_locks WHERE factory_id=$1 AND month=$2 FOR UPDATE', [req.factoryId, month], c);
    if (old && !old.reopenedAt) throw new ConflictError(`${monthLabel(month)} allaqachon yopilgan`);
    return one(`INSERT INTO finance_period_locks(factory_id,month,locked_by,note) VALUES($1,$2,$3,$4)
      ON CONFLICT(factory_id,month) DO UPDATE SET locked_at=now(),locked_by=EXCLUDED.locked_by,note=EXCLUDED.note,reopened_at=NULL,reopened_by=NULL,reopen_reason=''
      RETURNING month,locked_at,locked_by,note,reopened_at,reopen_reason`, [req.factoryId, month, actor(req), text(req.body?.note, 500)], c);
  });
  await audit(req, { action: 'update', entity: 'financePeriod', entityId: month, label: `Moliyaviy oy yopildi: ${monthLabel(month)}`, changes: [{ p: 'holat', a: 'ochiq', b: 'yopilgan' }] });
  res.json(lock);
});

r.post('/:month/reopen', async (req, res) => {
  if (!REOPEN_ROLES.includes(req.user.role)) return res.status(403).json({ error: 'Yopilgan oyni faqat admin yoki rahbar qayta ochadi' });
  const month = requireMonth(req.params.month), reason = text(req.body?.reason, 500);
  if (reason.length < 5) throw new ValidationError('Oyni qayta ochish sababini yozing');
  const lock = await tx(async (c) => {
    await financeLock(c, req.factoryId);
    const doc = await one(`UPDATE finance_period_locks SET reopened_at=now(),reopened_by=$3,reopen_reason=$4
      WHERE factory_id=$1 AND month=$2 AND reopened_at IS NULL RETURNING month,locked_at,locked_by,note,reopened_at,reopen_reason`, [req.factoryId, month, actor(req), reason], c);
    if (!doc) throw new ConflictError('Bu oy yopilmagan');
    return doc;
  });
  await audit(req, { action: 'update', entity: 'financePeriod', entityId: month, label: `Moliyaviy oy qayta ochildi: ${monthLabel(month)}`, changes: [{ p: 'holat', a: 'yopilgan', b: 'ochiq' }, { p: 'sabab', a: null, b: reason }] });
  res.json(lock);
});

export default r;
