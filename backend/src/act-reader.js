// Akt sverka (solishtirma dalolatnoma) PDF faylini o'qish va dasturdagi hisob bilan solishtirish.
// Didox / 1C / Soliq.uz kabi tizimlardan chiqqan akt sverkalar: ruscha yoki o'zbekcha matn.
// Matnli PDF to'g'ridan-to'g'ri o'qiladi, skanlangan sahifalar OCR (tesseract) bilan o'qiladi.
//
// Belgilar: barcha qoldiqlar «kontragent bizga qarz» tomonidan: + = kontragent bizga qarz, − = biz unga qarz (avans).
// party='customer' (mijoz, biz sotuvchi): tovar/faktura (+), to'lov (−).
// party='supplier' (ta'minotchi, biz xaridor): tovar/faktura (−), biz to'lagan to'lov (+).
// parseAct va compareAct sof funksiyalar — bazaga bog'liq emas, testda to'g'ridan-to'g'ri chaqiriladi.
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const r2 = (x) => Math.round((+x || 0) * 100) / 100;
const DATE = /(?<!\d)(\d{1,2})[./](\d{1,2})[./](\d{4}|\d{2})(?![\d])/gu;
// Summa: «12 500 000,00», «12500000.00», «12,500,000.00». Tiyin (2 xona) majburiy — hujjat raqamlari bilan aralashmasin.
const AMOUNT = /(?<![\d.,])-?(?:\d{1,3}(?:,\d{3})+\.\d{2}|\d{1,3}(?:[   ]\d{3})+[.,]\d{2}|\d+[.,]\d{2})(?![\d]|[.,]\d)/gu;

const KEY = {
  opening: /(?:сальдо|салдо|saldo|остаток|qoldiq)\s*(?:начальн|на\s+начал|boshlang|boshiga|на\s+\d)|(?:начальн[\p{L}\p{N}_]*|входящ[\p{L}\p{N}_]*)\s+(?:сальдо|остаток)|boshlang.{0,2}ich\s+(?:qoldiq|saldo)|davr\s+boshiga/iu,
  turnover: /оборот[\p{L}\p{N}_]*(?:\s+за\s+период)?|aylanma[\p{L}\p{N}_]*|davr\s+(?:uchun\s+)?aylanma/iu,
  closing: /(?:сальдо|салдо|saldo|остаток|qoldiq)\s*(?:конечн|на\s+конец|исходящ|yakuniy|oxiri)|(?:конечн[\p{L}\p{N}_]*|исходящ[\p{L}\p{N}_]*)\s+(?:сальдо|остаток)|yakuniy\s+(?:qoldiq|saldo)|davr\s+oxiriga/iu,
};
const PAYMENT = /оплат|плат[её]ж|п\/п|пл\.?\s*пор|платежн|поступлени[\p{L}\p{N}_]*\s+(?:на\s+р|денеж|безнал|д\/с|ден)|списани[\p{L}\p{N}_]*\s+(?:с\s+р|денеж|безнал|д\/с)|расчетн[\p{L}\p{N}_]*\s+сч|банк|выписк|касс|возврат\s+денеж|to.?lov|tolov|bank|kassa|pul\s+o.?tkaz|o.?tkazma/iu;
const GOODS = /прода|реализ|отгруз|поставк|накладн|сч[её]т.?фактур|фактур|товар|приход|поступлени|покупк|акт\s+(?:вып|оказ)|услуг|работ|faktura|tovar|sotuv|sotish|yuk\s*xati|kirim|xizmat|ish\s+bajar|возврат\s+товар|qaytar/iu;
const RETURN_GOODS = /возврат\s+(?:товар|от\s+покуп|постав)|tovar[\p{L}\p{N}_]*\s+qaytar|qaytarilgan\s+tovar/iu;

