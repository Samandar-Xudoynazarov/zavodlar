/**
 * Kalkulyatsiya kartalari — PDF (A4). Ko'rinishi «Kartalarni chop etish» bilan bir xil:
 * yuqorida korxona, sarlavha va sana; har bir mahsulot alohida sahifada — nomi, guruhi/andozasi va kalkulyatsiya jadvali.
 * pdfmake va shrift plan-pdf.js orqali (faqat tugma bosilganda) yuklanadi.
 */
import { tr, show } from "./i18n";
import { costCard, fmt, fmtDate, fmtN, schemeName, today } from "./calc";
import { buildPlanPdf, deliverPdf } from "./plan-pdf";

const C = { ink: "#111111", muted: "#6B7280", line: "#999999", sum: "#F7F9FC", total: "#2C5FD4" };

const typeHint = (r, card) => {
  if (r.type === "m3") return `${fmt(r.value)} × ${fmtN(card.V, 3)} m³`;
  if (r.type === "kg") return `${fmt(r.value)} × ${fmtN(card.kg, 2)} kg`;
  if (r.type === "pctPrev" || r.type === "pctSS") return `${fmtN(r.value, 2)} %`;
  return "";
};

const td = (text, o = {}) => ({ text: text ?? "", alignment: o.n ? "right" : "left", bold: o.bold, color: o.color || C.ink, fillColor: o.fill, colSpan: o.span, fontSize: o.size || 9.5 });
const pad = (n) => Array.from({ length: n }, () => ({}));

function cardTable(p, mats) {
  const c = costCard(p, mats);
  const head = [tr("Nomi"), tr("Birlik"), tr("Norma"), tr("Narx"), tr("Summa, so'm")].map((h, i) => td(h, { bold: true, n: i >= 2, fill: "#EEF1F6", size: 9 }));
  const sum = (label, v) => [td(label, { bold: true, span: 4, fill: C.sum }), ...pad(3), td(fmt(v), { n: true, bold: true, fill: C.sum })];
  const row = (label, hint, v) => [td(show(label)), td(hint, { span: 3, color: C.muted }), ...pad(2), td(fmt(v), { n: true })];
  const body = [
    head,
    ...c.items.map((it) => [
      td(it.m?.name || tr("— o'chirilgan —")),
      td(it.m?.unit || ""),
      td(fmtN(it.norm, 3), { n: true }),
      td(fmt(it.price, it.price % 1 ? 1 : 0), { n: true }),
      td(fmt(it.sum), { n: true }),
    ]),
    sum("Итого СС. материалов", c.materials),
    ...c.prodRows.map((r) => row(r.name, typeHint(r, c), r.amount)),
    sum("Производственная СС.", c.prodSS),
    ...c.otherRows.map((r) => row(r.name, typeHint(r, c), r.amount)),
    sum(tr("Другие затраты, jami"), c.other),
    sum(tr("Итого (tannarx)"), c.itogo),
    row("Маржа", `${fmtN(c.margin, 2)} %`, c.marginAmt),
    sum("Цена без НДС", c.noVat),
    row("НДС", `${fmtN(c.vat, 2)} %`, c.vatAmt),
    [td("Цена с НДС", { bold: true, span: 4, fill: C.total, color: "#FFFFFF", size: 11 }), ...pad(3), td(fmt(c.final), { n: true, bold: true, fill: C.total, color: "#FFFFFF", size: 11 })],
  ];
  return {
    table: { headerRows: 1, widths: ["*", 50, 55, 70, 85], body },
    layout: {
      hLineWidth: () => 0.6,
      vLineWidth: () => 0.6,
      hLineColor: () => C.line,
      vLineColor: () => C.line,
      paddingLeft: () => 5,
      paddingRight: () => 5,
      paddingTop: () => 3,
      paddingBottom: () => 3,
    },
  };
}

/** list: [{ p }] — tanlangan mahsulotlar (kalkulyatsiyasi borlari) */
export function costPdfDefinition(list, { mats, schemes, company }) {
  const content = [];
  list.forEach(({ p }, i) => {
    if (i === 0) {
      content.push({
        stack: [
          company ? { text: company, bold: true, fontSize: 11 } : null,
          { text: tr("Kalkulyatsiya kartalari"), bold: true, fontSize: 11 },
          { text: fmtDate(today()), color: C.muted, fontSize: 9 },
        ].filter(Boolean),
        alignment: "center",
        margin: [0, 0, 0, 10],
      });
    }
    const sch = schemeName(p, schemes);
    content.push({
      stack: [
        { text: `${show(p.name) || ""} ${p.code}`.trim(), bold: true, fontSize: 14 },
        { text: `${show(p.group) || ""}${sch ? ` · ${tr("andoza")}: ${sch}` : ""}`, color: C.muted, fontSize: 9, margin: [0, 1, 0, 6] },
        cardTable(p, mats),
      ],
      pageBreak: i > 0 ? "before" : undefined,
    });
  });
  return {
    pageSize: "A4",
    pageMargins: [36, 36, 36, 36],
    info: { title: tr("Kalkulyatsiya kartalari"), creator: "ПТО" },
    defaultStyle: { font: "Roboto", fontSize: 9.5, color: C.ink },
    content,
  };
}

const safe = (s) => String(s || "").replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_");

export async function downloadCostPdf(list, ctx, { share = false } = {}) {
  const blob = await buildPlanPdf(costPdfDefinition(list, ctx), { letterhead: false });
  const d = today();
  const name = list.length === 1 ? `Kalkulyatsiya_${safe(list[0].p.code)}_${d}.pdf` : `Kalkulyatsiya_kartalari_${d}.pdf`;
  return deliverPdf(blob, name, { share });
}
