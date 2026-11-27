// Mijoz nomini tozalash va solishtirish kaliti.
// Excel/CSV dan ko'chirilganda nomlar «""AZALIS" MCHJ"» kabi ortiqcha qo'shtirnoq bilan kelishi mumkin,
// tirnoqlar turli («», “”, ″), apostroflar turli (` ‘ ’ ʻ ʼ '). Bitta mijoz ikki marta chiqmasligi uchun
// saqlashda nom tozalanadi, solishtirishda esa kalit ishlatiladi.
// Diqqat: SQL dagi clean_customer() (sql/038_customer_names.sql) shu cleanCustomerName bilan bir xil ishlashi kerak.

const DOUBLE_QUOTES = /[«»“”„‟″〝〞＂]/g;
const APOSTROPHES = /[`‘’‛ʻʼʹ´'′]/g;

/** Saqlash uchun nom: bo'sh joylar bitta, tirnoqlar bir xil, ortiqcha (CSV) qo'shtirnoqlar olib tashlanadi */
export function cleanCustomerName(name) {
  let s = String(name ?? '').replace(DOUBLE_QUOTES, '"').replace(/\s+/g, ' ').trim();
  s = s.replace(/"{2,}/g, '"');
  const quotes = (s.match(/"/g) || []).length;
  if (quotes % 2 === 1) {
    // «"AZALIS" MCHJ"» → «"AZALIS" MCHJ»; yolg'iz tirnoq chetda bo'lsa — olib tashlanadi
    if (s.length > 1 && s.startsWith('"') && s.endsWith('"')) s = s.slice(0, -1);
    else if (quotes === 1 && s.endsWith('"')) s = s.slice(0, -1);
    else if (quotes === 1 && s.startsWith('"')) s = s.slice(1);
  }
  return s.replace(/\s+/g, ' ').trim();
}

/** Solishtirish kaliti: katta-kichik harf, tirnoqlar, apostrof turi va bo'sh joylar hisobga olinmaydi */
export function customerKey(name) {
  return cleanCustomerName(name)
    .toLowerCase()
    .replace(/"/g, ' ')
    .replace(APOSTROPHES, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Bazada shu mijoz bor bo'lsa — o'sha nom qaytadi (yangi buyurtma eski mijozga qo'shiladi).
 * Aks holda tozalangan nom qaytadi.
 */
export async function canonicalCustomer(q, factoryId, name, client) {
  const clean = cleanCustomerName(name);
  if (!clean) return clean;
  const key = customerKey(clean);
  const { rows } = await q(
    `SELECT customer FROM (
       SELECT customer, min(created_at) AS t FROM orders WHERE factory_id=$1 GROUP BY customer
       UNION ALL SELECT customer, min(created_at) FROM finance_customer_openings WHERE factory_id=$1 AND voided_at IS NULL GROUP BY customer
     ) x ORDER BY t`,
    [factoryId],
    client,
  );
  const found = rows.find((r) => customerKey(r.customer) === key);
  return found ? cleanCustomerName(found.customer) : clean;
}
