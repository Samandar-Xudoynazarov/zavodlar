/**
 * «Excel kalkulyatsiya» — namunaviy «Калькуляция_….xlsx» shaklida:
 *  Свод   — tanlangan mahsulotlar jamlanmasi (har bir mahsulot varag'iga havola bilan)
 *  Цена   — ishlatilgan materiallar narxi (beton narxi o'z varag'idan formula bilan)
 *  Бетон… — beton retseptlari (1 m³ narxi)
 *  har bir mahsulot — alohida varaq: materiallar → ФОТ/ЕСП → Производственная СС → Другие затраты → Итого → Маржа → НДС
 * Hamma summalar Excel formulasi: «Цена» varag'ida narx o'zgarsa, hammasi qayta hisoblanadi.
 * Formulalarning natijasi ham yoziladi (dasturdagi costCard bilan bir xil) — fayl qayta hisoblanmasa ham to'g'ri ko'rinadi.
 */
import { show } from "./i18n";
import { costCard, priceOf } from "./calc";

const ACC = '_-* #,##0_-;\\-* #,##0_-;_-* "-"??_-;_-@_-';
const PCT = "0%";
const PCT1 = "0.0%";
const TNR = "Times New Roman";
const thin = { style: "thin" };
const med = { style: "medium" };
const BOX = { top: thin, left: thin, bottom: thin, right: thin };
const YELLOW = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } };
const GREEN = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC6E0B4" } };
const BETON_HEAD = { type: "pattern", pattern: "solid", fgColor: { argb: "FF70AD47" } };
const PEACH = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8CBAD" } };

