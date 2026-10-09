// Mahsulotlar ro'yxatini (JSON) zavod katalogiga qo'shadi. Masalan, metall zavodi mahsulotlari:
//
//   npm run import-products -- scripts/data/metall-mahsulotlar.json samarqand-metall                 — nima qo'shilishini ko'rsatadi
//   npm run import-products -- scripts/data/metall-mahsulotlar.json samarqand-metall --yes           — qo'shadi
//   ... --name="Самарканд ПУ (metall)"   — zavod hali yo'q bo'lsa, shu nom bilan yaratiladi (turi fayldagi «kind», odatda metall)
//
// Katalogda shu markali (katta-kichik harf, lotin/kirill o'xshash harflar farqisiz) mahsulot bo'lsa, u qayta qo'shilmaydi.
// Fayl: { kind, source, products: [{ code, name, group, unit, kgPerUnit, priceNoVat, priceMonth }] }
//   kgPerUnit  → kalkulyatsiyadagi «metall, kg»
//   priceNoVat → solishtirish uchun Excel narxi (QQS bilan saqlanadi — «Kalkulyatsiya» bo'limida farqi ko'rsatiladi)
// Sarf normalari va xarajatlar keyin «Katalog»da to'ldiriladi.
import fs from "node:fs";
import { migrate, getPool, tx, one } from "../src/db.js";
import { insertSql, calc as cleanCalc } from "../src/valid.js";

const args = process.argv.slice(2);
const file = args.find((a) => a.endsWith(".json"));
const code = args.find((a) => !a.startsWith("--") && !a.endsWith(".json"));
const yes = args.includes("--yes");
const name = args.find((a) => a.startsWith("--name="))?.slice(7);
if (!file || !code) {
  console.log('Foydalanish: npm run import-products -- <mahsulotlar.json> <zavod-kodi> [--yes] [--name="Zavod nomi"]');
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync(file, "utf8"));
const list = Array.isArray(data.products) ? data.products : [];
if (!list.length) {
  console.log("Faylda mahsulot yo'q");
  process.exit(1);
}

const LAT = { A: "А", B: "В", C: "С", E: "Е", H: "Н", K: "К", M: "М", O: "О", P: "Р", T: "Т", X: "Х", a: "а", c: "с", e: "е", o: "о", p: "р", x: "х", y: "у" };
const key = (s) => String(s || "").replace(/[ABCEHKMOPTXaceopxy]/g, (ch) => LAT[ch]).toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
const fmt = (n) => Math.round(n).toLocaleString("ru-RU").replace(/,/g, " ");

await migrate();
const pool = getPool();
const f0 = await one("SELECT * FROM factories WHERE code = $1", [code]);
const existing = f0 ? new Set((await pool.query("SELECT code FROM products WHERE factory_id = $1", [f0.id])).rows.map((r) => key(r.code))) : new Set();
const fresh = [];
const seen = new Set();
for (const p of list) {
  const k = key(p.code);
  if (!k || existing.has(k) || seen.has(k)) continue;
  seen.add(k);
  fresh.push(p);
}
const groups = {};
for (const p of fresh) groups[p.group || "Бошқа"] = (groups[p.group || "Бошқа"] || 0) + 1;

console.log(data.source ? `Manba: ${data.source}` : "");
console.log(`Zavod: ${f0 ? `${f0.name} (${f0.code}, ${f0.kind})` : `«${code}» — yo'q, yaratiladi: ${name || code}, turi ${data.kind === "metall" ? "metall" : "beton"}`}`);
console.log(`Faylda: ${list.length} ta · katalogda allaqachon bor: ${list.length - fresh.length} ta · qo'shiladi: ${fresh.length} ta`);
for (const [g, n] of Object.entries(groups)) console.log(`  ${g}: ${n}`);
if (!yes) {
  console.log("\nQo'shish uchun oxiriga --yes qo'shing.");
  await pool.end();
  process.exit(0);
}

try {
  await tx(async (c) => {
    let f = await one("SELECT * FROM factories WHERE code = $1", [code], c);
    if (!f) f = await one("INSERT INTO factories (code, name, kind) VALUES ($1, $2, $3) RETURNING *", [code, name || code, data.kind === "metall" ? "metall" : "beton"], c);
    // yangi zavodda beton zavodining xarajat andozalari avtomatik yaratilmasin: bo'sh ro'yxat — «andozalar sozlangan, hali yo'q»
    await c.query("INSERT INTO settings (factory_id, cost_schemes) VALUES ($1, '[]') ON CONFLICT (factory_id) DO UPDATE SET cost_schemes = COALESCE(settings.cost_schemes, '[]')", [f.id]);
    let sort = (await c.query("SELECT COALESCE(max(sort), 0) AS n FROM products WHERE factory_id = $1", [f.id])).rows[0].n;
    for (const p of fresh) {
      const notes = [];
      if (p.unit && !/^шт/i.test(p.unit)) notes.push(`Ед. изм.: ${p.unit}`);
      if (p.priceNoVat) notes.push(`Hisobotdagi narx${p.priceMonth ? ` (${p.priceMonth})` : ""}: ${fmt(p.priceNoVat)} so'm QQSsiz, ${p.kgPerUnit || 0} kg`);
      const s = insertSql("products", {
        factoryId: f.id,
        code: String(p.code).trim().slice(0, 60),
        name: String(p.name || "").trim().slice(0, 160),
        group: String(p.group || "Бошқа").trim().slice(0, 60),
        norms: [],
        calc: cleanCalc({ metalKg: +p.kgPerUnit || 0, margin: 10, vat: 12, scheme: "" }),
        notes,
        excelPrice: p.priceNoVat ? Math.round(p.priceNoVat * 1.12) : null,
        sort: ++sort,
      });
      await c.query(s.text, s.values);
    }
    console.log(`✓ «${f.name}» zavodiga ${fresh.length} ta mahsulot qo'shildi`);
  });
} catch (err) {
  console.log(`✗ ${err.message}\nBazaga hech narsa yozilmadi.`);
  process.exitCode = 1;
}
await pool.end();
