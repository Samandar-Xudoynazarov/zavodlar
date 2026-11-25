// Kassa va bank: /api/finance/cash ostida (moliya rollari: admin, rahbar, buxgalter).
// Hisoblar (naqd kassa yoki bank) va ularning kirim-chiqimi. Yopilgan oyga yozuv kiritib/bekor qilib bo'lmaydi.
import { Router } from 'express';
import { one, rows, tx } from '../db.js';
import { isId, validDate, ValidationError, ConflictError } from '../valid.js';
import { money, number, text } from '../payroll.js';
import { actor } from '../dispatch.js';
import { financeLock } from '../finance-integrity.js';
import { assertMonthOpen } from '../finance-period-lock.js';
import { audit } from '../audit.js';

const r = Router();
export const CASH_CATEGORIES = ['mijoz', 'taminotchi', 'oylik', 'soliq', 'xarajat', 'otkazma', 'boshqa'];
const accountCols = 'id,name,kind,opening_balance,opening_date,archived,created_at';
const entryCols = 'id,account_id,date,direction,amount,category,counterparty,doc_number,note,created_by,created_at,voided_at,void_reason';

/** Hisob qoldig'i: boshlang'ich + kirim − chiqim (sana `to` gacha, bekor qilinganlarsiz) */
export function accountBalances(accounts, entries, to = '9999-12-31') {
  return accounts.map((a) => {
    let inSum = 0, outSum = 0;
    for (const e of entries) {
      if (e.accountId !== a.id || e.voidedAt || e.date > to || e.date < a.openingDate) continue;
      if (e.direction === 'in') inSum += +e.amount; else outSum += +e.amount;
    }
    return { ...a, in: money(inSum), out: money(outSum), balance: money(+a.openingBalance + inSum - outSum) };
  });
}

r.get('/', async (req, res) => {
  const from = validDate(req.query.from) ? req.query.from : '0000-01-01';
  const to = validDate(req.query.to) ? req.query.to : '9999-12-31';
  if (from > to) throw new ValidationError('Sana oralig‘i noto‘g‘ri');
  const data = await tx(async (c) => {
    await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
    const accounts = await rows(`SELECT ${accountCols} FROM finance_cash_accounts WHERE factory_id=$1 ORDER BY archived, kind, name`, [req.factoryId], c);
    const all = await rows('SELECT account_id,date,direction,amount,voided_at FROM finance_cash_entries WHERE factory_id=$1 AND date<=$2', [req.factoryId, to], c);
    const entries = await rows(`SELECT ${entryCols} FROM finance_cash_entries WHERE factory_id=$1 AND date BETWEEN $2 AND $3 ORDER BY date DESC, created_at DESC`, [req.factoryId, from, to], c);
    return { accounts: accountBalances(accounts, all, to), entries };
  });
  res.json({ ...data, categories: CASH_CATEGORIES });
});

r.post('/accounts', async (req, res) => {
  const b = req.body || {};
  const name = text(b.name, 120), kind = b.kind;
  if (!name) throw new ValidationError('Hisob nomini yozing');
  if (!['naqd', 'bank'].includes(kind)) throw new ValidationError('Hisob turi: naqd yoki bank');
  if (!validDate(b.openingDate)) throw new ValidationError('Boshlang‘ich qoldiq sanasini kiriting');
  const opening = number(b.openingBalance ?? 0, 'Boshlang‘ich qoldiq', -1e13, 1e13);
  const doc = await tx(async (c) => {
    await financeLock(c, req.factoryId);
    if (await one('SELECT 1 AS x FROM finance_cash_accounts WHERE factory_id=$1 AND lower(btrim(name))=lower($2)', [req.factoryId, name], c)) throw new ConflictError('Bu nomli hisob bor');
    return one(`INSERT INTO finance_cash_accounts(factory_id,name,kind,opening_balance,opening_date,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING ${accountCols}`, [req.factoryId, name, kind, opening, b.openingDate, actor(req)], c);
  });
  await audit(req, { action: 'create', entity: 'cashAccount', entityId: doc.id, label: `Kassa/bank hisobi: ${name}`, after: doc });
  res.status(201).json(doc);
});

