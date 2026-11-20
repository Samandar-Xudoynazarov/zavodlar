import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PDFiumLibrary } from "@hyzyla/pdfium";
import { PNG } from "pngjs";
import { createWorker, PSM } from "tesseract.js";
import rus from "@tesseract.js-data/rus";
import eng from "@tesseract.js-data/eng";
import { readTable } from "./contract-table.js";
const number = (s) =>
  Number(
    String(s)
      .replace(/[\s\u00a0]/g, "")
      .replace(",", "."),
  );
const amountPattern = /\d+(?:[ \u00a0]\d{3})*(?:[,.]\d+)?/g;
const unitPattern = /(?:^|\s)(шт(?:ук[аи]?|\.)?|дона|dona|тонн[аы]?|тонна|tonna|kg|кг|м[³3]|m[³3]|т)(?=\s|$)/i;
const brand = (s) =>
  s
    .replace(/^[\s\d.)|]+/, "")
    .replace(/\s*[-|]\s*$/, "")
    .trim();

export function parseContract(pages) {
  const full = pages.join("\n").replace(/\r/g, "");
  const numberMatch =
    full.match(
      /(?:договор|shartnoma|шартнома)(?:\s+(?:поставки|на поставку))?\s*(?:№|N[oº°]?|#)\s*([\wА-Яа-я/-]+)/i,
    ) || full.match(/(?:dagi|даги)\s+([\w/-]+)\s*[-–]?\s*(?:sonli|сонли)/i);
  const dateMatch = full.match(/\b(\d{2})[./](\d{2})[./](20\d{2})\b/);
  const party = (role) => {
    const mark = new RegExp(role, "i");
    const intro = full.replace(/\s+/g, " ");
    for (const m of intro.matchAll(/["«“]([^"»”\n]{2,140})["»”]([^"«“]{0,150})/g)) {
      if (mark.test(m[2].split(/\b(?:директора|direktor)/i)[0])) return m[1].trim();
    }
    const field = full.match(new RegExp("(?:" + role + ')\\s*[:：]\\s*["«“]?([^\\n"»”]{2,140})', "i"));
    return field?.[1]?.trim() || "";
  };
  const items = [];
  let originalTotal = null;
  for (const [pageIndex, page] of pages.entries()) {
    const lines = page.split(/\r?\n/);
    let pending = "";
    for (const raw of lines) {
      const line = raw.replace(/[|│]/g, " ").trim();
      if (!line) continue;
      if (/^(?:итого|жами|jami|всего)(?:\s|:)/i.test(line)) {
        const nums = line.match(amountPattern);
        if (nums?.length) originalTotal = number(nums.at(-1));
        continue;
      }
      const unitMatch = unitPattern.exec(line);
      if (!unitMatch) {
        if (/^\d{1,3}[.)]?\s+[A-Za-zА-Яа-я]/.test(line)) pending = brand(line);
        continue;
      }
      let name = brand(line.slice(0, unitMatch.index)).replace(/\s+[-–]\s*$/, "");
      if (!name || name.length < 2) name = pending;
      pending = "";
      const tail = line.slice(unitMatch.index + unitMatch[0].length).trim();
      // Prefer table cell boundaries. Group separators inside currency amounts stay intact.
      let cells = tail
        .split(/\s{2,}|\t/)
        .filter(Boolean)
        .map((s) => s.replace(/[%₽]/g, "").trim())
        .filter((s) => /^\d[\d\s.,]*$/.test(s))
        .map(number);
      if (cells.length < 2) {
        const qty = tail.match(/^(\d+(?:[,.]\d+)?)\s+/);
        if (!qty) continue;
        cells = [number(qty[1]), ...(tail.slice(qty[0].length).match(amountPattern) || []).map(number)];
      }
      if (!name || name.length > 160 || cells.length < 2 || !cells.every(Number.isFinite) || cells[0] <= 0)
        continue;
      const [qty, price] = cells;
      if (price <= 0) continue;
      const total = cells.length >= 3 ? cells.at(-1) : Math.round(qty * price * 100) / 100;
      items.push({ name, unit: unitMatch[1], qty, price, total, page: pageIndex + 1 });
    }
  }
  return {
    number: numberMatch?.[1] || "",
    date: dateMatch ? dateMatch[3] + "-" + dateMatch[2] + "-" + dateMatch[1] : "",
    buyer: party("заказчик|покупатель|buyurtmachi|сотиб олувчи"),
    seller: party("исполнитель|поставщик|yetkazib beruvchi|бажарувчи"),
    originalTotal,
    items,
  };
}