/** Excel varaq nomi: 31 belgi, []:*?/\' taqiqlangan, takrorlanmaydi */
function sheetNamer() {
  const used = new Set();
  return (s) => {
    let base = String(s || "").replace(/[[\]:*?/\\']/g, " ").replace(/\s+/g, " ").trim().slice(0, 31) || "Лист";
    let n = base;
    for (let i = 2; used.has(n.toLowerCase()); i++) n = `${base.slice(0, 27)} (${i})`;
    used.add(n.toLowerCase());
    return n;
  };
}
const q = (name) => `'${name}'`; // formulada varaq nomi
const F = (formula, result) => ({ formula, result: Number.isFinite(result) ? result : 0 });
const isBeton = (m) => m?.group === "beton" && m.recipe?.length;

function style(cell, o = {}) {
  cell.font = { name: TNR, size: o.size || 10, bold: Boolean(o.bold), ...(o.color ? { color: { argb: o.color } } : {}), ...(o.underline ? { underline: true } : {}) };
  cell.border = o.border || BOX;
  cell.alignment = { vertical: "middle", horizontal: o.align || (o.num ? "right" : "left"), wrapText: Boolean(o.wrap) };
  if (o.fmt) cell.numFmt = o.fmt;
  if (o.fill) cell.fill = o.fill;
  return cell;
}

/**
 * list: [{ p }] — tanlangan mahsulotlar (kalkulyatsiyasi bor), ctx: { mats (Map), company }
 * wb — ExcelJS Workbook (lib/excel.js → newWorkbook)
 */
export function buildCostWorkbook(wb, list, { mats, company }) {
  const sheetName = sheetNamer();
  sheetName("Свод");
  sheetName("Цена");

  /* ---------- material nomlari (VLOOKUP uchun takrorlanmas) ---------- */
  const lookup = new Map(); // materialId → nom «Цена»dagi
  const priceRows = []; // { id, name, unit, m }
  const usedNames = new Set();
  const betonSheets = new Map(); // materialId → { name, m }
  const addMat = (id, m) => {
    if (lookup.has(id)) return lookup.get(id);
    let name = (m?.name || "— o'chirilgan —").trim();
    for (let i = 2; usedNames.has(name.toLowerCase()); i++) name = `${(m?.name || "—").trim()} (${i})`;
    usedNames.add(name.toLowerCase());
    lookup.set(id, name);
    priceRows.push({ id, name, unit: m?.unit || "", m });
    if (isBeton(m)) {
      betonSheets.set(id, { m, name: sheetName(m.name.replace(/М\s+/g, "М")) });
      for (const l of m.recipe) addMat(l.materialId, mats.get(l.materialId));
    }
    return name;
  };
  const cards = list.map(({ p }) => {
    const c = costCard(p, mats);
    c.items.forEach((it) => addMat(it.materialId, it.m));
    return { p, c };
  });
  // betonlar «Цена» boshida (namunadagidek)
  priceRows.sort((a, b) => (isBeton(b.m) ? 1 : 0) - (isBeton(a.m) ? 1 : 0));

  /* ---------- varaqlar tartibi: Свод, Цена, Бетон…, mahsulotlar ---------- */
  const svod = wb.addWorksheet("Свод", { views: [{ showGridLines: true }] });
  const price = wb.addWorksheet("Цена");
  const betonWs = new Map([...betonSheets].map(([id, b]) => [id, wb.addWorksheet(b.name)]));
  const prodWs = cards.map(({ p }) => ({ name: sheetName(p.code || p.name) }));
  prodWs.forEach((x) => (x.ws = wb.addWorksheet(x.name)));

  /* ---------- Цена ---------- */
  price.getColumn(3).width = 30.1;
  price.getColumn(4).width = 9.4;
  price.getColumn(5).width = 9;
  price.getColumn(6).width = 12.9;
  ["Наимования", "Изм-я", "Кол-во", "Цена"].forEach((h, i) => (style(price.getCell(2, 3 + i), { bold: true, align: "center", size: 11 }).value = h));
  const betonTotalRef = new Map(); // materialId → "'Бетон М400'!I12"
  betonSheets.forEach((b, id) => betonTotalRef.set(id, `${q(b.name)}!I${6 + b.m.recipe.length}`));
  priceRows.forEach((r, i) => {
    const row = 3 + i;
    style(price.getCell(row, 3), { size: 11 }).value = r.name;
    style(price.getCell(row, 4), { size: 11, align: "center" }).value = r.unit;
    style(price.getCell(row, 5), { size: 11, align: "center" }).value = 1;
    const v = priceOf(r.m, mats);
    style(price.getCell(row, 6), { size: 11, num: true, fmt: ACC }).value = betonTotalRef.has(r.id) ? F(betonTotalRef.get(r.id), v) : Math.round(v * 100) / 100;
  });

  /* ---------- material qatorlari (beton va mahsulot varaqlarida bir xil) ---------- */
  const matRows = (ws, lines, from, qtyRef) => {
    lines.forEach((l, i) => {
      const r = from + i;
      style(ws.getCell(r, 3), { border: { ...BOX, left: med }, align: "center" }).value = i + 1;
      style(ws.getCell(r, 4), { size: 11, fill: l.fill }).value = l.name;
      style(ws.getCell(r, 5), { size: 11, align: "center", fill: l.fill }).value = l.unit;
      style(ws.getCell(r, 6), { size: 11, num: true, fill: l.fill, fmt: "General" }).value = Math.round(l.norm * 1e6) / 1e6;
      style(ws.getCell(r, 7), { num: true, fmt: ACC }).value = F(`IF(D${r}="","",IFERROR(VLOOKUP(D${r},Цена!$C:$F,4,FALSE),""))`, l.price);
      style(ws.getCell(r, 8), { num: true, fmt: ACC }).value = F(`IF(OR(D${r}="",F${r}=""),"",G${r}*F${r})`, l.price * l.norm);
      style(ws.getCell(r, 9), { num: true, fmt: ACC }).value = F(`IF(H${r}="","",H${r}*${qtyRef})`, l.price * l.norm);
    });
  };
  const headRow = (ws, title, fill) => {
    [5, 32.4, 11.3, 9, 11.6, 10.9, 18.9].forEach((w, i) => (ws.getColumn(3 + i).width = w));
    ws.mergeCells("C3:I3");
    style(ws.getCell("C3"), { bold: true, size: 16, align: "center", fill, border: { top: med, left: med, bottom: thin, right: thin } }).value = title;
    ws.getRow(3).height = 24;
    ["№", "Наименование", "Ед.изм", "Норма расхода на 1 изделие", "Цена", "Сумма на 1 ед.", "Сумма"].forEach((h, i) =>
      (style(ws.getCell(4, 3 + i), { bold: true, align: "center", wrap: true, border: i === 0 ? { ...BOX, left: med } : BOX }).value = h)
    );
    ws.getRow(4).height = 54;
    for (let c = 3; c <= 8; c++) style(ws.getCell(5, c), { border: c === 3 ? { ...BOX, left: med } : BOX });
    style(ws.getCell("I5"), { num: true, fmt: ACC, align: "center" }).value = 1; // nechta dona (1 dona uchun)
    ws.pageSetup = { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
  };

  /* ---------- Бетон varaqlari ---------- */
  betonSheets.forEach((b, id) => {
    const ws = betonWs.get(id);
    headRow(ws, b.m.name.replace(/^Бетон\s*/i, ""), BETON_HEAD);
    const lines = b.m.recipe.map((l) => {
      const m = mats.get(l.materialId);
      return { name: lookup.get(l.materialId), unit: m?.unit || "", norm: +l.norm || 0, price: priceOf(m, mats) };
    });
    matRows(ws, lines, 6, "$I$5");
    const tr = 6 + lines.length;
    style(ws.getCell(tr, 4), { bold: true }).value = "Итого";
    style(ws.getCell(tr, 9), { bold: true, num: true, fmt: ACC }).value = F(lines.length ? `SUM($I$6:I${tr - 1})` : "0", priceOf(b.m, mats));
  });

  /* ---------- mahsulot varaqlari ---------- */
  const refs = cards.map(({ p, c }, k) => {
    const { ws, name } = prodWs[k];
    headRow(ws, `${show(p.name) || ""}  ${p.code || ""}`.trim(), GREEN);
    const lines = c.items.map((it) => ({ name: lookup.get(it.materialId), unit: it.m?.unit || "", norm: it.norm, price: it.price, fill: YELLOW }));
    matRows(ws, lines, 6, "$I$5");
    const first = 6;
    const last = 5 + lines.length;
    // beton hajmi (m³) — beton guruhidagi qatorlarning normasi
    const vParts = c.items.map((it, i) => (it.m?.group === "beton" ? `$F$${first + i}` : null)).filter(Boolean);
    const V = vParts.length === 0 ? "0" : vParts.length === 1 ? vParts[0] : `(${vParts.join("+")})`;
    let r = last + 1;
    const label = (row, text, bold) => style(ws.getCell(row, 4), { bold, size: bold ? 10 : 11 }).value = text;
    const blank = (row, from = 3, to = 9) => {
      for (let col = from; col <= to; col++) {
        const cell = ws.getCell(row, col);
        if (!cell.border) style(cell, { border: col === 3 ? { ...BOX, left: med } : BOX });
      }
    };
    const sumI = (row, formula, v, bold = true) => style(ws.getCell(row, 9), { bold, num: true, fmt: ACC }).value = F(formula, v);

    const matRow = r++;
    label(matRow, "Итого СС. материалов", true);
    style(ws.getCell(matRow, 8), { bold: true, num: true, fmt: ACC }).value = F(lines.length ? `SUM(H${first}:H${last})` : "0", c.materials);
    sumI(matRow, lines.length ? `SUM(I${first}:I${last})` : "0", c.materials);
    blank(matRow);

    // xarajat qatorlari (ФОТ, ЕСП, …) — turi bo'yicha formula
    const costRows = (rows, prevStart, ssRef) => {
      let prev = prevStart;
      return rows.map((x) => {
        const row = r++;
        label(row, show(x.name), false);
        const v = +x.value || 0;
        let formula;
        if (x.type === "m3") {
          style(ws.getCell(row, 7), { num: true, fmt: ACC }).value = v;
          formula = `G${row}*${V}*$I$5`;
        } else if (x.type === "kg") {
          style(ws.getCell(row, 6), { num: true, fmt: "0.0##" }).value = Math.round(c.kg * 1000) / 1000;
          style(ws.getCell(row, 7), { num: true, fmt: ACC }).value = v;
          formula = `G${row}*F${row}*$I$5`;
          ws.getCell(row, 4).fill = PEACH;
        } else if (x.type === "pctPrev") {
          style(ws.getCell(row, 5), { bold: true, num: true, align: "center", fmt: v % 1 ? PCT1 : PCT }).value = v / 100;
          formula = prev ? `${prev}*E${row}` : `0*E${row}`;
        } else if (x.type === "pctSS") {
          style(ws.getCell(row, 5), { bold: true, num: true, align: "center", fmt: v % 1 ? PCT1 : PCT }).value = v / 100;
          formula = ssRef ? `E${row}*${ssRef}` : `0*E${row}`;
        } else {
          style(ws.getCell(row, 7), { num: true, fmt: ACC }).value = v;
          formula = `G${row}*$I$5`;
        }
        sumI(row, formula, x.amount, false);
        blank(row);
        prev = `I${row}`;
        return row;
      });
    };
    const pr = costRows(c.prodRows, `I${matRow}`, null);
    const ssRow = r++;
    label(ssRow, "Производственная СС.", true);
    sumI(ssRow, `SUM(I${matRow}:I${pr.length ? pr[pr.length - 1] : matRow})`, c.prodSS);
    blank(ssRow);

    const otherHead = r++;
    label(otherHead, "Другие затраты:", true);
    blank(otherHead);
    const or = costRows(c.otherRows, null, `I${ssRow}`);
    sumI(otherHead, or.length ? `SUM(I${or[0]}:I${or[or.length - 1]})` : "0", c.other);

    const itogo = r++;
    label(itogo, "Итого", true);
    sumI(itogo, `I${ssRow}+I${otherHead}`, c.itogo);
    blank(itogo);
    const marg = r++;
    label(marg, "Маржа", true);
    style(ws.getCell(marg, 5), { bold: true, num: true, align: "center", fmt: c.margin % 1 ? PCT1 : PCT }).value = c.margin / 100;
    sumI(marg, `I${itogo}*E${marg}`, c.marginAmt);
    blank(marg);
    const noVat = r++;
    label(noVat, "Цена без НДС", true);
    sumI(noVat, `SUM(I${itogo}:I${marg})`, c.noVat);
    blank(noVat);
    const vat = r++;
    label(vat, "НДС", true);
    style(ws.getCell(vat, 5), { bold: true, num: true, align: "center", fmt: c.vat % 1 ? PCT1 : PCT }).value = c.vat / 100;
    sumI(vat, `I${noVat}*E${vat}`, c.vatAmt);
    blank(vat);
    const fin = r++;
    label(fin, "Цена С НДС", true);
    sumI(fin, `I${noVat}+I${vat}`, c.final);
    blank(fin);
    for (let col = 3; col <= 9; col++) ws.getCell(fin, col).border = { ...ws.getCell(fin, col).border, bottom: med };
    return { name, matRow, ssRow, itogo, marg, noVat, fin, first, last };
  });

  /* ---------- Свод ---------- */
  [5, 14, 26, 14, 15, 16, 15, 8, 15, 15, 16, 11, 44].forEach((w, i) => (svod.getColumn(3 + i).width = w));
  const groups = [...new Set(cards.map(({ p }) => p.group).filter(Boolean))];
  svod.mergeCells("C2:O2");
  style(svod.getCell("C2"), { bold: true, size: 16, align: "center", fill: GREEN, border: { top: med, left: med, bottom: thin, right: med } }).value =
    ["Свод калькуляции", groups.join(", "), company].filter(Boolean).join(" — ");
  svod.getRow(2).height = 26;
  ["№", "Код", "Наименование", "Группа", "СС материалов", "Производственная СС", "Полная СС", "Маржа", "Цена без НДС", "Цена С НДС", "Прежняя цена (Excel)", "Разница, %", "Примечание"].forEach((h, i) =>
    (style(svod.getCell(3, 3 + i), { bold: true, align: "center", wrap: true }).value = h)
  );
  svod.getRow(3).height = 45;
  cards.forEach(({ p, c }, i) => {
    const row = 4 + i;
    const x = refs[i];
    const s = q(x.name);
    style(svod.getCell(row, 3), { align: "center" }).value = i + 1;
    const code = String(p.code || x.name);
    style(svod.getCell(row, 4), { color: "FF0563C1", underline: true }).value = { formula: `HYPERLINK("#${s}!A1","${code.replace(/"/g, '""')}")`, result: code };
    style(svod.getCell(row, 5)).value = show(p.name) || "";
    style(svod.getCell(row, 6)).value = p.group || "";
    style(svod.getCell(row, 7), { num: true, fmt: ACC }).value = F(`${s}!I${x.matRow}`, c.materials);
    style(svod.getCell(row, 8), { num: true, fmt: ACC }).value = F(`${s}!I${x.ssRow}`, c.prodSS);
    style(svod.getCell(row, 9), { num: true, fmt: ACC }).value = F(`${s}!I${x.itogo}`, c.itogo);
    style(svod.getCell(row, 10), { num: true, align: "center", fmt: PCT }).value = F(`${s}!E${x.marg}`, c.margin / 100);
    style(svod.getCell(row, 11), { num: true, fmt: ACC }).value = F(`${s}!I${x.noVat}`, c.noVat);
    style(svod.getCell(row, 12), { num: true, fmt: ACC, bold: true }).value = F(`${s}!I${x.fin}`, c.final);
    const old = +p.excelPrice || 0;
    style(svod.getCell(row, 13), { num: true, fmt: ACC }).value = old || null;
    const diff = svod.getCell(row, 14);
    style(diff, { num: true, align: "center", fmt: PCT1 });
    diff.value = old > 0 ? F(`IF(M${row}>0,L${row}/M${row}-1,"")`, c.final / old - 1) : { formula: `IF(M${row}>0,L${row}/M${row}-1,"")`, result: "" };
    const missing = c.items.some((it) => !it.price);
    const range = x.last >= x.first ? `${s}!G${x.first}:G${x.last}` : null;
    style(svod.getCell(row, 15), { wrap: true }).value = range
      ? { formula: `IF(COUNTIF(${range},0)+COUNTIF(${range},"")>0,"Нет цены у материалов; ","")`, result: missing ? "Нет цены у материалов; " : "" }
      : "Нет материалов; ";
  });
  svod.pageSetup = { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
  svod.views = [{ state: "frozen", ySplit: 3, xSplit: 0, showGridLines: true }];
  return wb;
}
