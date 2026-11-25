// Mijozlar bo'yicha hisob-kitob: qarz mijoz bo'yicha jamlanadi, boshlang'ich qoldiq, to'lovlar, akt sverka, to'lov muddati.
// /api/finance/customers ostida ulanadi — faqat admin, rahbar va buxgalter (finance.js tekshiradi).
import { Router } from 'express';
import { one, rows, tx } from '../db.js';
import { isId, validDate, ValidationError, ConflictError } from '../valid.js';
import { money, number, text, today } from '../payroll.js';
import { actor } from '../dispatch.js';
import { financeLock } from '../finance-integrity.js';
import { assertMonthOpen } from '../finance-period-lock.js';
import { customerLedger, customerStatement, customerKey, customerName } from '../finance-customers.js';
import { audit } from '../audit.js';

const r = Router();
export const receiptCols = 'id,order_id,invoice_id,customer,date,amount,method,doc_number,note,created_at,voided_at,void_reason';
const openingCols = 'id,customer,inn,date,kind,amount,note,created_at,voided_at,void_reason';
const METHODS = ['bank', 'naqd', 'karta'];
const fmt = (n) => Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 2 });

/** Moliya ma'lumotlarini bitta tranzaksiyada yuklash (mijozlar, oy yopish tekshiruvi uchun) */
export async function loadFinance(c, f) {
  const p = [f];
  return {
    orders: await rows('SELECT id,no,customer,contract_no,items,status,date FROM orders WHERE factory_id=$1', p, c),
    shipments: (await rows(`SELECT d.date, s->>'orderId' AS order_id, s->>'productId' AS product_id, (s->>'qty')::numeric AS qty,
        coalesce(s->>'dispatchNo','') AS dispatch_no, 'day' AS source
      FROM days d, jsonb_array_elements(d.shipments) s WHERE d.factory_id=$1 AND s->>'orderId' IS NOT NULL`, p, c))
      .concat(await rows("SELECT id,date,order_id,product_id,qty,dispatch_no,'legacy' AS source FROM legacy_shipments WHERE factory_id=$1 AND voided_at IS NULL", p, c)),
    invoices: await rows('SELECT id,order_id,number,date,due_date,net,vat,amount,items,voided_at FROM finance_invoices WHERE factory_id=$1', p, c),
    receipts: await rows('SELECT ' + receiptCols + ' FROM finance_receipts WHERE factory_id=$1', p, c),
    openings: await rows('SELECT ' + openingCols + ' FROM finance_customer_openings WHERE factory_id=$1 AND voided_at IS NULL', p, c),
    locks: new Set((await rows('SELECT month FROM finance_period_locks WHERE factory_id=$1 AND reopened_at IS NULL', p, c)).map((x) => x.month)),
  };
}

/**
 * Mijozdan to'lov qabul qilish (buyurtma bo'yicha yoki mijoz bo'yicha umumiy).
 * Fakturaga bog'langan to'lov fakturaning to'lanmagan qoldig'idan oshmaydi.
 */
