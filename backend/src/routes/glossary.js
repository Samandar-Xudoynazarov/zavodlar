// Lug'at: nomlar va tayyor iboralarning o'zbekcha / ruscha shakli. /api/glossary ostida.
// Ko'rish — hamma rollar (ekranda tarjima uchun); qo'shish, tahrirlash, o'chirish — admin, rahbar, pto.
import { Router } from 'express';
import { one, rows } from '../db.js';
import { isId, ValidationError } from '../valid.js';
import { audit } from '../audit.js';

const r = Router();
export const GLOSSARY_WRITE_ROLES = ['admin', 'rahbar', 'pto'];
const cols = 'id,uz,ru,kind,created_at,updated_at';
const writeOnly = (req, res, next) => GLOSSARY_WRITE_ROLES.includes(req.user.role) ? next() : res.status(403).json({ error: 'Lug‘atni faqat admin, rahbar yoki PTO o‘zgartiradi' });
const who = (u) => ({ id: String(u.id), name: u.name || u.username });
const norm = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

export function cleanEntry(b) {
  const uz = norm(b?.uz), ru = norm(b?.ru), kind = b?.kind === undefined || b?.kind === '' ? 'name' : b.kind;
  if (!uz) throw new ValidationError('O‘zbekcha matnni kiriting');
  if (!ru) throw new ValidationError('Ruscha matnni kiriting');
  if (uz.length > 300 || ru.length > 300) throw new ValidationError('Matn 300 belgidan oshmasin');
  if (!['name', 'phrase'].includes(kind)) throw new ValidationError('Turi noto‘g‘ri');
  return { uz, ru, kind };
}

r.get('/', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const items = await rows(`SELECT ${cols} FROM glossary WHERE factory_id=$1 ORDER BY kind, lower(uz)`, [req.factoryId]);
  res.json({ items, canEdit: GLOSSARY_WRITE_ROLES.includes(req.user.role) });
});

// Lug'atga qo'shish uchun nomzodlar: shu zavodda ishlatilayotgan nomlar
r.get('/candidates', writeOnly, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const list = await rows(
    `SELECT DISTINCT ON (lower(btrim(text))) btrim(text) AS text, source FROM (
       SELECT name AS text, 'product' AS source FROM products WHERE factory_id=$1
       UNION ALL SELECT name, 'material' FROM materials WHERE factory_id=$1 AND NOT archived
       UNION ALL SELECT name, 'supplier' FROM suppliers WHERE factory_id=$1 AND NOT archived
       UNION ALL SELECT customer, 'customer' FROM orders WHERE factory_id=$1
       UNION ALL SELECT name, 'department' FROM hr_departments WHERE factory_id=$1
     ) x WHERE btrim(coalesce(text, '')) <> '' ORDER BY lower(btrim(text)), source LIMIT 3000`,
    [req.factoryId]
  );
  res.json({ items: list });
});

r.post('/', writeOnly, async (req, res) => {
  const v = cleanEntry(req.body);
  const row = await one(`INSERT INTO glossary(factory_id,uz,ru,kind,created_by) VALUES($1,$2,$3,$4,$5) RETURNING ${cols}`, [req.factoryId, v.uz, v.ru, v.kind, who(req.user)]);
  await audit(req, { action: 'create', entity: 'glossary', entityId: row.id, label: `${v.uz} / ${v.ru}`, after: v });
  res.status(201).json(row);
});

r.put('/:id', writeOnly, async (req, res) => {
  if (!isId(req.params.id)) throw new ValidationError('Yozuv topilmadi');
  const v = cleanEntry(req.body);
  const old = await one(`SELECT ${cols} FROM glossary WHERE factory_id=$1 AND id=$2`, [req.factoryId, req.params.id]);
  if (!old) return res.status(404).json({ error: 'Yozuv topilmadi' });
  const row = await one(`UPDATE glossary SET uz=$3,ru=$4,kind=$5,updated_by=$6,updated_at=now() WHERE factory_id=$1 AND id=$2 RETURNING ${cols}`, [req.factoryId, req.params.id, v.uz, v.ru, v.kind, who(req.user)]);
  await audit(req, { action: 'update', entity: 'glossary', entityId: row.id, label: `${v.uz} / ${v.ru}`, before: { uz: old.uz, ru: old.ru, kind: old.kind }, after: v });
  res.json(row);
});

r.delete('/:id', writeOnly, async (req, res) => {
  if (!isId(req.params.id)) throw new ValidationError('Yozuv topilmadi');
  const row = await one(`DELETE FROM glossary WHERE factory_id=$1 AND id=$2 RETURNING ${cols}`, [req.factoryId, req.params.id]);
  if (!row) return res.status(404).json({ error: 'Yozuv topilmadi' });
  await audit(req, { action: 'delete', entity: 'glossary', entityId: row.id, label: `${row.uz} / ${row.ru}`, before: { uz: row.uz, ru: row.ru, kind: row.kind } });
  res.json({ ok: true });
});

export default r;
