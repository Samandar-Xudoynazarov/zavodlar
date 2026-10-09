// Barcha yo'llar uchun umumiy yordamchilar
import { q, one, rows } from "./db.js";
import { isId } from "./valid.js";

export const todayTashkent = () => new Date(Date.now() + 5 * 36e5).toISOString().slice(0, 10);
export const round3 = (x) => Math.round(x * 1000) / 1000;
export const round6 = (x) => Math.round(x * 1e6) / 1e6;
export const who = (u) => ({ id: String(u.id), username: u.username, name: u.name || u.username });
export const notFound = (res) => res.status(404).json({ error: "Yozuv topilmadi" });
export const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj?.[k] !== undefined).map((k) => [k, obj[k]]));
export { isId };

/* ---------- sozlamalar (har zavodga bitta qator) ---------- */
const SETTINGS_OUT = (r) => ({
  id: r.factoryId,
  key: "main",
  factoryId: r.factoryId,
  electrodePct: r.electrodePct,
  company: r.company,
  signers: r.signers || [],
  opening: r.opening || { date: "", materials: {}, products: {} },
  calcTemplate: r.calcTemplate ?? null,
  costSchemes: r.costSchemes ?? null,
  plan: r.plan,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});
export async function getSettings(factoryId, client) {
  let r = await one("SELECT * FROM settings WHERE factory_id = $1", [factoryId], client);
  if (!r) r = await one("INSERT INTO settings (factory_id) VALUES ($1) ON CONFLICT (factory_id) DO UPDATE SET factory_id = EXCLUDED.factory_id RETURNING *", [factoryId], client);
  return SETTINGS_OUT(r);
}
export async function openingOf(factoryId, client) {
  const s = await getSettings(factoryId, client);
  return s.opening?.date ? s.opening : { date: "", materials: {}, products: {} };
}

/* ---------- ombor hisobi uchun ma'lumot yuklash ---------- */
// Sanalar matn 'YYYY-MM-DD' — oddiy solishtirish to'g'ri ishlaydi
export const loadDays = (fid, from, to, client) =>
  rows("SELECT date, production, materials, shipments FROM days WHERE factory_id = $1 AND date >= $2 AND date <= $3 ORDER BY date", [fid, from, to], client);
export const loadMoves = (fid, from, to, client, extra = "") =>
  rows(`SELECT type, date, material_id, qty, reason, price FROM movements WHERE factory_id = $1 AND date >= $2 AND date <= $3 ${extra}`, [fid, from, to], client);
export const loadPmoves = (fid, from, to, client) =>
  rows("SELECT type, date, product_id, to_product_id, qty FROM product_moves WHERE factory_id = $1 AND date >= $2 AND date <= $3", [fid, from, to], client);

/** Keyingi raqam (buyurtma, inventarizatsiya) — atomik; birinchi marta mavjud eng katta raqamdan boshlanadi */
export async function nextNo(factoryId, name, table, client) {
  const r = await q(
    `INSERT INTO counters (factory_id, name, seq)
       VALUES ($1, $2, COALESCE((SELECT max(no) FROM ${table} WHERE factory_id = $1), 0) + 1)
     ON CONFLICT (factory_id, name) DO UPDATE SET seq = counters.seq + 1
     RETURNING seq`,
    [factoryId, name],
    client
  );
  return r.rows[0].seq;
}