export async function createReceipt(c, req, b, order = null) {
  const f = req.factoryId;
  if (!isId(b.requestId) || !validDate(b.date)) throw new ValidationError('Sana yoki so‘rov raqami noto‘g‘ri');
  const old = await one('SELECT ' + receiptCols + ' FROM finance_receipts WHERE factory_id=$1 AND request_id=$2', [f, b.requestId], c);
  if (old) {
    if (order && old.orderId !== order.id) throw new ConflictError('So‘rov boshqa buyurtmaga tegishli');
    return old;
  }
  if (b.date > today()) throw new ValidationError('To‘lov sanasi bugundan keyin bo‘lmasin');
  const method = b.method == null || b.method === '' ? 'bank' : b.method;
  if (!METHODS.includes(method)) throw new ValidationError('To‘lov turini tanlang: bank, naqd yoki karta');
  const amount = number(b.amount, 'To‘lov', 0.01, 1e12);
  let invoiceId = null;
  if (b.invoiceId) {
    if (!isId(b.invoiceId)) throw new ValidationError('Faktura noto‘g‘ri');
    const invoice = await one('SELECT id,order_id,number,amount FROM finance_invoices WHERE factory_id=$1 AND id=$2 AND voided_at IS NULL' + (order ? ' AND order_id=$3' : ''), order ? [f, b.invoiceId, order.id] : [f, b.invoiceId], c);
    if (!invoice) throw new ValidationError('Faktura topilmadi yoki bekor qilingan');
    if (!order) order = await one('SELECT * FROM orders WHERE factory_id=$1 AND id=$2 FOR UPDATE', [f, invoice.orderId], c);
    const paid = (await one('SELECT coalesce(sum(amount),0) AS s FROM finance_receipts WHERE factory_id=$1 AND invoice_id=$2 AND voided_at IS NULL', [f, invoice.id], c)).s;
    const remaining = money(invoice.amount - paid);
    if (amount > remaining + 0.001)
      throw new ValidationError(remaining > 0
        ? `To‘lov faktura №${invoice.number} qoldig‘idan (${fmt(remaining)} so‘m) oshmasin. Ortig‘ini alohida avans sifatida kiriting`
        : `Faktura №${invoice.number} to‘liq to‘langan. To‘lovni avans sifatida kiriting`);
    invoiceId = invoice.id;
  } else if (!order && b.orderId) {
    if (!isId(b.orderId)) throw new ValidationError('Buyurtma topilmadi');
    order = await one('SELECT * FROM orders WHERE factory_id=$1 AND id=$2 FOR UPDATE', [f, b.orderId], c);
    if (!order) throw new ValidationError('Buyurtma topilmadi');
  }
  const customer = customerName(order ? order.customer : b.customer);
  if (!customer) throw new ValidationError('Mijozni tanlang');
  if (order && b.customer && customerKey(b.customer) !== customerKey(order.customer)) throw new ValidationError('Buyurtma boshqa mijozga tegishli');
  await assertMonthOpen(c, f, b.date);
  return one(`INSERT INTO finance_receipts(factory_id,order_id,invoice_id,request_id,date,amount,note,created_by,method,doc_number,customer)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING ${receiptCols}`,
    [f, order?.id || null, invoiceId, b.requestId, b.date, amount, text(b.note, 1000), actor(req), method, text(b.docNumber, 80), customer], c);
}

/** To'lovni bekor qilish (yopilgan oyda — taqiqlangan) */
export async function voidReceipt(c, req, id, reason, orderId = null) {
  if (!isId(id) || !text(reason, 500)) throw new ValidationError('Bekor qilish sababi majburiy');
  const p = await one('SELECT id,order_id,date FROM finance_receipts WHERE factory_id=$1 AND id=$2 AND voided_at IS NULL' + (orderId ? ' AND order_id=$3' : '') + ' FOR UPDATE', orderId ? [req.factoryId, id, orderId] : [req.factoryId, id], c);
  if (!p) throw new ConflictError('Yozuv topilmadi yoki bekor qilingan');
  await assertMonthOpen(c, req.factoryId, p.date);
  return one('UPDATE finance_receipts SET voided_at=now(),void_reason=$3 WHERE factory_id=$1 AND id=$2 RETURNING id', [req.factoryId, id, text(reason, 500)], c);
}

const edit = (label, fn) => async (req, res) => {
  const result = await tx(async (c) => { await financeLock(c, req.factoryId); return fn(c, req, req.body || {}); });
  if (!result?.repeat) await audit(req, { action: 'update', entity: 'finance', entityId: result?.id || '', label, after: result });
  res.json(result?.doc || result);
};

