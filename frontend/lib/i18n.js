"use client";
/**
 * Uch til: o'zbekcha (lotin) — asosiy, o'zbekcha (kirill), ruscha.
 *
 * Kalit — o'zbekcha lotin matn:  t("Saqlash"), t("{n} ta material", { n: 5 })
 *  - kirill: lug'atdagi (DICT.kr) tarjima, bo'lmasa lotindan avtomatik o'giriladi
 *  - rus:    lug'atdagi (DICT.ru) tarjima, bo'lmasa lotincha qoladi
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DICT } from "./dict";
import { normApos, searchKey, showText, toCyr, toLat } from "./script";

// lotin ↔ kirill o'girish va alifbodan qat'i nazar qidirish — lib/script.js
export { toCyr, toLat, searchKey, matches, showText } from "./script";

export const LANGS = [
  { code: "uz", label: "O'zbekcha", short: "UZ" },
  { code: "kr", label: "Ўзбекча", short: "ЎЗ" },
  { code: "ru", label: "Русский", short: "RU" },
];
const KEY = "pto.lang";

/* ---------- lug'at: apostrof turlari («'», «‘», «ʻ», «’») farq qilmasin ---------- */
const normDict = (obj) => {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    out[k] = v;
    const n = normApos(k);
    if (!(n in out)) out[n] = v;
  }
  return out;
};
const RU = normDict(DICT.ru);
const KR = normDict(DICT.kr);
const lookup = (map, s) => (map[s] !== undefined ? map[s] : map[normApos(s)]);

/* ---------- tarjima ---------- */
function toRu(s) {
  const hit = lookup(RU, s);
  if (hit !== undefined) return hit;
  const n = normApos(s);
  for (const [re, to] of DICT.ruPatterns) {
    if (re.test(s)) return s.replace(re, to);
    if (n !== s && re.test(n)) return n.replace(re, to);
  }
  if (s.includes("; ")) return s.split("; ").map(toRu).join("; "); // bir nechta xato birga
  return s;
}

export function translate(lang, key, vars) {
  if (key === undefined || key === null) return "";
  let out = String(key);
  if (lang === "ru") out = toRu(out);
  else if (lang === "kr") out = lookup(KR, out) ?? toCyr(out);
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
  return out;
}

let current = "uz";
/** React tashqarisida (masalan, api.js, excel.js) ishlatish uchun */
export const tr = (key, vars) => translate(current, key, vars);
export const currentLang = () => current;

/* ---------- zavodning o'z lug'ati (Lug'at sahifasi): nomlar va tayyor iboralar, uz ↔ ru ---------- */
let GLOSS = new Map(); // searchKey(matn) -> { uz, ru, kind }
let GLOSS_ITEMS = [];
const glossSubs = new Set();
export function setGlossary(items) {
  const map = new Map();
  for (const e of items || []) {
    for (const s of [e.uz, e.ru]) {
      const k = searchKey(s);
      if (k && !map.has(k)) map.set(k, e);
    }
  }
  GLOSS = map;
  GLOSS_ITEMS = items || [];
  glossSubs.forEach((f) => f());
}
export const glossaryItems = () => GLOSS_ITEMS;
const CYR = /[\u0400-\u04FF]/;
/** Lug'at yozuvini tanlangan tilda: ru — ruschasi, uz — lotin, kr — kirill */
export function glossText(lang, e) {
  if (lang === "ru") return e.ru;
  const uz = String(e.uz);
  if (lang === "kr") return CYR.test(uz) ? uz : toCyr(uz);
  return CYR.test(uz) ? toLat(uz) : uz;
}
const SEP = /([,;.!?:\n()]+\s*|\s+[-–—]\s+)/;
function glossShow(lang, text) {
  if (!GLOSS.size) return null;
  const whole = GLOSS.get(searchKey(text));
  if (whole) return glossText(lang, whole);
  // izoh: bo'laklarga ajratib, lug'atda bori tarjima qilinadi
  const parts = text.split(SEP);
  if (parts.length < 2) return null;
  let hit = false;
  const out = parts.map((p, i) => {
    if (i % 2) return p;
    const lead = p.match(/^\s*/)[0], trail = p.match(/\s*$/)[0], core = p.trim();
    const e = core && GLOSS.get(searchKey(core));
    if (!e) return showText(lang, p);
    hit = true;
    let g = glossText(lang, e);
    if (core[0] !== core[0].toUpperCase()) g = g.charAt(0).toLowerCase() + g.slice(1); // gap o'rtasida — kichik harf
    return lead + g + trail;
  });
  return hit ? out.join("") : null;
}

/** Foydalanuvchi kiritgan matnni (ism, nom, izoh) tanlangan tilda ko'rsatish: show(o.customer).
 *  Avval lug'at (uz ↔ ru), bo'lmasa — faqat alifbo (lotin ↔ kirill). */
export const show = (text) => {
  if (text === null || text === undefined || text === "") return text;
  const s = String(text);
  return glossShow(current, s) ?? showText(current, s);
};

const Ctx = createContext({ lang: "uz", setLang: () => {}, t: (k, v) => translate("uz", k, v) });

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState("uz");
  const [glossVer, setGlossVer] = useState(0); // lug'at yuklanganda ekran yangilanadi
  useEffect(() => {
    const f = () => setGlossVer((v) => v + 1);
    glossSubs.add(f);
    return () => glossSubs.delete(f);
  }, []);
  useEffect(() => {
    let saved = null;
    try {
      saved = localStorage.getItem(KEY);
    } catch {}
    if (!LANGS.some((l) => l.code === saved)) saved = (navigator.language || "").toLowerCase().startsWith("ru") ? "ru" : "uz";
    current = saved;
    setLangState(saved);
  }, []);
  useEffect(() => {
    current = lang;
    document.documentElement.lang = lang === "ru" ? "ru" : lang === "kr" ? "uz-Cyrl" : "uz";
  }, [lang]);
  const setLang = useCallback((l) => {
    current = l;
    setLangState(l);
    try {
      localStorage.setItem(KEY, l);
    } catch {}
  }, []);
  const value = useMemo(() => ({ lang, setLang, glossVer, t: (k, v) => translate(lang, k, v) }), [lang, setLang, glossVer]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
export const useT = () => useContext(Ctx).t;
