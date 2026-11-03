// Zaxira nusxadan tiklash («Boshqaruv → Zaxira nusxa» bergan zavod-backup-….json).
//
//   npm run restore -- zavod-backup-2026-10-01-18-30.json          — nima tiklanishini ko'rsatadi
//   npm run restore -- zavod-backup-2026-10-01-18-30.json --yes    — tiklaydi
//
// Zaxira qaysi zavod(lar)niki bo'lsa, faqat o'sha zavod(lar)ning ma'lumoti almashtiriladi.
// Tiklashdan oldin joriy holat zavod-avto-zaxira-….json fayliga saqlanadi. Hammasi bitta tranzaksiyada:
// xato chiqsa, bazaga tegilmaydi. Foydalanuvchilar va parollar o'zgarmaydi.
import fs from "node:fs";
import { migrate, getPool, tx } from "../src/db.js";
import { BACKUP_TABLES } from "../src/app.js";

const args = process.argv.slice(2);
const file = args.find((a) => a.endsWith(".json"));
const yes = args.includes("--yes");
if (!file) {
  console.log("Foydalanish: npm run restore -- <zavod-backup-….json> [--yes]");
  process.exit(1);
}
const backup = JSON.parse(fs.readFileSync(file, "utf8"));
if (backup.app !== "zavodlar" || backup.format !== 2 || !backup.data) {
  console.log(backup.app === "pto" ? "Bu eski ilova (MongoDB) zaxirasi — uning uchun: npm run import-mongo" : "Bu fayl zaxira nusxa emas");
  process.exit(1);
}
const D = backup.data;
const HR_TABLES = ['hr_employees', 'hr_rates', 'hr_months', 'hr_payments', 'hr_events'];
const NEW_HR_TABLES=['hr_records','hr_leave_allowances'];
const hasNewHr=NEW_HR_TABLES.some(t=>Object.hasOwn(D,t));
if(hasNewHr&&NEW_HR_TABLES.some(t=>!Array.isArray(D[t])))throw new Error('Kadrlar boshqaruvi zaxirasi to‘liq emas');
const hasHr = HR_TABLES.some(t => Object.hasOwn(D, t));
if (hasHr && HR_TABLES.some(t => !Array.isArray(D[t]))) throw new Error('Kadrlar zaxirasi to‘liq emas');
const fids = (D.factories || []).map((f) => f.id);
console.log(`Zaxira: ${backup.createdAt} (${backup.createdBy}), zavodlar: ${(D.factories || []).map((f) => f.name).join(", ")}`);
console.log(backup.counts);
if (!yes) {
  console.log("\nTiklash uchun oxiriga --yes qo'shing. Shu zavodlarning hozirgi ma'lumoti zaxiradagisi bilan almashtiriladi.");
  process.exit(0);
}

await migrate();
const pool = getPool();
// 1) joriy holatni saqlab qo'yamiz
const now = await tx(async (c) => {
  await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
  const data = {};
  for (const t of BACKUP_TABLES) {
    const col = t === "factories" ? "id" : "factory_id";
    data[t] = (await c.query(`SELECT * FROM ${t} WHERE ${col} = ANY($1::uuid[])`, [fids])).rows;
  }
  return data;
});
const autoName = `zavod-avto-zaxira-${new Date(Date.now() + 5 * 36e5).toISOString().slice(0, 16).replace(/[T:]/g, "-")}.json`;
fs.writeFileSync(autoName, JSON.stringify({ app: "zavodlar", format: 2, db: "postgres", createdAt: new Date().toISOString(), createdBy: "restore", data: now }));
console.log(`Joriy holat saqlandi: ${autoName}`);

// 2) almashtirish (bog'lanishlar tartibida: avval bolalar o'chiriladi, keyin ota-onalar qo'shiladi)
const ORDER = ["factories", "settings", "materials", "products", "targets", "orders", "days", "inventories", "movements", "suppliers", "product_moves", "vehicle_logs", "acct_reports", "month_plans", "counters"];
// Older backups have no personnel data: preserve existing personnel tables.
if(hasNewHr&&!hasHr)throw new Error('Kadrlar zaxirasi to‘liq emas');
if (hasHr) ORDER.push(...HR_TABLES,...NEW_HR_TABLES);
const JSONB = new Set(["lines", "items", "rows", "customers", "extra_cols", "signers", "opening", "calc_template", "cost_schemes", "plan", "recipe", "writeoff", "norms", "calc", "notes", "production", "materials", "shipments", "created_by", "approved_by", "updated_by"]);
for (const key of ['work_days','holidays','attendance','adjustments','snapshot','closed_by','voided_by','actor','detail','profile','decided_by']) JSONB.add(key);
try {
  await tx(async (c) => {
    for (const t of [...ORDER].reverse()) {
      if (t === "factories") continue; // zavod qatorlari yangilanadi (foydalanuvchilar ularga bog'langan)
      await c.query(`DELETE FROM ${t} WHERE factory_id = ANY($1::uuid[])`, [fids]);
    }
    for (const t of ORDER) {
      for (const src of D[t] || []) {
        let row = src;
        // eski zaxiralar: buyurtmada bitta mahsulot (product_id, qty, price) yoki «lines» ustuni → items
        if (t === "orders" && !row.items) {
          const { product_id, qty, price, lines, ...rest } = row;
          const list = Array.isArray(lines) && lines.length ? lines : product_id ? [{ productId: product_id, qty: +qty || 0, price: +price || 0 }] : [];
          row = { ...rest, items: list.map((l) => ({ shippedBefore: 0, ...l })) };
        }
        const cols = Object.keys(row);
        const vals = cols.map((k) => (JSONB.has(k) && row[k] !== null && !(t === 'hr_employees' && k === 'notes') ? JSON.stringify(row[k]) : row[k]));
        const upsert = t === "factories" ? ` ON CONFLICT (id) DO UPDATE SET ${cols.filter((k) => k !== "id").map((k) => `${k} = EXCLUDED.${k}`).join(", ")}` : "";
        await c.query(`INSERT INTO ${t} (${cols.join(", ")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")})${upsert}`, vals);
      }
    }
  });
  console.log("✓ Tiklandi");
} catch (err) {
  console.log(`✗ Tiklanmadi, bazaga tegilmadi: ${err.message}`);
  process.exitCode = 1;
}
await pool.end();
