// Tarjima va alifbo tekshiruvi:  node scripts/i18n-check.mjs
//  1) lotin ↔ kirill o'girish va qidiruv to'g'ri ishlashini tekshiradi
//  2) t("...") / tt("...") / tr("...") bilan ishlatilgan har bir matnning ruschasi borligini tekshiradi
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { toCyr, toLat, matches } = await import(pathToFileURL(join(root, "lib/script.js")).href);

let failed = 0;
const eq = (label, got, want) => {
  if (got !== want) {
    failed++;
    console.log(`✗ ${label}: «${got}», kutilgan «${want}»`);
  }
};

// 1) o'girish
for (const [lat, cyr] of [
  ["Yo'l", "Йўл"], ["Yo‘q", "Йўқ"], ["yoki", "ёки"], ["Sex", "Цех"], ["Aksiya", "Акция"], ["Stansiya", "Станция"],
  ["Konsert", "Концерт"], ["Rayon", "Район"], ["Metall konstruksiya", "Металл конструкция"], ["O‘zbekiston", "Ўзбекистон"],
  ["Sentyabr", "Сентябрь"], ["Ma'lumot", "Маълумот"], ["Yevro", "Евро"], ["Kalkulyatsiya", "Калькуляция"], ["Pensiya", "Пенсия"],
  ["PTO hisoboti", "PTO ҳисоботи"], ["Shartnoma №{n}", "Шартнома №{n}"],
]) eq(`toCyr(${lat})`, toCyr(lat), cyr);

for (const [cyr, lat] of [
  ["Цех бошлиғи", "Sex boshlig'i"], ["Ахмедов Ўткир", "Axmedov O'tkir"], ["Ёқилғи", "Yoqilg'i"], ["Евро", "Yevro"],
  ["Акция", "Aksiya"], ["Маълумот", "Ma'lumot"], ["Иванов Сергей", "Ivanov Sergey"],
]) eq(`toLat(${cyr})`, toLat(cyr), lat);

for (const [hay, q] of [
  ["Ахмедов", "Axmedov"], ["Ахмедов", "ahmedov"], ["G'ulomov", "Гуломов"], ["Ғуломов", "gulomov"], ["Цех №2", "sex"],
  ["Konsert zali", "концерт"], ["Евро", "evro"], ["ООО «Бетон Сервис»", "beton"], ["Ф5", "f5"],
]) eq(`matches(${hay}, ${q})`, matches(hay, q), true);
eq("matches(Beton, Metall)", matches("Beton", "Metall"), false);

// 2) ruscha tarjima qamrovi
const norm = (s) => s.replace(/[ʻʼ‘’`´]/g, "'");
const read = (p) => readFileSync(join(root, p), "utf8");
const dictText = read("lib/dict.js");
const ruText = dictText.slice(dictText.indexOf("  ru: {"), dictText.indexOf("  ruPatterns:")) + read("lib/hr-dict.js") + read("lib/dict-ru-extra.js");
const ruKeys = new Set();
for (const m of ruText.matchAll(/"((?:[^"\\]|\\.)*)"\s*:/g)) ruKeys.add(norm(JSON.parse(`"${m[1]}"`)));
for (const m of ruText.matchAll(/^\s*([A-Za-z]\w*)\s*:/gm)) ruKeys.add(m[1]);
const patterns = [...dictText.slice(dictText.indexOf("  ruPatterns:")).matchAll(/\[\/(.+?)\/,\s*"/g)].map((m) => new RegExp(m[1]));

const missing = new Map();
for (const dir of ["components", "lib", "app"]) {
  for (const f of readdirSync(join(root, dir)).filter((f) => f.endsWith(".js"))) {
    for (const m of read(`${dir}/${f}`).matchAll(/\b(?:t|tt|tr)\(\s*(["'])((?:(?!\1)[^\\]|\\.)*)\1/g)) {
      const key = m[2].replace(/\\'/g, "'").replace(/\\"/g, '"');
      if (!/[A-Za-z]{2}/.test(key) || /^[^a-z]*[А-Яа-яЁё]/.test(key)) continue; // ruscha / kodli satrlar
      if (ruKeys.has(norm(key)) || patterns.some((p) => p.test(key) || p.test(norm(key)))) continue;
      if (!missing.has(key)) missing.set(key, `${dir}/${f}`);
    }
  }
}
for (const [k, f] of missing) console.log(`! ruschasi yo'q (${f}): ${k}`);

if (failed) {
  console.log(`\n${failed} ta o'girish/qidiruv xatosi`);
  process.exit(1);
}
console.log(`\nO'girish va qidiruv: OK. Ruschasi yo'q matnlar: ${missing.size} ta${missing.size ? " (lib/dict-ru-extra.js ga qo'shing)" : ""}.`);
