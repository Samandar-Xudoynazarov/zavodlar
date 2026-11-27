// Ta'minotchilar: nomni aniqlash (avval STIR, keyin tozalangan nom) va shartnomalar bo'yicha hisob.
import { one, rows } from "./db.js";
import { cleanCustomerName, customerKey } from "./customer-name.js";
import { ValidationError } from "./valid.js";

const r2 = (x) => Math.round((+x || 0) * 100) / 100;
const DEBT = new Set(["invoice", "opening_debt"]);

/** STIR: bo'sh yoki 9 ta raqam */
export function supplierInn(value) {
  const inn = String(value ?? "").replace(/\s+/g, "");
  if (inn && !/^\d{9}$/.test(inn)) throw new ValidationError("STIR 9 ta raqamdan iborat bo‘lishi kerak");
  return inn;
}

/**
 * Ta'minotchini topadi yoki yaratadi. Avval STIR bo'yicha, keyin nom bo'yicha
 * (tirnoqlar, apostrof turi, bo'sh joy va harf katta-kichikligi hisobga olinmaydi — mijozlardagi kabi).
 * Topilgan ta'minotchida STIR bo'lmasa, berilgan STIR yoziladi.
 */
export async function resolveSupplier(c, factoryId, { name, inn = "" }) {
  const clean = cleanCustomerName(name).slice(0, 160);
  const tin = supplierInn(inn);
  if (!clean && !tin) throw new ValidationError("Ta’minotchi nomini kiriting");
  let found = tin
    ? await one("SELECT id,name,inn FROM suppliers WHERE factory_id=$1 AND inn=$2 AND NOT archived ORDER BY created_at LIMIT 1", [factoryId, tin], c)
    : null;
  if (!found && clean) {
    const key = customerKey(clean);
    const all = await rows("SELECT id,name,inn,archived FROM suppliers WHERE factory_id=$1 ORDER BY archived,created_at", [factoryId], c);
    found = all.find((s) => customerKey(s.name) === key && (!tin || !s.inn || s.inn === tin)) || null;
    if (found?.archived) {
      await c.query("UPDATE suppliers SET archived=false,updated_at=now() WHERE id=$1", [found.id]);
    }
  }
  if (found) {
    if (tin && !found.inn) await c.query("UPDATE suppliers SET inn=$2,updated_at=now() WHERE id=$1", [found.id, tin]);
    return { id: found.id, name: found.name, inn: found.inn || tin, created: false };
  }
  if (!clean) throw new ValidationError("Ta’minotchi nomini kiriting");
  const made = await one(
    "INSERT INTO suppliers(factory_id,name,inn) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id,name,inn",
    [factoryId, clean, tin],
    c,
  );
  if (made) return { ...made, created: true };
  // Bir vaqtda boshqa so'rov yaratgan bo'lsa
  const again = await one(
    "SELECT id,name,inn FROM suppliers WHERE factory_id=$1 AND lower(regexp_replace(btrim(name),'\\s+',' ','g'))=lower($2)",
    [factoryId, clean],
    c,
  );
  return { ...again, created: false };
}

/**
 * Ta'minotchi hisobini shartnomalar bo'yicha ajratadi.
 * ledger: supplier_ledger qatorlari (contractId bilan), contracts: finance_contracts.
 * Har bir shartnoma qarzi = shartnoma fakturalari qoldig'i − shartnoma to'lovlarining bog'lanmagan qismi.
 * «Shartnomasiz» qismi: boshlang'ich qoldiq va shartnomaga bog'lanmagan hujjatlar. Hammasi yig'indisi = umumiy qarz.
 */
export function supplierSummary(ledger, contracts = []) {
  const bucket = (contract) => ({
    id: contract?.id || null,
    number: contract?.number || "",
    date: contract?.date || "",
    name: contract?.name || "",
    total: r2(contract?.originalTotal),
    items: contract?.items || [],
    opening: 0, invoiced: 0, payments: 0, debt: 0, invoices: 0, docs: 0,
  });
  const byId = new Map(contracts.map((c) => [c.id, bucket(c)]));
  const none = bucket(null);
  const total = { opening: 0, invoiced: 0, paid: 0, debt: 0 };
  for (const row of ledger) {
    const b = (row.contractId && byId.get(row.contractId)) || none;
    const amount = +row.amount || 0, remaining = +row.remaining || 0;
    b.docs++;
    if (DEBT.has(row.kind)) b.debt += remaining; else b.debt -= remaining;
    if (row.kind === "invoice") { b.invoiced += amount; b.invoices++; total.invoiced += amount; }
    else if (row.kind === "payment") { b.payments += amount; total.paid += amount; }
    else if (row.kind === "opening_debt") { b.opening += amount; total.opening += amount; }
    else if (row.kind === "opening_advance") { b.opening -= amount; total.opening -= amount; }
  }
  const finish = (b) => {
    const debt = r2(b.debt);
    // To'langan = hujjatlar summasi − qolgan qarz (avansni bog'lash shartnomalar orasida o'tkazsa ham to'g'ri)
    const paid = r2(b.opening + b.invoiced - debt);
    return { ...b, opening: r2(b.opening), invoiced: r2(b.invoiced), payments: r2(b.payments), paid, debt, left: b.id ? r2(Math.max(0, b.total - b.invoiced)) : 0 };
  };
  total.debt = r2(total.opening + total.invoiced - total.paid);
  return {
    total: { opening: r2(total.opening), invoiced: r2(total.invoiced), paid: r2(total.paid), debt: total.debt },
    contracts: [...byId.values()].map(finish),
    unassigned: finish(none),
  };
}
