/**
 * Накладная (yuk xati) PDF — «Kunlik hisobot»dagi jo'natishdan.
 * Shakl qo'lda ishlatilgan «nakladnoy» sahifasidagi bilan bir xil: bitta varaqda ikki nusxa (albom A4)
 * yoki bitta nusxa (portret A4). pdfmake va shrift plan-pdf.js orqali yuklanadi.
 */
import { buildPlanPdf } from "./plan-pdf";
import { toCyr } from "./i18n";

const hasCyr = (s) => /[Ѐ-ӿ]/.test(s || "");
/** Lotincha yozilgan bo'lsa — kirillga (nakladnoy shakli kirill/rus tilida) */
// so'zma-so'z: «Samarqand, Узкек» → «Самарқанд, Узкек»; kirill so'zlar va raqamlar o'zgarmaydi
export const cyr = (s) =>
  String(s || "")
    .split(/(\s+|[,;:()"«»/])/)
    .map((w) => (!w || hasCyr(w) || !/[a-z]/i.test(w) ? w : toCyr(w)))
    .join("");
const fmtDate = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(2, 4)}` : "");
const money = (n) => (n ? Math.round(n).toLocaleString("ru-RU") : "");

/** «113/09» → «114/10» (oy qismi nakladnoy sanasiga moslanadi). Bo'sh bo'lsa — «1/MM» */
export function nextNo(last, date) {
  const mm = (date || "").slice(5, 7);
  const m = String(last || "").match(/^(\d+)(.*)$/);
  if (!m) return mm ? `1/${mm}` : "1";
  let suffix = m[2];
  if (/^\/\d{2}$/.test(suffix) && mm) {
    // yangi oy boshlansa raqam 1 dan
    if (suffix.slice(1) !== mm) return `1/${mm}`;
    suffix = `/${mm}`;
  }
  return `${+m[1] + 1}${suffix}`;
}

const thin = scale => ({ hLineWidth: () => 0.8 * scale, vLineWidth: () => 0.8 * scale, hLineColor: () => "#000", vLineColor: () => "#000", paddingLeft: () => 4, paddingRight: () => 4, paddingTop: () => 3 * scale, paddingBottom: () => 3 * scale });
const underline = (text, o = {}) => ({
  table: { widths: ["*"], body: [[{ text: text || " ", border: [false, false, false, true], fontSize: o.size || 11, margin: [2, 0, 2, 0] }]] },
  layout: { hLineWidth: () => 0.7, vLineWidth: () => 0, hLineColor: () => "#000", paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 1 },
});

function copy(d, { compact, scale }) {
  const pt = value => value * scale;
  const fs = compact ? 10.5 : 12;
  const LW = compact ? 96 : 110; // yorliq ustuni — qiymat chiziqlari bir tekisda
  const metaLine = (label, value) => ({ columns: [{ text: label, bold: true, fontSize: pt(fs), width: LW, noWrap: true }, underline(value, { size: pt(fs) })], margin: [0, 0, 0, pt(compact ? 5 : 7)] });
  const rows = d.items.map((it, i) => [
    { text: String(i + 1), alignment: "center" },
    { text: it.name || "" },
    { text: it.unit || "", alignment: "center" },
    { text: it.qty ? String(it.qty) : "", alignment: "center" },
    { text: it.sum || "", alignment: "right" },
  ]);
  const minRows = compact ? 10 : 12;
  for (let i = rows.length; i < minRows; i++) rows.push([{ text: String(i + 1), alignment: "center", color: "#999" }, "", "", "", ""]);
  if (d.total) rows.push([{ text: "" }, { text: "Итого", bold: true, alignment: "right" }, "", { text: String(d.totalQty || ""), bold: true, alignment: "center" }, { text: d.total, bold: true, alignment: "right" }]);

  const sig = (label, value, img) => ({
    columns: [
      { text: label, bold: true, fontSize: pt(fs), width: LW + 14, noWrap: true, margin: [0, 2, 0, 0] },
      underline(value, { size: pt(fs) }),
      img ? { image: img, width: pt(compact ? 58 : 70), height: pt(compact ? 24 : 28), margin: [6, pt(-12), 0, 0] } : { text: "", width: compact ? 58 : 70 },
      { text: "(подпись)", italics: true, fontSize: pt(8), width: "auto", margin: [6, 4, 0, 0] },
    ],
    margin: [0, pt(compact ? 7 : 9), 0, 0],
  });
  // yuqori o'ng burchak — muhr (shtamp) uchun bo'sh joy; ostida kichik «М.П.» (место печати)
  // dumaloq muhr odatda 40 mm (≈113 pt) — atrofida ozgina zaxira bilan
  const stampW = compact ? 126 : 150;
  const stampH = pt(compact ? 122 : 140);
  return {
    stack: [
      {
        columns: [
          {
            width: "*",
            stack: [
              { text: [{ text: "НАКЛАДНАЯ № ", bold: true }, { text: `  ${d.num || "        "}  `, decoration: "underline" }], fontSize: pt(compact ? 17 : 20), margin: [0, 0, 0, pt(compact ? 9 : 12)] },
              metaLine("Отправитель:", cyr(d.sender)),
              metaLine("Получатель:", cyr(d.receiver)),
              metaLine("Дата отправки:", fmtDate(d.date)),
              metaLine("Договор №:", cyr(d.contract)),
            ],
          },
          {
            width: stampW,
            stack: [
              { canvas: [{ type: "rect", x: 0, y: 0, w: stampW, h: stampH, lineWidth: 0, lineColor: "#ffffff" }] },
              { text: "М.П.", fontSize: pt(8), color: "#9a9a9a", alignment: "center", margin: [0, pt(-14), 0, 0] },
            ],
          },
        ],
        columnGap: compact ? 8 : 14,
      },
      {
        margin: [0, pt(6), 0, pt(10)],
        table: {
          headerRows: 1,
          widths: [18, "*", 34, 40, compact ? 66 : 80],
          heights: (r) => pt(r === 0 ? 16 : compact ? 17 : 22),
          body: [
            ["№", "Наименование", "Ед.изм", "Кол-во", "Сумма"].map((h) => ({ text: h, bold: true, alignment: "center", fillColor: "#E9E9E9", fontSize: pt(fs - 1.5) })),
            ...rows.map((r) => r.map((c) => (typeof c === "string" ? { text: c, fontSize: pt(fs - 1) } : { ...c, fontSize: pt(fs - 1) }))),
          ],
        },
        layout: thin(scale),
      },
      sig("Отправил (ФИО):", cyr(d.sentBy), d.signature),
      sig("Водитель (ФИО):", cyr(d.driver)),
      sig("Получил (ФИО):", cyr(d.receivedBy)),
      { columns: [{ text: "Автомобиль:", bold: true, fontSize: pt(fs), width: LW + 14, noWrap: true, margin: [0, 2, 0, 0] }, underline(d.car, { size: pt(fs) }), { text: "", width: compact ? 104 : 116 }], margin: [0, pt(compact ? 7 : 9), 0, 0] },
    ],
  };
}

/** d: { num, sender, receiver, date, contract, items: [{ name, unit, qty, sum }], total, totalQty, sentBy, signature, driver, receivedBy, car, copies } */
export function nakladnoyDefinition(d, scale = 1) {
  const two = d.copies !== 1;
  const content = two
    ? [
        {
          columns: [
            { ...copy(d, { compact: true, scale }), width: "*" },
            { canvas: [{ type: "line", x1: 0, y1: 0, x2: 0, y2: 540, lineWidth: 0.8, dash: { length: 3 } }], width: 1 },
            { ...copy(d, { compact: true, scale }), width: "*" },
          ],
          columnGap: 16,
        },
      ]
    : [copy(d, { compact: false, scale })];
  return {
    pageSize: "A4",
    pageOrientation: two ? "landscape" : "portrait",
    pageMargins: two ? [18, 22, 18, 14] : [36, 36, 36, 30],
    info: { title: `Накладная ${d.num || ""}`.trim(), creator: "ПТО" },
    defaultStyle: { font: "Roboto", fontSize: 11 * scale, color: "#000", lineHeight: 1.1 },
    content,
  };
}

// Measure the actual layout: long company names and wrapped item descriptions also take space.
export async function buildNakladnoyPdf(data) {
  let scale = 1;
  for (let attempt = 0; attempt < 8; attempt++) {
    const definition = nakladnoyDefinition(data, scale);
    let pages = 1;
    definition.pageBreakBefore = node => {
      pages = node.pages;
      return false;
    };
    const blob = await buildPlanPdf(definition, { letterhead: false });
    if (pages === 1) return blob;
    scale *= Math.min(0.8, 1 / (pages - 0.5));
  }
  throw new Error("Yuk xati bitta A4 varaqqa sig‘madi. Mahsulotlar ro‘yxatini ikkita yuk xatiga ajrating.");
}

export { money };