export function toNumber(s) {
  let t = String(s).replace(/[\s  ]/gu, "");
  if (/,\d{3}(?:,|\.\d{2}$)/.test(t) && t.includes(".")) t = t.replace(/,/gu, "");
  else t = t.replace(",", ".");
  return Number(t);
}
const iso = (d, m, y) => {
  const yy = y.length === 2 ? "20" + y : y;
  if (+m < 1 || +m > 12 || +d < 1 || +d > 31) return "";
  return yy + "-" + m.padStart(2, "0") + "-" + d.padStart(2, "0");
};
/** Sanalar, «№...» va qavs ichidagi matn bir xil uzunlikdagi bo'sh joyga almashtiriladi — summa qidirishda xalaqit bermasin */
const mask = (line) =>
  line
    .replace(/\([^)]*\)/gu, (m) => " ".repeat(m.length))
    .replace(DATE, (m) => " ".repeat(m.length))
    .replace(/(?:№|N[°ºo]|#)\s*[\p{L}\p{N}_/\-.]+/gu, (m) => " ".repeat(m.length));
const amountsIn = (line) => [...mask(line).matchAll(AMOUNT)].map((m) => ({ value: Math.abs(toNumber(m[0])), index: m.index, end: m.index + m[0].length }));

const STOP = new Set(["ооо", "оао", "ао", "чп", "ип", "сп", "фх", "xk", "mchj", "masuliyati", "mas", "uliyati", "cheklangan", "jamiyati", "jamiyat", "aj", "xususiy", "korxona", "korxonasi", "llc", "ltd", "ooo", "mj", "qk", "fx", "сум", "so", "m"]);
const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[«»“”"'`‘’ʻʼ]/gu, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w && !STOP.has(w))
    .join(" ");
/** Ikki nom o'xshashligi 0..1 (so'zlar kesishmasi) */
export function nameScore(a, b) {
  const x = new Set(norm(a).split(" ").filter((w) => w.length > 1)),
    y = new Set(norm(b).split(" ").filter((w) => w.length > 1));
  if (!x.size || !y.size) return 0;
  let common = 0;
  for (const w of x) if (y.has(w)) common++;
  return common / Math.min(x.size, y.size);
}

/** Hujjat turi: tovar/faktura yoki pul to'lovi */
export function classify(doc) {
  const s = String(doc || "");
  if (RETURN_GOODS.test(s)) return "return";
  if (PAYMENT.test(s)) return "payment";
  if (GOODS.test(s)) return "goods";
  return "";
}

/**
 * pages: PDF sahifalarining matni. opts: { ours: bizning korxona nomi, counterparty: mijoz/ta'minotchi nomi, party }
 */
export function parseAct(pages, opts = {}) {
  const party = opts.party === "supplier" ? "supplier" : "customer";
  const full = pages.join("\n").replace(/\r/gu, "");
  const flat = full.replace(/\s+/gu, " ");
  const lines = full.split("\n").map((l) => l.replace(/[|│]/gu, " ").replace(/\s+/gu, " ").trim()).filter(Boolean);
  const warnings = [];

  // 1) Davr
  let from = "", to = "";
  const dateRx = "(\\d{1,2}[./]\\d{1,2}[./]\\d{2,4})";
  const periodRx = [
    new RegExp("(?:период\[\p{L}\p{N}_]*|davr\[\p{L}\p{N}_]*|за)\\s*:?\\s*(?:с\\s+)?" + dateRx + "\\s*(?:г\\.?\\s*)?(?:-|–|—|по|до)\\s*" + dateRx, "iu"),
    new RegExp("(?:^|\\s)с\\s+" + dateRx + "\\s*(?:г\\.?\\s*)?(?:по|до)\\s+" + dateRx, "iu"),
    new RegExp(dateRx + "\\s*(?:y\\.?\\s*)?(?:dan|-dan|–|-)\\s*" + dateRx + "\\s*(?:y\\.?\\s*)?(?:gacha|-gacha)", "iu"),
    new RegExp(dateRx + "\\s*(?:-|–|—)\\s*" + dateRx, "iu"),
  ];
  for (const rx of periodRx) {
    const m = flat.match(rx);
    if (!m) continue;
    const a = [...m[1].matchAll(DATE)][0], b = [...m[2].matchAll(DATE)][0];
    if (a && b) {
      from = iso(a[1], a[2], a[3]);
      to = iso(b[1], b[2], b[3]);
      if (from && to && from <= to) break;
      from = to = "";
    }
  }
  const contract = flat.match(/(?:договор[\p{L}\p{N}_]*|shartnoma[\p{L}\p{N}_]*)\s*(?:№|N[°ºo]?|#)\s*([\p{L}\p{N}_/\-.]+)/iu)?.[1] || "";

  // 2) Tomonlar: «По данным X» / «X ma'lumotlariga ko'ra» — chap ustun kimning ma'lumoti
  const leftMatch =
    flat.match(/по\s+данным\s+(.{2,120}?)(?:,|\s+сум|\s+на\s+\d|\s+(?:в|по)\s+|\s+по\s+данным|\s+дата\s|$)/iu) ||
    flat.match(/(.{2,120}?)\s+ma.{0,2}lumot[\p{L}\p{N}_]*\s+(?:bo.{0,2}yicha|ko.{0,2}ra)/iu);
  const left = (leftMatch?.[1] || "").replace(/^.*(?:dalolatnoma[\p{L}\p{N}_]*|davr uchun|o.{0,2}rtasida)\s*/iu, "").trim();
  let leftIsUs = null;
  if (left && (opts.ours || opts.counterparty)) {
    const us = nameScore(left, opts.ours), them = nameScore(left, opts.counterparty);
    if (us !== them && Math.max(us, them) >= 0.5) leftIsUs = us > them;
  }

  // 3) Qatorlar va qoldiqlar (faqat chap ustun — PDFni tuzgan tomon ma'lumoti)
  const rows = [];
  const bal = { opening: null, closing: null, turnover: null };
  let pending = null, collect = null;
  const flush = () => {
    if (pending && pending.amount != null) rows.push(pending);
    pending = null;
  };
  for (const line of lines) {
    const balanceKey = ["opening", "closing", "turnover"].find((k) => KEY[k].test(line));
    if (balanceKey && !/^\s*\d{1,2}[./]\d{1,2}[./]\d{2,4}\s+(?:\D{0,40})?(?:оплат|прода|to.?lov)/iu.test(line)) {
      flush();
      if (bal[balanceKey]) continue;
      // Ikki tomonli jadvalda yorliq qatorda ikki marta uchraydi — chap yarmini olamiz
      const first = line.match(KEY[balanceKey]);
      const rest = line.slice(first.index + first[0].length);
      const second = rest.search(KEY[balanceKey]);
      const half = second >= 0 ? rest.slice(0, second) : rest;
      const nums = amountsIn(half).map((a) => a.value);
      if (balanceKey === "turnover") bal.turnover = nums.slice(0, 2);
      else bal[balanceKey] = nums.length ? nums[0] : 0;
      // OCR ba'zan summalarni keyingi qatorlarga bo'lib yuboradi
      collect = !nums.length && second < 0 ? { key: balanceKey, lines: 0 } : null;
      continue;
    }
    if (collect && !/\p{L}/u.test(mask(line)) && collect.lines < 3) {
      collect.lines++;
      const nums = amountsIn(line).map((a) => a.value);
      if (collect.key === "turnover") bal.turnover = [...bal.turnover, ...nums].slice(0, 2);
      else if (!bal[collect.key] && nums.length) bal[collect.key] = nums[0];
      if (collect.key !== "turnover" || bal.turnover.length >= 2) collect = null;
      continue;
    }
    collect = null;
    if (/foydasiga|в\s+пользу|holatiga|задолженност|qarzdorlik/iu.test(line)) {
      flush();
      continue;
    }
    const start = line.match(/^(?:\d{1,4}[.)]?\s+)?(\d{1,2})[./](\d{1,2})[./](\d{4}|\d{2})(?![\d])/);
    if (start) {
      flush();
      const date = iso(start[1], start[2], start[3]);
      if (!date) continue;
      pending = { date, doc: "", amount: null, raw: line.slice(start[0].length) };
    } else if (pending && pending.amount == null && pending.raw.length < 300) {
      pending.raw += " " + line;
    } else continue;
    const nums = amountsIn(pending.raw);
    if (!nums.length) continue;
    const amt = nums[0];
    pending.doc = pending.raw.slice(0, amt.index).replace(/\s+/gu, " ").replace(/[\s,;:-]+$/, "").trim();
    pending.amount = amt.value;
    delete pending.raw;
    flush();
  }
  flush();
  const parsedRows = rows
    .filter((x) => x.amount > 0)
    .map((x) => {
      const t = classify(x.doc);
      return { date: x.date, doc: x.doc.slice(0, 200), amount: r2(x.amount), kind: t === "return" ? "return" : t };
    });

  // 4) Yo'nalish: «в пользу X» / «X foydasiga» — kim kreditor
  let closingSign = 0;
  const favor = flat.match(/в\s+пользу\s+(.{2,100}?)\s+(?:составляет|сост\.|в\s+сумме|на\s+сумму|\d)/iu) || flat.match(/(.{2,100}?)\s+foydasiga/iu);
  if (favor && (opts.ours || opts.counterparty)) {
    const name = favor[1].replace(/^.*(?:holatiga|holatida|по\s+данным.*?на\s+\S+)\s*/iu, "");
    const us = nameScore(name, opts.ours), them = nameScore(name, opts.counterparty);
    if (us !== them && Math.max(us, them) >= 0.5) closingSign = us > them ? 1 : -1;
  }
  if (/задолженност[\p{L}\p{N}_]*\s+(?:отсутству|нет)|qarzdorlik\s+(?:mavjud\s+emas|yo.?q)|qarz\s+yo.?q/iu.test(flat)) closingSign = 0;

  // 5) Tovar va to'lov aylanmasi (bizning belgilarda)
  const sum = (k) => r2(parsedRows.filter((x) => x.kind === k).reduce((s, x) => s + x.amount, 0));
  let goods = r2(sum("goods") - sum("return")), payments = sum("payment");
  const unknown = parsedRows.filter((x) => !x.kind).length;
  const turnover = bal.turnover || [];
  if (!parsedRows.length && turnover.length === 2) {
    // Qatorlar o'qilmadi: aylanma qatoridan. Chap tomon biz bo'lsak (sotuvchi) debet = tovar.
    const sellerLeft = leftIsUs === null ? true : party === "customer" ? leftIsUs : !leftIsUs;
    [goods, payments] = sellerLeft ? turnover : [turnover[1], turnover[0]];
    if (leftIsUs === null) warnings.push("Qatorlar o‘qilmadi. Aylanma ustunlari taxminan olindi — tekshiring.");
  }
  // + = kontragent bizga qarz
  const net = party === "customer" ? goods - payments : payments - goods;
  const a = bal.opening ?? 0, b = bal.closing ?? 0;
  const options = [];
  for (const so of a ? [1, -1] : [0]) for (const sc of b ? [1, -1] : [0]) if (Math.abs(so * a + net - sc * b) < 1) options.push([so, sc]);
  let opening, closing;
  const pick = options.find(([, sc]) => !closingSign || sc === closingSign || !b) || options[0];
  if (pick && !unknown) {
    opening = r2(pick[0] * a);
    closing = r2(pick[1] * b);
    if (options.length > 1 && !closingSign && a && b) warnings.push("Qoldiq kim foydasiga ekanini aniqlab bo‘lmadi — belgini tekshiring.");
  } else {
    // Hisob mos kelmadi yoki noma'lum qatorlar bor: «foydasiga» yozuvi yoki chap ustun egasiga qarab
    const sc = closingSign || (leftIsUs === false ? -1 : 1);
    closing = r2(sc * b);
    opening = bal.opening == null ? r2(closing - net) : r2((Math.abs(closing - net - a) <= Math.abs(closing - net + a) ? 1 : -1) * a);
    if (bal.opening != null || bal.closing != null) warnings.push(unknown ? unknown + " ta qatorning turi (tovar yoki to‘lov) aniqlanmadi — tanlang." : "PDFdagi qoldiq va aylanma bir-biriga mos kelmadi. Qatorlarni tekshiring.");
  }
  if (bal.closing == null && parsedRows.length) closing = r2(opening + net);
  if (!parsedRows.length && !bal.opening && !bal.closing && !turnover.length) warnings.push("PDFdan akt sverka ma’lumotlari topilmadi. Raqamlarni qo‘lda kiriting.");
  if (!from && parsedRows.length) {
    from = parsedRows.reduce((m, x) => (x.date < m ? x.date : m), parsedRows[0].date);
    to = parsedRows.reduce((m, x) => (x.date > m ? x.date : m), parsedRows[0].date);
    warnings.push("Davr PDFda topilmadi — qatorlar sanasidan olindi. Tekshiring.");
  }
  if (turnover.length === 2 && parsedRows.length && !unknown) {
    const [d, c] = turnover;
    const okTurn = (Math.abs(d - goods) < 1 && Math.abs(c - payments) < 1) || (Math.abs(c - goods) < 1 && Math.abs(d - payments) < 1);
    if (!okTurn) warnings.push("Qatorlar yig‘indisi PDFdagi aylanmaga teng emas — ba’zi qatorlar o‘qilmagan bo‘lishi mumkin.");
  }
  return { party, from, to, contract, left, leftIsUs, opening: r2(opening), closing: r2(closing), goods: r2(goods), payments: r2(payments), turnover, rows: parsedRows, warnings };
}

/** Qatorlar o'zgartirilganda (foydalanuvchi turini tanlaganda) jami summalar qayta hisoblanadi */
export function actTotals(act) {
  const rows = Array.isArray(act.rows) ? act.rows : [];
  if (!rows.length) return { goods: r2(act.goods), payments: r2(act.payments) };
  const s = (k) => rows.filter((x) => x.kind === k).reduce((n, x) => n + (+x.amount || 0), 0);
  return { goods: r2(s("goods") - s("return")), payments: r2(s("payment")) };
}

const dayDiff = (a, b) => Math.abs(Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / 864e5;

/**
 * act: parseAct natijasi (foydalanuvchi tuzatgan bo'lishi mumkin).
 * statement: { initial, debit, credit, closing, entries:[{date,doc,debit,credit}] } — dasturdagi akt sverka
 *   (customerStatement). debit = qarzni oshiradi (faktura), credit = kamaytiradi (to'lov).
 * Natija: asosiy ko'rsatkichlar farqi va qatorma-qator solishtirish.
 */
export function compareAct(act, statement) {
  const party = act.party === "supplier" ? "supplier" : "customer";
  const { goods, payments } = actTotals(act);
  // Dastur debet/kreditini PDF bilan bir xil ma'noga keltiramiz: tovar va to'lov
  const appGoods = party === "customer" ? statement.debit : statement.credit;
  const appPay = party === "customer" ? statement.credit : statement.debit;
  const line = (key, label, pdf, app) => ({ key, label, pdf: r2(pdf), app: r2(app), diff: r2(pdf - app), ok: Math.abs(pdf - app) < 1 });
  const lines = [
    line("opening", "Boshlang‘ich qoldiq", act.opening, statement.initial),
    line("goods", party === "customer" ? "Faktura / jo‘natma" : "Kirim / faktura", goods, appGoods),
    line("payments", "To‘lovlar", payments, appPay),
    line("closing", "Yakuniy qoldiq", act.closing, statement.closing),
  ];
  const pdfRows = (act.rows || []).map((x, i) => ({ ...x, i })).filter((x) => x.kind && x.kind !== "return");
  const appRows = (statement.entries || []).map((e, i) => {
    const isGoods = party === "customer" ? !!e.debit : !!e.credit;
    return { i, date: e.date, doc: e.doc, kind: isGoods ? "goods" : "payment", amount: r2(e.debit || e.credit || 0) };
  });
  const used = new Set(), matched = [], amountDiff = [], onlyPdf = [];
  const take = (p, test) => {
    let best = null;
    for (const a of appRows) if (!used.has(a.i) && a.kind === p.kind && test(a) && (!best || dayDiff(a.date, p.date) < dayDiff(best.date, p.date))) best = a;
    if (best) used.add(best.i);
    return best;
  };
  const left = [];
  for (const p of pdfRows) {
    const a = take(p, (a) => Math.abs(a.amount - p.amount) < 1 && dayDiff(a.date, p.date) <= 7);
    if (a) matched.push({ pdf: p, app: a });
    else left.push(p);
  }
  for (const p of left) {
    const a = take(p, (a) => a.date === p.date);
    if (a) amountDiff.push({ pdf: p, app: a, diff: r2(p.amount - a.amount) });
    else onlyPdf.push(p);
  }
  const onlyApp = appRows.filter((a) => !used.has(a.i));
  const ok = lines.every((l) => l.ok) && !onlyPdf.length && !onlyApp.length && !amountDiff.length;
  return { ok, lines, matched: matched.length, amountDiff, onlyPdf, onlyApp, unknownRows: (act.rows || []).filter((x) => !x.kind).length };
}

/** Foydalanuvchidan kelgan (tuzatilgan) akt ma'lumotini tekshirish va tozalash */
export function cleanAct(input, party = "customer") {
  const b = input && typeof input === "object" ? input : {};
  const money = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && Math.abs(n) <= 1e15 ? r2(n) : null;
  };
  const date = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
  const rows = (Array.isArray(b.rows) ? b.rows : []).slice(0, 500).map((x) => ({
    date: date(x?.date),
    doc: String(x?.doc ?? "").slice(0, 200),
    amount: money(x?.amount),
    kind: ["goods", "payment", "return"].includes(x?.kind) ? x.kind : "",
  })).filter((x) => x.date && x.amount > 0);
  const act = {
    party,
    from: date(b.from),
    to: date(b.to),
    contract: String(b.contract ?? "").slice(0, 60),
    left: String(b.left ?? "").slice(0, 160),
    leftIsUs: typeof b.leftIsUs === "boolean" ? b.leftIsUs : null,
    opening: money(b.opening),
    closing: money(b.closing),
    goods: money(b.goods) ?? 0,
    payments: money(b.payments) ?? 0,
    turnover: (Array.isArray(b.turnover) ? b.turnover : []).slice(0, 2).map(money).filter((x) => x != null),
    rows,
    warnings: (Array.isArray(b.warnings) ? b.warnings : []).slice(0, 10).map((w) => String(w).slice(0, 300)),
  };
  if (rows.length) Object.assign(act, actTotals(act));
  return act;
}

/* ---------- PDF → matn (skan bo'lsa OCR) ---------- */
let active = 0;
export async function readActPdf(pdf, opts = {}) {
  if (active >= 2) return { ...parseAct([], opts), scanned: false, warnings: ["Boshqa hujjatlar o‘qilmoqda. Bir ozdan so‘ng qayta yuklang."] };
  active++;
  let library, doc, worker, dir;
  const pages = [];
  let scanned = 0;
  const extra = [];
  try {
    const { PDFiumLibrary } = await import("@hyzyla/pdfium");
    library = await PDFiumLibrary.init();
    try {
      doc = await library.loadDocument(pdf);
    } catch {
      return { ...parseAct([], opts), scanned: false, warnings: ["PDF faylni ochib bo‘lmadi (shikastlangan yoki parol bilan himoyalangan)."] };
    }
    const total = doc.getPageCount(), count = Math.min(total, 10);
    if (count < total) extra.push("10-sahifadan keyingilari o‘qilmadi — qolganini qo‘lda tekshiring.");
    for (let index = 0; index < count; index++) {
      const page = doc.getPage(index);
      const text = page.getText() || "";
      if (text.replace(/\s/gu, "").length >= 40) {
        pages.push(text);
        continue;
      }
      // Matn yo'q — skanlangan sahifa: OCR
      try {
        if (!worker) {
          const [{ createWorker, PSM }, rus, eng, { PNG }] = await Promise.all([import("tesseract.js"), import("@tesseract.js-data/rus"), import("@tesseract.js-data/eng"), import("pngjs")]);
          dir = await mkdtemp(path.join(tmpdir(), "zavodlar-act-ocr-"));
          for (const lang of [rus.default, eng.default]) {
            const name = lang.code + ".traineddata.gz";
            await copyFile(path.join(lang.langPath, name), path.join(dir, name));
          }
          worker = await createWorker("rus+eng", 1, { langPath: dir, cacheMethod: "none" });
          await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO, preserve_interword_spaces: "1" });
          worker.png = PNG;
        }
        const { originalWidth, originalHeight } = page.getOriginalSize();
        const scale = Math.min(3, 2700 / Math.max(originalHeight, originalWidth));
        const image = await page.render({ scale, render: async ({ data }) => Buffer.from(data) });
        const result = await worker.recognize(worker.png.sync.write(image));
        pages.push(result.data.text || "");
        scanned++;
      } catch {
        pages.push("");
        extra.push(index + 1 + "-sahifani o‘qib bo‘lmadi.");
      }
    }
    const act = parseAct(pages, opts);
    if (scanned) act.warnings.unshift("PDF skanlangan — raqamlar OCR bilan o‘qildi. Asl hujjat bilan solishtiring.");
    act.warnings.push(...extra);
    return { ...act, scanned: scanned > 0 };
  } finally {
    try {
      if (worker) await worker.terminate();
      doc?.destroy();
      library?.destroy();
      if (dir) await rm(dir, { recursive: true, force: true });
    } finally {
      active--;
    }
  }
}
