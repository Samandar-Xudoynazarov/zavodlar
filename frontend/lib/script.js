/**
 * O'zbek alifbolari: lotin ↔ kirill o'girish va alifbodan qat'i nazar qidirish.
 *
 *  toCyr("Yo'l")        → "Йўл"
 *  toLat("Цех бошлиғи") → "Sex boshlig'i"
 *  searchKey("Ахмедов") === searchKey("Axmedov") === searchKey("Ahmedov")
 *  matches("Цех", "sex") → true
 */

const APOS = /[ʻʼ‘’`´']/g;
const isUpper = (ch) => ch !== ch.toLowerCase();
const withCase = (src, out) => (src.length > 1 && src === src.toUpperCase() ? out.toUpperCase() : isUpper(src[0]) ? out[0].toUpperCase() + out.slice(1) : out);

/* ================= lotin → kirill ================= */

const L_VOWELS = "aeiouAEIOU";
const PAIRS = [
  ["o'", "ў"], ["g'", "ғ"], ["sh", "ш"], ["ch", "ч"],
  ["yo", "ё"], ["yu", "ю"], ["ya", "я"], ["ye", "е"],
];
const SINGLE = {
  a: "а", b: "б", d: "д", e: "е", f: "ф", g: "г", h: "ҳ", i: "и", j: "ж", k: "к", l: "л", m: "м", n: "н", o: "о", p: "п",
  q: "қ", r: "р", s: "с", t: "т", u: "у", v: "в", x: "х", y: "й", z: "з", c: "ц", w: "в",
};
// o'girilmaydigan so'zlar (brend, qisqartma)
const KEEP = /^(Excel|PDF|Telegram|iPhone|iPad|Android|Safari|Chrome|Edge|ID|IP|PWA|APK|JSON|CSV|XLSX|DOCX|A4|M\d+|B\d+)$/;

// ruschadan kirgan so'zlar: «ts» + unli → «ц» (kalkulyatsiya, retsept, koeffitsiyent)
const LOAN = [[/ts(?=[aeiouy])/g, "ц"], [/Ts(?=[aeiouy])/g, "Ц"], [/TS(?=[AEIOUY])/g, "Ц"]];

// o'zakdagi istisnolar: [lotin o'zak, kirill o'zak]. Uzunroq o'zak oldin turishi shart emas — eng uzuni tanlanadi.
const STEMS = [
  ["kalkulyatsi", "калькуляци"], ["koeffitsiyent", "коэффициент"], ["sentyabr", "сентябрь"], ["oktyabr", "октябрь"],
  ["noyabr", "ноябрь"], ["dekabr", "декабрь"], ["yanvar", "январь"], ["fevral", "февраль"], ["aprel", "апрель"], ["iyun", "июнь"], ["iyul", "июль"],
  ["elektr", "электр"], ["tonna", "тонна"], ["film", "фильм"], ["relef", "рельеф"],
  // «s» → «ц» bo'ladigan so'zlar
  ["sex", "цех"], ["sement", "цемент"], ["sirk", "цирк"], ["silindr", "цилиндр"], ["sikl", "цикл"], ["sink", "цинк"], ["sisterna", "цистерна"],
  ["konsert", "концерт"], ["konsepsi", "концепци"], ["litsenzi", "лицензи"], ["sitata", "цитата"],
  ["stansi", "станци"], ["distansi", "дистанци"], ["instansi", "инстанци"], ["konferensi", "конференци"], ["tendensi", "тенденци"], ["kompetensi", "компетенци"],
  ["rayon", "район"], ["kombayn", "комбайн"], ["dizayn", "дизайн"], ["ob'yekt", "объект"], ["obyekt", "объект"], ["sub'yekt", "субъект"], ["subyekt", "субъект"],
];
// -ksiya → -кция (aksiya, konstruksiya, funksiya, produksiya, inspeksiya, reaksiya, kolleksiya)
const KSIYA = [[/ks(?=iya)/g, "кц"], [/Ks(?=iya)/g, "Кц"], [/KS(?=IYA)/g, "КЦ"]];

function findStem(low) {
  let best = null;
  for (const s of STEMS) {
    if (!low.startsWith(s[0])) continue;
    if (!best || s[0].length > best[0].length) best = s;
  }
  return best;
}

function cyrWord(w) {
  if (!w) return w;
  if (KEEP.test(w) || /^[A-Z0-9-]{2,}$/.test(w)) return w; // qisqartmalar (PTO, QQS, INN) lotinda qoladi
  const low = w.toLowerCase();
  const stem = findStem(low);
  if (stem) {
    const head = withCase(w.slice(0, stem[0].length), stem[1]);
    return head + (w.length > stem[0].length ? cyrTail(w.slice(stem[0].length)) : "");
  }
  return cyrTail(w, true);
}

function cyrTail(w, atStart = false) {
  for (const [re, to] of LOAN) w = w.replace(re, to);
  for (const [re, to] of KSIYA) w = w.replace(re, to);
  let out = "";
  for (let i = 0; i < w.length; ) {
    const two = w.slice(i, i + 2);
    const lowTwo = two.toLowerCase();
    // «yo'» → «йў» (Yo'l → Йўл), «yo» emas
    if (lowTwo === "yo" && w[i + 2] === "'") {
      out += w[i] === "Y" ? "Й" : "й";
      i += 1;
      continue;
    }
    const pair = PAIRS.find(([l]) => l === lowTwo);
    if (pair) {
      let c = pair[1];
      if (isUpper(w[i])) c = c.toUpperCase();
      out += c;
      i += 2;
      continue;
    }
    const ch = w[i];
    if (ch === "'") {
      out += "ъ";
      i++;
      continue;
    }
    const lc = ch.toLowerCase();
    let c = SINGLE[lc];
    if (c === undefined) {
      out += ch;
      i++;
      continue;
    }
    // so'z boshida va unlidan keyin «e» → «э»
    if (lc === "e" && ((atStart && i === 0) || L_VOWELS.includes(w[i - 1] || ""))) c = "э";
    out += ch === lc ? c : c.toUpperCase();
    i++;
  }
  return out;
}

const CODE = /^(?:[A-Z]+\d[\w-]*|\d+[A-Z]+)$/;

/** Lotincha o'zbek matnini kirillga o'giradi. {o'rinbosar} va kirillcha qismlarga tegmaydi. */
export function toCyr(text) {
  return String(text ?? "")
    .replace(APOS, "'")
    .split(/(\{[^}]*\})/)
    // mahsulot kodlari (B25, M200, P1-A, 2A, PL7d-3) o'zgarmaydi
    .flatMap((part) => (part.startsWith("{") ? [part] : part.split(/(\b[A-Z]+\d[\w-]*|\b\d+[A-Z]+\b)/)))
    .map((part) => (part.startsWith("{") || CODE.test(part) ? part : part.replace(/[A-Za-z']+/g, (w) => (/^'+$/.test(w) ? w : cyrWord(w)))))
    .join("");
}

/* ================= kirill → lotin ================= */

const C_VOWELS = "аеёиоуўэюяыАЕЁИОУЎЭЮЯЫ";
const CYR = {
  а: "a", б: "b", в: "v", г: "g", д: "d", ё: "yo", ж: "j", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
  п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "x", ч: "ch", ш: "sh", щ: "sh", ъ: "'", ь: "", ы: "i", э: "e",
  ю: "yu", я: "ya", ў: "o'", қ: "q", ғ: "g'", ҳ: "h",
};

/** Kirillcha (o'zbek yoki rus) matnni o'zbek lotin alifbosiga o'giradi. Lotincha qismlarga tegmaydi. */
export function toLat(text) {
  return String(text ?? "").replace(/[Ѐ-ӿ]+/g, (w) => {
    let out = "";
    for (let i = 0; i < w.length; i++) {
      const ch = w[i];
      const lc = ch.toLowerCase();
      const prev = w[i - 1] || "";
      let l;
      if (lc === "е") l = i === 0 || C_VOWELS.includes(prev) || "ъьЪЬ".includes(prev) ? "ye" : "e";
      else if (lc === "ц") l = i > 0 && C_VOWELS.includes(prev) ? "ts" : "s";
      else l = CYR[lc] ?? ch;
      if (!l) continue;
      if (ch !== lc) {
        // katta harf: butun so'z katta bo'lsa — hammasi katta, aks holda faqat birinchi harf
        const allUp = w.length > 1 && w === w.toUpperCase();
        l = allUp ? l.toUpperCase() : l[0].toUpperCase() + l.slice(1);
      }
      out += l;
    }
    return out;
  });
}

/* ================= qidiruv ================= */

/**
 * Qidiruv kaliti: kichik harf, lotin alifbosi, apostroflarsiz, x/h va ye/e farqisiz.
 * «Ахмедов», «Axmedov», «Ahmedov», «AXMEDOV» — hammasi bitta kalit beradi.
 */
export function searchKey(text) {
  return toLat(String(text ?? "").replace(APOS, "'"))
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/kh/g, "x")
    .replace(/h/g, "x")
    .replace(/ts/g, "s")
    .replace(/(^|[^a-z])ye/g, "$1e")
    .replace(/([aeiou])ye/g, "$1e")
    .replace(/\s+/g, " ")
    .trim();
}

/** `hay` ichida `query` bormi — lotin/kirill/katta-kichik harf va apostrof farqisiz. Bo'sh so'rov → true. */
export function matches(hay, query) {
  const q = searchKey(query);
  if (!q) return true;
  const values = Array.isArray(hay) ? hay : [hay];
  return searchKey(values.filter((v) => v !== null && v !== undefined).join(" ")).includes(q);
}

/** Lug'at kaliti uchun: apostrof turlarini bitta «'» ga keltiradi. */
export const normApos = (s) => String(s).replace(APOS, "'");

/* ================= ko'rsatish ================= */

// Faqat o'zbek kirilliga xos harflar: shular bo'lsa matn o'zbekcha, bo'lmasa ruscha bo'lishi mumkin
const UZ_CYR = /[ЎўҚқҒғҲҳ]/;

/**
 * Foydalanuvchi kiritgan matnni tanlangan alifboda ko'rsatish uchun (bazadagi qiymat o'zgarmaydi):
 *  kr — lotincha o'zbek matn → kirill
 *  uz — o'zbekcha kirill matn (ў, қ, ғ, ҳ bor) → lotin; ruscha matn o'zgarmaydi
 *  ru — o'zgarmaydi
 */
export function showText(lang, text) {
  if (text === null || text === undefined || text === "") return text;
  const s = String(text);
  if (lang === "kr") return /[A-Za-z]/.test(s) && !/^(https?:|www\.)|@/.test(s) ? toCyr(s) : s;
  if (lang === "uz") return UZ_CYR.test(s) ? toLat(s) : s;
  return s;
}
