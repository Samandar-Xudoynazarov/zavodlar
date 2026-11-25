// Moliyaviy oyni yopish (qulflash).
// assertMonthOpen(client, factoryId, date) — yozuv sanasi yopilgan oyga tushsa ConflictError (409) tashlaydi.
// Boshqa yo'llar (eski jo'natmalar, material fakturalari, ta'minotchilar) ham shuni chaqiradi.
import { one, rows } from './db.js';
import { ConflictError, ValidationError, validDate, validMonth } from './valid.js';

export const monthOf = (date) => String(date || '').slice(0, 7);
const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
export const monthLabel = (m) => (validMonth(m) ? `${MONTHS[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}` : String(m || ''));

/** Oy yopilganmi (qayta ochilmagan qulf bor) */
export async function isMonthLocked(client, factoryId, date) {
  const m = monthOf(date);
  if (!validMonth(m)) return false;
  return !!(await one('SELECT 1 AS locked FROM finance_period_locks WHERE factory_id=$1 AND month=$2 AND reopened_at IS NULL', [factoryId, m], client));
}

/** Yopilgan oyga yozuv kiritish/bekor qilishni taqiqlaydi */
export async function assertMonthOpen(client, factoryId, date) {
  if (!validDate(date) && !validMonth(date)) return; // sana tekshiruvi chaqiruvchi yo'lda bo'ladi
  if (await isMonthLocked(client, factoryId, date)) {
    const m = monthOf(date);
    throw new ConflictError(`${monthLabel(m)} oyi yopilgan. Bu oyga yozuv kiritib yoki bekor qilib bo‘lmaydi. To‘g‘rilash kerak bo‘lsa, rahbar oyni sababini yozib qayta ochsin`);
  }
}

/** Bir nechta sana (masalan, faktura va unga bog'langan to'lov) */
export async function assertMonthsOpen(client, factoryId, dates) {
  for (const d of [...new Set(dates.filter(Boolean).map(monthOf))]) await assertMonthOpen(client, factoryId, d);
}

export const listLocks = (factoryId, client) =>
  rows('SELECT month,locked_at,locked_by,note,reopened_at,reopened_by,reopen_reason FROM finance_period_locks WHERE factory_id=$1 ORDER BY month DESC', [factoryId], client);

export function requireMonth(m) {
  if (!validMonth(m)) throw new ValidationError('Oy formati YYYY-MM');
  return m;
}
