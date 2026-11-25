// Sifat nazorati: beton kub namunalarini sinash. /api/quality ostida.
// Ko'rish — hamma rollar; kiritish va tahrirlash — admin, rahbar, pto, usta.
import { Router } from 'express';
import { one, rows, tx } from '../db.js';
import { isId, validDate, ValidationError, ConflictError } from '../valid.js';
import { number, text } from '../payroll.js';
import { actor } from '../dispatch.js';
import { audit } from '../audit.js';

const r = Router();
export const QUALITY_WRITE_ROLES = ['admin', 'rahbar', 'pto', 'usta'];
const cols = 'id,cast_date,batch,grade,product_id,samples,required_mpa,r7_mpa,r28_mpa,lab,note,created_by,created_at,updated_by,updated_at,voided_at,void_reason';

/** Natija: 28 kunlik bo'lsa — talabga nisbatan; bo'lmasa 7 kunlik (odatda ~65–70%) ogohlantirish beradi */
export function qualityStatus(t, todayDate) {
  if (t.voidedAt) return 'void';
  const req = +t.requiredMpa;
  if (t.r28Mpa !== null && t.r28Mpa !== undefined) return +t.r28Mpa >= req ? 'ok' : 'fail';
  if (t.r7Mpa !== null && t.r7Mpa !== undefined && +t.r7Mpa < req * 0.6) return 'risk';
  const due = new Date(Date.parse(t.castDate + 'T00:00:00Z') + 28 * 864e5).toISOString().slice(0, 10);
  return todayDate && todayDate > due ? 'late' : 'pending';
}
const today = () => new Date(Date.now() + 5 * 36e5).toISOString().slice(0, 10);
const view = (t) => ({ ...t, status: qualityStatus(t, today()), percent: t.r28Mpa != null ? Math.round(+t.r28Mpa / +t.requiredMpa * 1000) / 10 : null });

const writeOnly = (req, res, next) => QUALITY_WRITE_ROLES.includes(req.user.role) ? next() : res.status(403).json({ error: 'Sinov natijasini faqat admin, rahbar, PTO yoki usta kiritadi' });

function clean(b) {
  if (!validDate(b.castDate)) throw new ValidationError('Quyilgan sanani kiriting');
  const grade = text(b.grade, 40);
  if (!grade) throw new ValidationError('Beton markasini (sinfini) kiriting');
  const opt = (v, label) => (v === null || v === undefined || v === '' ? null : number(v, label, 0, 200));
  const samples = b.samples === undefined || b.samples === '' ? 3 : Number(b.samples);
  if (!Number.isInteger(samples) || samples < 1 || samples > 50) throw new ValidationError('Namunalar soni 1–50');
  if (b.productId && !isId(b.productId)) throw new ValidationError('Mahsulot noto‘g‘ri');
  return {
    castDate: b.castDate, batch: text(b.batch, 80), grade, productId: b.productId || null, samples,
    requiredMpa: number(b.requiredMpa, 'Talab qilingan mustahkamlik', 0.1, 200),
    r7Mpa: opt(b.r7Mpa, '7 kunlik natija'), r28Mpa: opt(b.r28Mpa, '28 kunlik natija'),
    lab: text(b.lab, 120), note: text(b.note, 500),
  };
}
async function checkProduct(c, req, productId) {
  if (productId && !(await one('SELECT 1 AS x FROM products WHERE factory_id=$1 AND id=$2', [req.factoryId, productId], c))) throw new ValidationError('Mahsulot topilmadi');
}

