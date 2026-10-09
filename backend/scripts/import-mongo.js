// Eski ilova (pto-app, MongoDB) zaxira nusxasini PostgreSQL'dagi bitta zavodga ko'chiradi.
//
//   1) Eski ilovada: «Boshqaruv → Zaxira nusxa → Yuklab olish» → pto-backup-....json
//   2) npm run import-mongo -- pto-backup-2026-09-30-10-00.json zavod-1            — nima ko'chishini ko'rsatadi
//      npm run import-mongo -- pto-backup-2026-09-30-10-00.json zavod-1 --yes      — ko'chiradi
//      npm run import-mongo -- ... zavod-1 --yes --reset                           — zavoddagi eski ma'lumotni o'chirib, qaytadan
//
// Zavod kodi bo'yicha zavod bo'lmasa, yaratiladi (nomi: --name="2-zavod"). Foydalanuvchilar ko'chirilmaydi
// (zaxirada parollar yo'q) — ularni «Boshqaruv»da qaytadan qo'shing.
import fs from "node:fs";
import crypto from "node:crypto";
import { migrate, getPool, tx, one } from "../src/db.js";
import { insertSql } from "../src/valid.js";

const args = process.argv.slice(2);
const file = args.find((a) => a.endsWith(".json"));
const code = args.find((a) => !a.startsWith("--") && !a.endsWith(".json"));
const yes = args.includes("--yes");
const reset = args.includes("--reset");
const name = args.find((a) => a.startsWith("--name="))?.slice(7);
if (!file || !code) {
  console.log("Foydalanish: npm run import-mongo -- <zaxira.json> <zavod-kodi> [--yes] [--reset] [--name=\"Zavod nomi\"]");
  process.exit(1);
}
const backup = JSON.parse(fs.readFileSync(file, "utf8"));
const D = backup.data || {};
if (backup.app !== "pto" || !D.materials) {
  console.log("Bu eski ilova (pto) zaxira nusxasi emas");
  process.exit(1);
}

/* ---------- ObjectId → UUID ---------- */
const ids = new Map();
const oid = (v) => (v && typeof v === "object" ? v.$oid || String(v) : v);
const U = (v) => {
  const k = oid(v);
  if (k === null || k === undefined || k === "") return null;
  if (!ids.has(String(k))) ids.set(String(k), crypto.randomUUID());
  return ids.get(String(k));
};
const ts = (v) => (v ? new Date(v.$date || v) : new Date());
const mapLines = (arr, key) => (arr || []).map((l) => ({ ...l, [key]: U(l[key]) }));
const mapKeys = (o) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [U(k), v]));
const who = (w) => (w ? { id: U(w.id) || "", username: w.username || "", name: w.name || "" } : null);

const counts = Object.fromEntries(Object.entries(D).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0]));
console.log(`Zaxira: ${backup.createdAt} (${backup.createdBy})`);
console.log(counts);
if (!yes) {
  console.log(`\nKo'chirish uchun oxiriga --yes qo'shing. Maqsad zavod: ${code}${reset ? " (avval tozalanadi)" : ""}`);
  process.exit(0);
}