r.put('/accounts/:id', async (req, res) => {
  if (!isId(req.params.id)) throw new ValidationError('Hisob topilmadi');
  const b = req.body || {};
  const doc = await tx(async (c) => {
    await financeLock(c, req.factoryId);
    const old = await one(`SELECT ${accountCols} FROM finance_cash_accounts WHERE factory_id=$1 AND id=$2 FOR UPDATE`, [req.factoryId, req.params.id], c);
    if (!old) throw new ValidationError('Hisob topilmadi');
    const name = b.name === undefined ? old.name : text(b.name, 120);
    if (!name) throw new ValidationError('Hisob nomini yozing');
    if (name.toLowerCase() !== old.name.toLowerCase() && await one('SELECT 1 AS x FROM finance_cash_accounts WHERE factory_id=$1 AND lower(btrim(name))=lower($2)', [req.factoryId, name], c)) throw new ConflictError('Bu nomli hisob bor');
    const archived = b.archived === undefined ? old.archived : Boolean(b.archived);
    return one(`UPDATE finance_cash_accounts SET name=$3,archived=$4 WHERE factory_id=$1 AND id=$2 RETURNING ${accountCols}`, [req.factoryId, old.id, name, archived], c);
  });
  await audit(req, { action: 'update', entity: 'cashAccount', entityId: doc.id, label: `Kassa/bank hisobi: ${doc.name}`, after: doc });
  res.json(doc);
});

r.post('/entries', async (req, res) => {
  const b = req.body || {};
  if (!isId(b.requestId)) throw new ValidationError('So‘rov raqami noto‘g‘ri');
  if (!isId(b.accountId)) throw new ValidationError('Kassa yoki bank hisobini tanlang');
  if (!validDate(b.date)) throw new ValidationError('Sanani kiriting');
  if (!['in', 'out'].includes(b.direction)) throw new ValidationError('Kirim yoki chiqimni tanlang');
  if (!CASH_CATEGORIES.includes(b.category)) throw new ValidationError('Turini tanlang');
  const amount = number(b.amount, 'Summa', 0.01, 1e13);
  const doc = await tx(async (c) => {
    await financeLock(c, req.factoryId);
    const old = await one(`SELECT ${entryCols} FROM finance_cash_entries WHERE factory_id=$1 AND request_id=$2`, [req.factoryId, b.requestId], c);
    if (old) return old;
    const acc = await one('SELECT id,archived,opening_date FROM finance_cash_accounts WHERE factory_id=$1 AND id=$2', [req.factoryId, b.accountId], c);
    if (!acc) throw new ValidationError('Hisob topilmadi');
    if (acc.archived) throw new ConflictError('Bu hisob yopilgan (arxivda)');
    if (b.date < acc.openingDate) throw new ValidationError('Sana hisobning boshlang‘ich qoldiq sanasidan oldin bo‘lmasin');
    await assertMonthOpen(c, req.factoryId, b.date);
    return one(`INSERT INTO finance_cash_entries(factory_id,account_id,request_id,date,direction,amount,category,counterparty,doc_number,note,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING ${entryCols}`,
    [req.factoryId, acc.id, b.requestId, b.date, b.direction, amount, b.category, text(b.counterparty, 200), text(b.docNumber, 80), text(b.note, 500), actor(req)], c);
  });
  await audit(req, { action: 'create', entity: 'cashEntry', entityId: doc.id, label: `Kassa ${doc.direction === 'in' ? 'kirimi' : 'chiqimi'}: ${doc.amount}`, after: doc });
  res.json(doc);
});

r.post('/entries/:id/void', async (req, res) => {
  if (!isId(req.params.id)) throw new ValidationError('Yozuv topilmadi');
  const reason = text(req.body?.reason, 500);
  if (reason.length < 3) throw new ValidationError('Bekor qilish sababini yozing');
  const doc = await tx(async (c) => {
    await financeLock(c, req.factoryId);
    const old = await one(`SELECT ${entryCols} FROM finance_cash_entries WHERE factory_id=$1 AND id=$2 FOR UPDATE`, [req.factoryId, req.params.id], c);
    if (!old) throw new ValidationError('Yozuv topilmadi');
    if (old.voidedAt) throw new ConflictError('Yozuv allaqachon bekor qilingan');
    await assertMonthOpen(c, req.factoryId, old.date);
    return one(`UPDATE finance_cash_entries SET voided_at=now(),void_reason=$3 WHERE factory_id=$1 AND id=$2 RETURNING ${entryCols}`, [req.factoryId, old.id, reason], c);
  });
  await audit(req, { action: 'update', entity: 'cashEntry', entityId: doc.id, label: 'Kassa yozuvi bekor qilindi', changes: [{ p: 'sabab', a: null, b: reason }] });
  res.json(doc);
});

export default r;