function identityFromProtocol(draft, pages) {
  const protocol = pages.find((p) => /IMZOLASH BAYONNOMASI/i.test(p));
  if (!protocol) return;
  const entries = ["Yuboruvchi", "Qabul qiluvchi"]
    .map((label) => {
      const name = protocol
        .match(new RegExp(label + ':\\s*["«]([^"»]+)["»]', "i"))?.[1]
        .replace(/\s+/g, " ")
        .trim();
      const tin = protocol.match(new RegExp(label + "\\s+STIR:\\s*(\\d{9})", "i"))?.[1];
      return { name, tin };
    })
    .filter((e) => e.name && e.tin);
  const normalized = (s) => s.toLowerCase().replace(/[^a-zа-я0-9]/g, "");
  for (const key of ["buyer", "seller"]) {
    const name = normalized(draft[key] || "");
    const match = entries.find(
      (e) => draft[key + "Tin"] === e.tin || (name.length > 6 && normalized(e.name) === name),
    );
    if (match) {
      draft[key] = match.name;
      draft[key + "Tin"] = match.tin;
    }
  }
}
function pageThumbnail(image) {
  const width = Math.min(850, image.width),
    height = Math.max(1, Math.round((image.height * width) / image.width));
  const out = new PNG({ width, height });
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const src =
        4 * (Math.floor((y * image.height) / height) * image.width + Math.floor((x * image.width) / width));
      out.data.set(image.data.subarray(src, src + 4), 4 * (y * width + x));
    }
  return "data:image/png;base64," + PNG.sync.write(out).toString("base64");
}
let active = 0;
export async function readContract(pdf) {
  if (active >= 2)
    return { ...parseContract([]), warnings: ["Boshqa shartnomalar o‘qilmoqda. Bir ozdan so‘ng qayta yuklang."] };
  active++;
  let library, doc, worker, dir;
  const warnings = [],
    pages = [],
    scanned = new Map(),
    previews = {};
  try {
    library = await PDFiumLibrary.init();
    doc = await library.loadDocument(pdf);
    const count = Math.min(doc.getPageCount(), 16);
    if (count < doc.getPageCount()) warnings.push("16-sahifadan keyingi qatorlarni qo‘lda tekshiring.");
    for (let index = 0; index < count; index++) {
      const page = doc.getPage(index),
        text = page.getText();
      pages.push(text);
      const digital = text.trim().length >= 100;
      const looksLikeTable = /narx|цена/i.test(text) && /miqdor|кол[- .]?во|количество/i.test(text);
      if (digital && (!looksLikeTable || parseContract([text]).items.length)) continue;
      if (!worker) {
        dir = await mkdtemp(path.join(tmpdir(), "zavodlar-ocr-"));
        for (const lang of [rus, eng]) {
          const name = lang.code + ".traineddata.gz";
          await copyFile(path.join(lang.langPath, name), path.join(dir, name));
        }
        worker = await createWorker("rus+eng", 1, { langPath: dir, cacheMethod: "none" });
      }
      const { originalWidth, originalHeight } = page.getOriginalSize();
      const scale = Math.min(3, 2700 / Math.max(originalHeight, originalWidth));
      const image = await page.render({ scale, render: async ({ data }) => Buffer.from(data) });
      await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO, preserve_interword_spaces: "1" });
      if (!digital) {
        const recognized = await worker.recognize(PNG.sync.write(image));
        pages[index] = recognized.data.text;
      }
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
      const table = await readTable(image, worker, index + 1);
      scanned.set(index, table);
      if (table.items.length && Object.keys(previews).length < 6) previews[index + 1] = pageThumbnail(image);
    }
    const draft = parseContract(pages);
    for (const [i, table] of scanned) {
      if (table.items.length) draft.items = draft.items.filter((item) => item.page !== i + 1).concat(table.items);
      if (table.total > 0) draft.originalTotal = table.total;
    }
    draft.items.sort((a, b) => a.page - b.page);
    identityFromProtocol(draft, pages);
    if (scanned.size) warnings.push("Skanlangan ma’lumotlarni asl shartnoma bilan solishtiring.");
    if (!draft.items.length) warnings.push("Mahsulot qatorlarini PDFdan kiriting.");
    return { ...draft, warnings, previews };
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