await migrate();
try {
await tx(async (c) => {
  let f = await one("SELECT * FROM factories WHERE code = $1", [code], c);
  if (!f) f = await one("INSERT INTO factories (code, name) VALUES ($1, $2) RETURNING *", [code, name || code], c);
  const F = f.id;
  const TABLES = ["movements", "inventories", "vehicle_logs", "product_moves", "acct_reports", "month_plans", "orders", "days", "suppliers", "targets", "products", "materials", "counters"];
  if (reset) for (const t of TABLES) await c.query(`DELETE FROM ${t} WHERE factory_id = $1`, [F]);
  else if ((await c.query("SELECT 1 FROM materials WHERE factory_id = $1 LIMIT 1", [F])).rowCount) throw new Error(`«${code}» zavodida ma'lumot bor. Qaytadan yuklash uchun --reset qo'shing`);

  const ins = async (table, obj) => {
    const s = insertSql(table, { factoryId: F, ...obj });
    await c.query(s.text, s.values);
  };
  const base = (x) => ({ id: U(x._id), createdAt: ts(x.createdAt), updatedAt: ts(x.updatedAt || x.createdAt) });

  for (const m of D.materials)
    await ins("materials", {
      ...base(m), name: m.name, unit: m.unit || "шт", group: m.group || "boshqa", price: +m.price || 0, stock: m.stock !== false, electrodeBase: !!m.electrodeBase,
      isElectrode: !!m.isElectrode, code: m.code || "", minQty: +m.minQty || 0, kgPerM: m.kgPerM ?? null, archived: !!m.archived,
      recipe: mapLines(m.recipe, "materialId"), writeoff: mapLines(m.writeoff, "materialId"), sort: m.sort || 0,
    });
  for (const p of D.products)
    await ins("products", {
      ...base(p), code: p.code, name: p.name || "", group: p.group || "Бошқа", norms: mapLines(p.norms, "materialId"),
      calc: { ...(p.calc || {}), items: mapLines(p.calc?.items, "materialId") }, notes: p.notes || [], excelPrice: p.excelPrice ?? null,
      forms: +p.forms || 0, cycleDays: +p.cycleDays || 1, sort: p.sort || 0,
    });
  for (const t of D.targets || [])
    await ins("targets", { ...base(t), kind: t.kind, name: t.name, code: t.code || "", archived: !!t.archived, meterUnit: t.meterUnit || "km", fuelNorm: +t.fuelNorm || 0, serviceEvery: +t.serviceEvery || 0 });
  for (const o of D.orders || [])
    await ins("orders", {
      ...base(o), no: o.no, customer: o.customer, contractNo: String(o.contractNo || "").replace(/^№\s*/, "").slice(0, 60),
      // ko'p mahsulotli buyurtma (items); eski ilovaning birinchi versiyasida bitta mahsulot bo'lgan — bitta qator
      items: (o.items?.length ? o.items : o.lines?.length ? o.lines : [{ productId: o.productId, qty: o.qty, price: o.price }]).map((l) => ({
        productId: U(l.productId), qty: +l.qty || 0, price: +l.price || 0, shippedBefore: +l.shippedBefore || 0,
      })),
      date: o.date || "", deadline: o.deadline || "", status: o.status || "yangi", note: o.note || "",
    });
  for (const d of D.days || [])
    await ins("days", {
      ...base(d), date: d.date, note: d.note || "",
      production: mapLines(d.production, "productId"),
      materials: mapLines(d.materials, "materialId"),
      shipments: (d.shipments || []).map((s) => ({ ...s, productId: U(s.productId), orderId: s.orderId ? U(s.orderId) : null })),
    });
  for (const s of D.suppliers || [])
    await ins("suppliers", { ...base(s), name: s.name, phone: s.phone || "", inn: s.inn || "", contact: s.contact || "", note: s.note || "", archived: !!s.archived });
  for (const i of D.inventories || [])
    await ins("inventories", {
      ...base(i), no: i.no, date: i.date, status: i.status, group: i.group || "", blind: !!i.blind, note: i.note || "",
      lines: mapLines(i.lines, "materialId"), createdBy: who(i.createdBy), approvedBy: i.approvedBy ? { ...who(i.approvedBy), at: i.approvedBy.at } : null,
    });
  for (const m of D.movements || [])
    await ins("movements", {
      ...base(m), type: m.type, date: m.date, materialId: U(m.materialId), qty: m.qty, inputQty: m.inputQty ?? null, inputUnit: m.inputUnit || "", factor: m.factor ?? null,
      price: +m.price || 0, supplier: m.supplier || "", docNumber: m.docNumber || "", departmentId: U(m.departmentId), vehicleId: U(m.vehicleId), person: m.person || "",
      meter: m.meter ?? null, note: m.note || "", reason: m.reason || "", inventoryId: U(m.inventoryId), createdBy: who(m.createdBy),
    });
  for (const p of D.productMoves || [])
    await ins("product_moves", {
      ...base(p), type: p.type === "fix" ? "fix" : "brak", date: p.date, productId: U(p.productId), toProductId: p.type === "fix" ? U(p.toProductId) : null,
      qty: p.qty, reason: p.reason || "boshqa", note: p.note || "", createdBy: who(p.createdBy),
    });
  for (const a of D.acctReports || [])
    await ins("acct_reports", {
      ...base(a), month: a.month, date: a.date || "", rows: (a.rows || []).map((r) => ({ ...r, productId: r.productId ? U(r.productId) : null })),
      otherCosts: +a.otherCosts || 0, director: a.director || "", chief: a.chief || "", accountant: a.accountant || "", updatedBy: who(a.updatedBy),
    });
  for (const m of D.monthPlans || [])
    await ins("month_plans", {
      ...base(m), month: m.month, title: m.title || "", source: m.source || "qolda", fileName: m.fileName || "", note: m.note || "",
      customers: m.customers || [], extraCols: m.extraCols || [], rows: (m.rows || []).map((r) => ({ ...r, productId: r.productId ? U(r.productId) : null })), updatedBy: who(m.updatedBy),
    });
  for (const l of D.vehicleLogs || [])
    await ins("vehicle_logs", { ...base(l), vehicleId: U(l.vehicleId), date: l.date, kind: l.kind || "tamir", cost: +l.cost || 0, meter: l.meter ?? null, note: l.note || "", createdBy: who(l.createdBy) });

  const s = (D.settings || []).find((x) => x.key === "main") || D.settings?.[0];
  if (s) {
    const opening = { date: s.opening?.date || "", materials: mapKeys(s.opening?.materials), products: mapKeys(s.opening?.products) };
    await c.query(
      `INSERT INTO settings (factory_id, electrode_pct, company, signers, opening, calc_template, cost_schemes, plan) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (factory_id) DO UPDATE SET electrode_pct = EXCLUDED.electrode_pct, company = EXCLUDED.company, signers = EXCLUDED.signers, opening = EXCLUDED.opening,
         calc_template = EXCLUDED.calc_template, cost_schemes = EXCLUDED.cost_schemes, plan = EXCLUDED.plan, updated_at = now()`,
      [F, s.electrodePct ?? 1.5, s.company || "", JSON.stringify(s.signers || []), JSON.stringify(opening), s.calcTemplate ? JSON.stringify({ ...s.calcTemplate, items: [] }) : null,
        s.costSchemes ? JSON.stringify(s.costSchemes) : null, JSON.stringify(s.plan || { concretePerDay: 0, workDays: [1, 2, 3, 4, 5, 6], holidays: [] })]
    );
  }
  console.log(`✓ «${f.name}» (${code}) zavodiga ko'chirildi`);
});
} catch (err) {
  console.log(`✗ ${err.message}\nBazaga hech narsa yozilmadi.`);
  await getPool().end();
  process.exit(1);
}
if ((D.users || []).length) console.log(`Eslatma: ${D.users.length} ta foydalanuvchi ko'chirilmadi — «Boshqaruv»da qaytadan qo'shing: ${D.users.map((u) => `${u.username} (${u.role})`).join(", ")}`);
await getPool().end();
