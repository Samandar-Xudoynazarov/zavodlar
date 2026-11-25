// Kuzatuvchi va kurator (4 zavodni nazorat qiluvchi) pulni umuman ko'rmaydi: zavodlar alohida MCHJ,
// moliya faqat o'z direktoriga (rahbar), buxgalter va adminga ko'rinadi.
// 1) Pulga oid bo'limlar butunlay yopiq. 2) Qolgan barcha javoblardan narx/summa maydonlari olib tashlanadi —
// ekrandan yashirish yetmaydi, server ularni umuman yubormaydi. Miqdorlar (qoldiq, reja/fakt, brak, kirim-chiqim) qoladi.
export const NO_MONEY_ROLES = ["kuzatuvchi", "kurator"];
export const noMoney = (user) => NO_MONEY_ROLES.includes(user?.role);

export const MONEY_KEYS = new Set([
  "price", "excelPrice", "minPrice", "maxPrice", "lastPrice", "prevPrice", "prices",
  "amount", "salary", "cost", "costs", "otherCosts", "originalTotal", "openingBalance", "balance",
  "receivable", "advance", "prodRows", "otherRows", "margin", "vat", "taxRate", "costSchemes",
  "kirimSum", "finance", "rates", "payments", "adjustments", "money", "revenue", "profit", "costs",
]);
const BLOCKED = /^\/(finance|acct-reports|suppliers|reconciliation|dispatch-documents|legacy-shipments|hr\/rates)(\/|$)/;

export function stripMoney(value, depth = 0) {
  if (depth > 40 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((x) => stripMoney(x, depth + 1));
  if (value instanceof Date || Buffer.isBuffer(value)) return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) if (!MONEY_KEYS.has(k)) out[k] = stripMoney(v, depth + 1);
  return out;
}

export function noMoneyGuard(req, res, next) {
  if (!noMoney(req.user)) return next();
  if (BLOCKED.test(req.path)) return res.status(403).json({ error: "Bu bo'lim faqat zavod direktori va buxgalteriya uchun" });
  const json = res.json.bind(res);
  res.json = (body) => json(res.statusCode >= 400 ? body : stripMoney(body));
  res.set("Cache-Control", "no-store");
  next();
}