r.get('/', async (req, res) => {
  const data = await tx(async (c) => { await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY'); return loadFinance(c, req.factoryId); });
  res.json({ today: today(), locks: [...data.locks].sort(), customers: customerLedger({ ...data, today: today() }) });
});

r.get('/statement', async (req, res) => {
  const { name, from, to } = req.query;
  if (!validDate(from) || !validDate(to) || from > to) throw new ValidationError('Davrni to‘g‘ri tanlang');
  const data = await tx(async (c) => { await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY'); return loadFinance(c, req.factoryId); });
  const customer = customerLedger({ ...data, today: today() }).find((x) => x.key === customerKey(name));
  if (!customer) return res.status(404).json({ error: 'Mijoz topilmadi' });
  res.json(customerStatement(customer, from, to));
});

/* ---------- Boshlang'ich qoldiq ---------- */
r.post('/openings', edit('Mijozning boshlang‘ich qoldig‘i', async (c, req, b) => {
  if (!isId(b.requestId)) throw new ValidationError('So‘rov raqami noto‘g‘ri');
  const old = await one('SELECT ' + openingCols + ' FROM finance_customer_openings WHERE factory_id=$1 AND request_id=$2', [req.factoryId, b.requestId], c);
  if (old) return { doc: old, repeat: true };
  const customer = customerName(text(b.customer, 160));
  if (!customer) throw new ValidationError('Mijoz nomini kiriting');
  if (!['debt', 'advance'].includes(b.kind)) throw new ValidationError('Qoldiq turini tanlang: qarz yoki avans');
  if (!validDate(b.date) || b.date > today()) throw new ValidationError('Sana noto‘g‘ri');
  const amount = number(b.amount, 'Summa', 0.01, 1e12);
  if (await one("SELECT id FROM finance_customer_openings WHERE factory_id=$1 AND lower(regexp_replace(btrim(customer), '\\s+', ' ', 'g'))=$2 AND voided_at IS NULL", [req.factoryId, customerKey(customer)], c))
    throw new ConflictError('Bu mijoz uchun boshlang‘ich qoldiq allaqachon kiritilgan. O‘zgartirish uchun avvalgisini bekor qiling');
  await assertMonthOpen(c, req.factoryId, b.date);
  const doc = await one(`INSERT INTO finance_customer_openings(factory_id,request_id,customer,inn,date,kind,amount,note,created_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING ${openingCols}`, [req.factoryId, b.requestId, customer, text(b.inn, 20), b.date, b.kind, amount, text(b.note, 500), actor(req)], c);
  return { id: doc.id, doc };
}));
r.post('/openings/:id/void', edit('Mijozning boshlang‘ich qoldig‘i bekor qilindi', async (c, req, b) => {
  if (!isId(req.params.id) || !text(b.reason, 500)) throw new ValidationError('Bekor qilish sababi majburiy');
  const op = await one('SELECT id,date FROM finance_customer_openings WHERE factory_id=$1 AND id=$2 AND voided_at IS NULL FOR UPDATE', [req.factoryId, req.params.id], c);
  if (!op) throw new ConflictError('Yozuv topilmadi yoki bekor qilingan');
  await assertMonthOpen(c, req.factoryId, op.date);
  return one('UPDATE finance_customer_openings SET voided_at=now(),void_reason=$3 WHERE factory_id=$1 AND id=$2 RETURNING id', [req.factoryId, op.id, text(b.reason, 500)], c);
}));

/* ---------- Mijoz bo'yicha to'lov ---------- */
r.post('/receipts', edit('Mijozdan to‘lov', (c, req, b) => createReceipt(c, req, b)));
r.post('/receipts/:id/void', edit('Mijoz to‘lovi bekor qilindi', (c, req, b) => voidReceipt(c, req, req.params.id, b.reason)));

/* ---------- Faktura to'lov muddati ---------- */
r.post('/invoices/:id/due-date', edit('Fakturaning to‘lov muddati', async (c, req, b) => {
  if (!isId(req.params.id)) throw new ValidationError('Faktura topilmadi');
  const due = b.dueDate || null;
  const inv = await one('SELECT id,date FROM finance_invoices WHERE factory_id=$1 AND id=$2 AND voided_at IS NULL FOR UPDATE', [req.factoryId, req.params.id], c);
  if (!inv) throw new ConflictError('Faktura topilmadi yoki bekor qilingan');
  if (due && (!validDate(due) || due < inv.date)) throw new ValidationError('To‘lov muddati faktura sanasidan oldin bo‘lmasin');
  return one('UPDATE finance_invoices SET due_date=$3 WHERE factory_id=$1 AND id=$2 RETURNING id,due_date', [req.factoryId, inv.id, due], c);
}));

export default r;
