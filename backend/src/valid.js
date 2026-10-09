/*
 * Kiruvchi ma'lumotlarni tekshirish va tozalash (Mongoose sxemasi o'rnida).
 * Har bir model — maydonlar ro'yxati. clean() faqat ruxsat etilgan maydonlarni oladi,
 * turini tekshiradi va xato bo'lsa ValidationError (400) tashlaydi.
 */
import { cleanItems, cleanContract } from "./orders.js";

export class ValidationError extends Error {
  constructor(msg) {
    super(msg);
    this.status = 400;
  }
}
/** Boshqa foydalanuvchi shu yozuvni oldinroq o'zgartirgan (409) */
export class ConflictError extends Error {
  constructor(msg) {
    super(msg);
    this.status = 409;
  }
}
const fail = (msg) => {
  throw new ValidationError(msg);
};

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isId = (v) => typeof v === "string" && UUID_RE.test(v);
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Haqiqiy kalendar sanasi: 2026-02-30 yoki 2026-99-99 o'tmaydi */
export const validDate = (s) => {
  if (typeof s !== "string" || !DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};
/** Oy: YYYY-MM, 01–12 */
export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const validMonth = (s) => typeof s === "string" && MONTH_RE.test(s);

/* ---------- maydon turlari ---------- */
export const t = {
  str: (max, o = {}) => ({ kind: "str", max, ...o }),
  num: (o = {}) => ({ kind: "num", ...o }),
  int: (o = {}) => ({ kind: "num", int: true, ...o }),
  bool: (o = {}) => ({ kind: "bool", ...o }),
  oneOf: (list, o = {}) => ({ kind: "enum", list, ...o }),
  id: (o = {}) => ({ kind: "id", ...o }),
  date: (o = {}) => ({ kind: "date", ...o }),
  json: (fn, o = {}) => ({ kind: "json", fn, ...o }),
};

function one(name, f, v) {
  const label = f.label || name;
  if (v === undefined) return undefined;
  if (v === null && f.nullable) return null;
  switch (f.kind) {
    case "str": {
      if (v === null) v = "";
      if (typeof v === "object") fail(`«${label}» matn bo'lishi kerak`);
      let s = String(v);
      if (f.trim !== false) s = s.trim();
      if (f.required && !s) fail(f.required === true ? `«${label}» kiritilmagan` : f.required);
      if (f.max && s.length > f.max) fail(`«${label}» juda uzun (ko'pi bilan ${f.max} belgi)`);
      if (f.match && s && !f.match[0].test(s)) fail(f.match[1]);
      return s;
    }
    case "num": {
      if (v === "" || v === null) {
        if (f.nullable) return null;
        if (f.required) fail(`«${label}» kiritilmagan`);
        return f.default ?? 0;
      }
      const n = Number(v);
      if (!Number.isFinite(n)) fail(`«${label}» son bo'lishi kerak`);
      if (f.min !== undefined && n < f.min) fail(f.minMsg || `«${label}» ${f.min} dan kam bo'lmasin`);
      if (f.max !== undefined && n > f.max) fail(`«${label}» ${f.max} dan oshmasin`);
      return f.int ? Math.round(n) : n;
    }
    case "bool":
      return Boolean(v);
    case "enum":
      if (!f.list.includes(v)) fail(`«${label}» qiymati noto'g'ri`);
      return v;
    case "id":
      if (!isId(String(v))) fail(`Noto'g'ri qiymat: ${label}`);
      return String(v);
    case "date":
      if (v === "" && f.empty) return "";
      if (!validDate(v)) fail(`«${label}» sana formati YYYY-MM-DD`);
      return v;
    case "json":
      return f.fn(v, label);
    default:
      return v;
  }
}

/**
 * spec bo'yicha tozalaydi. partial=false — yo'q maydonlarga default qo'yiladi va required tekshiriladi.
 * Qaytaradi: { maydon: qiymat } (camelCase)
 */
export function clean(spec, data, { partial = false, only = null } = {}) {
  const src = data && typeof data === "object" ? data : {};
  const out = {};
  for (const [name, f] of Object.entries(spec)) {
    if (only && !only.includes(name)) continue;
    let v = src[name];
    if (v === undefined) {
      if (partial) continue;
      if (f.required) fail(f.required === true ? `«${f.label || name}» kiritilmagan` : f.required);
      if (f.default === undefined) continue;
      v = typeof f.default === "function" ? f.default() : f.default;
      out[name] = v;
      continue;
    }
    out[name] = one(name, f, v);
  }
  return out;
}

/* ---------- ichki ro'yxatlar (jsonb) ---------- */
const arr = (v, label) => {
  if (v === null || v === undefined) return [];
  if (!Array.isArray(v)) fail(`«${label}» ro'yxat (massiv) bo'lishi kerak`);
  return v.filter((x) => x && typeof x === "object" && !Array.isArray(x));
};
const sub = (spec) => (v, label) => arr(v, label).map((x) => clean(spec, x));

export const ROW_TYPES = ["m3", "kg", "pctPrev", "pctSS", "fixed"];
export const BRAK_REASONS = ["yoriq", "olcham", "armatura", "beton", "qolip", "tashish", "saqlash", "boshqa"];

export const normLines = sub({ materialId: t.id({ required: "Material tanlanmagan" }), norm: t.num({ required: true, min: 0, label: "Norma" }) });
const costRows = sub({
  name: t.str(120, { required: "Xarajat nomi kiritilmagan" }),
  type: t.oneOf(ROW_TYPES, { default: "m3" }),
  value: t.num({ default: 0 }),
});
export function calc(v, label = "calc") {
  if (v === null || v === undefined) v = {};
  if (typeof v !== "object" || Array.isArray(v)) fail(`«${label}» noto'g'ri`);
  return clean(
    {
      items: t.json(normLines, { default: () => [] }),
      metalKg: t.num({ min: 0, default: 0 }),
      prodRows: t.json(costRows, { default: () => [] }),
      otherRows: t.json(costRows, { default: () => [] }),
      margin: t.num({ default: 20 }),
      vat: t.num({ default: 12 }),
      scheme: t.str(40, { default: "" }),
    },
    v
  );
}
export const costRowsList = costRows;

const qty0 = { min: 0, minMsg: "Manfiy son kiritib bo'lmaydi", default: 0 };
export const prodLines = sub({
  productId: t.id({ required: "Mahsulot tanlanmagan" }),
  plan: t.num(qty0),
  fact: t.num(qty0),
  brak: t.num(qty0),
  brakReason: t.oneOf(["", ...BRAK_REASONS], { default: "" }),
  note: t.str(300, { default: "" }),
});
export const matLines = sub({ materialId: t.id({ required: "Material tanlanmagan" }), sarf: t.num(qty0), kirim: t.num(qty0) });
export const shipLines = sub({
  productId: t.id({ required: "Mahsulot tanlanmagan" }),
  qty: t.num({ required: true, min: 1, minMsg: "Soni kamida 1", label: "Soni" }),
  customer: t.str(160, { default: "" }),
  vehicle: t.str(40, { default: "" }),
  orderId: t.id({ nullable: true, default: null }),
});
// buyurtma qatorlari: bitta buyurtmada bir nechta mahsulot — [{ productId, qty, price, shippedBefore }]
// tekshirish orders.js dagi cleanItems bilan (pto-app bilan bir xil qoidalar)
export function orderItems(v) {
  const r = cleanItems(v, isId);
  if (r.error) fail(r.error);
  return r.items;
}
export const strList = (max, n) => (v, label) => arr0(v, label).map((x) => String(x).slice(0, max)).slice(0, n);
const arr0 = (v, label) => {
  if (v === null || v === undefined) return [];
  if (!Array.isArray(v)) fail(`«${label}» ro'yxat (massiv) bo'lishi kerak`);
  return v.filter((x) => x !== null && x !== undefined && typeof x !== "object");
};

/* ---------- jadvallar ---------- */
export const MATERIAL_GROUPS = ["beton", "xomashyo", "metall", "zaklad", "yoqilgi", "ehtiyot", "boshqa", "xizmat"];
export const STATUSES = ["yangi", "jarayonda", "tayyor", "topshirildi"];
export const MOVE_TYPES = ["in", "out"];
export const TARGET_KINDS = ["department", "vehicle"];
export const VEHICLE_LOG_KINDS = ["tamir", "to", "meter", "boshqa"];

export const SPEC = {
  material: {
    name: t.str(160, { required: "Nomi kiritilmagan" }),
    unit: t.str(20, { default: "шт" }),
    group: t.oneOf(MATERIAL_GROUPS, { default: "boshqa", label: "Guruh" }),
    price: t.num({ min: 0, default: 0, label: "Narx" }),
    stock: t.bool({ default: true }),
    electrodeBase: t.bool({ default: false }),
    isElectrode: t.bool({ default: false }),
    code: t.str(40, { default: "" }),
    minQty: t.num({ min: 0, default: 0 }),
    kgPerM: t.num({ min: 0, nullable: true, default: null }),
    archived: t.bool({ default: false }),
    recipe: t.json(normLines, { default: () => [] }),
    writeoff: t.json(normLines, { default: () => [] }),
    sort: t.int({ default: 0 }),
  },
  product: {
    code: t.str(60, { required: "Marka kiritilmagan" }),
    name: t.str(160, { default: "" }),
    group: t.str(60, { default: "Бошқа" }),
    norms: t.json(normLines, { default: () => [] }),
    calc: t.json(calc, { default: () => calc({}) }),
    notes: t.json(strList(500, 50), { default: () => [] }),
    forms: t.num({ min: 0, minMsg: "Qoliplar soni manfiy bo'lmaydi", default: 0 }),
    cycleDays: t.num({ min: 0.1, minMsg: "Aylanish muddati kamida 0,1 kun", default: 1 }),
    sort: t.int({ default: 0 }),
  },
  order: {
    customer: t.str(200, { required: "Buyurtmachi kiritilmagan" }),
    contractNo: t.json((v) => cleanContract(v), { default: "" }), // shartnoma (договор) raqami, masalan «ЕКМ 13»
    items: t.json(orderItems, { required: "Kamida bitta mahsulot qo'shing" }),
    date: t.date({ empty: true, default: "" }),
    deadline: t.date({ empty: true, default: "" }),
    status: t.oneOf(STATUSES, { default: "yangi", label: "Holat" }),
    note: t.str(500, { default: "" }),
  },
  target: {
    kind: t.oneOf(TARGET_KINDS, { required: "Turi tanlanmagan", label: "Turi" }),
    name: t.str(120, { required: "Nomi kiritilmagan" }),
    code: t.str(40, { default: "" }),
    archived: t.bool({ default: false }),
    meterUnit: t.oneOf(["km", "soat"], { default: "km" }),
    fuelNorm: t.num({ min: 0, minMsg: "Manfiy son kiritib bo'lmaydi", default: 0 }),
    serviceEvery: t.num({ min: 0, minMsg: "Manfiy son kiritib bo'lmaydi", default: 0 }),
  },
  supplier: {
    name: t.str(160, { required: "Nomi kiritilmagan" }),
    phone: t.str(60, { default: "" }),
    inn: t.str(20, { default: "" }),
    contact: t.str(120, { default: "" }),
    note: t.str(300, { default: "" }),
    archived: t.bool({ default: false }),
  },
  factory: {
    code: t.str(30, { required: "Zavod kodi kiritilmagan", match: [/^[a-z0-9-]+$/, "Zavod kodi: lotin kichik harflar, raqam va «-»"] }),
    name: t.str(120, { required: "Zavod nomi kiritilmagan" }),
    kind: t.oneOf(["beton", "metall"], { default: "beton", label: "Zavod turi" }),
    sort: t.int({ default: 0 }),
    archived: t.bool({ default: false }),
  },
};

/* ---------- SQL yasash ---------- */
const COL = { group: "grp" };
export const col = (k) => COL[k] || k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const val = (v) => (v !== null && typeof v === "object" && !(v instanceof Date) ? JSON.stringify(v) : v);

/** INSERT ... RETURNING *  — obj camelCase */
export function insertSql(table, obj) {
  const keys = Object.keys(obj);
  return {
    text: `INSERT INTO ${table} (${keys.map(col).join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING *`,
    values: keys.map((k) => val(obj[k])),
  };
}
/** UPDATE ... WHERE id AND factory_id RETURNING * */
export function updateSql(table, id, factoryId, obj) {
  const keys = Object.keys(obj);
  const sets = keys.map((k, i) => `${col(k)} = $${i + 3}`);
  sets.push("updated_at = now()");
  return {
    text: `UPDATE ${table} SET ${sets.join(", ")} WHERE id = $1 ${factoryId ? "AND factory_id = $2" : "AND $2::uuid IS NULL"} RETURNING *`,
    values: [id, factoryId, ...keys.map((k) => val(obj[k]))],
  };
}