r.get('/', async (req, res) => {
  const from = validDate(req.query.from) ? req.query.from : '0000-01-01';
  const to = validDate(req.query.to) ? req.query.to : '9999-12-31';
  const list = (await rows(`SELECT ${cols} FROM quality_tests WHERE factory_id=$1 AND cast_date BETWEEN $2 AND $3 ORDER BY cast_date DESC, created_at DESC`, [req.factoryId, from, to])).map(view);
  const live = list.filter((t) => t.status !== 'void');
  const summary = { total: live.length, ok: 0, fail: 0, risk: 0, pending: 0, late: 0 };
  for (const t of live) summary[t.status]++;
  res.json({ tests: list, summary, canEdit: QUALITY_WRITE_ROLES.includes(req.user.role) });
});

r.post('/', writeOnly, async (req, res) => {
  const b = req.body || {};
  if (!isId(b.requestId)) throw new ValidationError('So‘rov raqami noto‘g‘ri');
  const v = clean(b);
  const doc = await tx(async (c) => {
    const old = await one(`SELECT ${cols} FROM quality_tests WHERE factory_id=$1 AND request_id=$2`, [req.factoryId, b.requestId], c);
    if (old) return old;
    await checkProduct(c, req, v.productId);
    return one(`INSERT INTO quality_tests(factory_id,request_id,cast_date,batch,grade,product_id,samples,required_mpa,r7_mpa,r28_mpa,lab,note,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING ${cols}`,
    [req.factoryId, b.requestId, v.castDate, v.batch, v.grade, v.productId, v.samples, v.requiredMpa, v.r7Mpa, v.r28Mpa, v.lab, v.note, actor(req)], c);
  });
  await audit(req, { action: 'create', entity: 'qualityTest', entityId: doc.id, label: `Beton sinovi: ${doc.grade} ${doc.castDate}`, after: doc });
  res.json(view(doc));
});

r.put('/:id', writeOnly, async (req, res) => {
  if (!isId(req.params.id)) throw new ValidationError('Yozuv topilmadi');
  const v = clean(req.body || {});
  const { before, doc } = await tx(async (c) => {
    const before = await one(`SELECT ${cols} FROM quality_tests WHERE factory_id=$1 AND id=$2 FOR UPDATE`, [req.factoryId, req.params.id], c);
    if (!before) throw new ValidationError('Yozuv topilmadi');
    if (before.voidedAt) throw new ConflictError('Bekor qilingan yozuvni tahrirlab bo‘lmaydi');
    await checkProduct(c, req, v.productId);
    const doc = await one(`UPDATE quality_tests SET cast_date=$3,batch=$4,grade=$5,product_id=$6,samples=$7,required_mpa=$8,r7_mpa=$9,r28_mpa=$10,lab=$11,note=$12,updated_by=$13,updated_at=now()
      WHERE factory_id=$1 AND id=$2 RETURNING ${cols}`,
    [req.factoryId, before.id, v.castDate, v.batch, v.grade, v.productId, v.samples, v.requiredMpa, v.r7Mpa, v.r28Mpa, v.lab, v.note, actor(req)], c);
    return { before, doc };
  });
  await audit(req, { action: 'update', entity: 'qualityTest', entityId: doc.id, label: `Beton sinovi: ${doc.grade} ${doc.castDate}`, before, after: doc });
  res.json(view(doc));
});

r.post('/:id/void', writeOnly, async (req, res) => {
  if (!isId(req.params.id)) throw new ValidationError('Yozuv topilmadi');
  const reason = text(req.body?.reason, 500);
  if (reason.length < 3) throw new ValidationError('Bekor qilish sababini yozing');
  const doc = await one(`UPDATE quality_tests SET voided_at=now(),void_reason=$3 WHERE factory_id=$1 AND id=$2 AND voided_at IS NULL RETURNING ${cols}`, [req.factoryId, req.params.id, reason]);
  if (!doc) throw new ConflictError('Yozuv topilmadi yoki allaqachon bekor qilingan');
  await audit(req, { action: 'update', entity: 'qualityTest', entityId: doc.id, label: 'Beton sinovi bekor qilindi', changes: [{ p: 'sabab', a: null, b: reason }] });
  res.json(view(doc));
});

export default r;
