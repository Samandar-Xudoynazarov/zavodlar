import { PNG } from "pngjs";

// Detect ruled rows in the rendered page. Each row keeps its own vertical borders
// because VAT headers, totals and wrapped product names may span several cells.
function rules(length, hit) {
  const points = [];
  for (let i = 0; i < length; i++) {
    if (!hit(i)) continue;
    const start = i;
    while (i + 1 < length && hit(i + 1)) i++;
    points.push(Math.round((start + i) / 2));
  }
  return points;
}
export function tableRows(image) {
  const { width, height, data } = image;
  const dark = (x, y) => data[4 * (y * width + x)] < 125;
  const ys = rules(height, (y) => {
    let count = 0;
    for (let x = 0; x < width; x += 2) if (dark(x, y)) count++;
    return count > width * 0.25;
  });
  const rows = [];
  for (let i = 1; i < ys.length; i++) {
    const y = ys[i - 1],
      bottom = ys[i],
      h = bottom - y;
    if (h < 13 || h > height * 0.13) continue;
    const xs = rules(width, (x) => {
      let count = 0;
      for (let k = y + 2; k < bottom - 1; k += 2) if (dark(x, k)) count++;
      return count > (h - 4) * 0.36;
    }).filter((v, i, a) => !i || v - a[i - 1] > 4);
    if (xs.length >= 5 && xs.length <= 22) rows.push({ y, bottom, xs });
  }
  return rows;
}
function crop(image, left, top, right, bottom) {
  const zoom = 2,
    pad = 12,
    w = right - left,
    h = bottom - top;
  const result = new PNG({ width: w * zoom + 2 * pad, height: h * zoom + 2 * pad });
  result.data.fill(255);
  let ink = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const k = image.data[4 * ((y + top) * image.width + x + left)];
      if (k > 200) continue;
      ink++;
      for (let dy = 0; dy < zoom; dy++)
        for (let dx = 0; dx < zoom; dx++) {
          const off = 4 * ((pad + y * zoom + dy) * result.width + pad + x * zoom + dx);
          result.data.fill(k, off, off + 3);
        }
    }
  return ink >= 9 ? PNG.sync.write(result) : null;
}
const unit = /^(штук[аи]?|шт\.?|дона|dona|тонн[аы]?|tonna|т|кг|kg|м[3³]|m[3³])$/i;
const amount = (s) =>
  /^\d+(?:[.,]\d+)?$/.test(s.replace(/\s/g, "")) ? Number(s.replace(/\s/g, "").replace(",", ".")) : null;
export async function readTable(image, worker, page) {
  const items = [],
    records = [];
  let total = null;
  for (const row of tableRows(image).slice(0, 104)) {
    const cells = [];
    for (let i = 1; i < row.xs.length; i++) {
      const region = crop(image, row.xs[i - 1] + 3, row.y + 3, row.xs[i] - 2, row.bottom - 2);
      cells.push(region ? (await worker.recognize(region)).data.text.replace(/\s+/g, " ").trim() : "");
    }
    records.push({
      cells,
      region: {
        left: row.xs[0] / image.width,
        top: row.y / image.height,
        width: (row.xs.at(-1) - row.xs[0]) / image.width,
        height: (row.bottom - row.y) / image.height,
      },
    });
  }
  const header = records
    .map((r) => r.cells)
    .find((c) => c.some((s) => /единиц|birlik/i.test(s)) && c.some((s) => /цена|narx/i.test(s)));
  const unitsAt = header?.findIndex((v) => /единиц|birlik/i.test(v)) ?? -1;
  for (const { cells, region } of records) {
    const last = amount(cells.at(-1));
    if (cells.some((c) => /^(итого|жами|jami|всего)/i.test(c.replace(/\s/g, ""))) && last > 0) {
      total = last;
      continue;
    }
    const unitIndex = unitsAt >= 1 ? unitsAt : cells.findIndex((v) => unit.test(v));
    if (unitIndex < 1 || !cells[unitIndex + 1] || !cells[unitIndex + 2]) continue;
    const name = cells.slice(0, unitIndex).find((c) => /[\p{Letter}]{2}/u.test(c));
    const qty = amount(cells[unitIndex + 1]);
    if (!name || !(qty > 0)) continue;
    const rawUnit = cells[unitIndex],
      relatedUnits = records.map((r) => r.cells[unitIndex]).filter((v) => v && unit.test(v));
    const commonUnit = new Set(relatedUnits.map((v) => v.toLowerCase())).size === 1 ? relatedUnits[0] : "";
    const item = {
      name,
      region,
      unit: unit.test(rawUnit) ? rawUnit : commonUnit || rawUnit,
      qty,
      price: amount(cells[unitIndex + 2]) ?? "",
      total: last ?? "",
      page,
    };
    const rateText = cells[unitIndex + 4] || "";
    if (cells.length === unitIndex + 7 && /^\s*\d{1,2}\s*%?\s*$/.test(rateText)) {
      const net = amount(cells[unitIndex + 3]),
        vat = amount(cells[unitIndex + 5]);
      item.rate = Number(rateText.replace(/\D/g, ""));
      if (net > 0 && vat >= 0 && Math.abs((net * item.rate) / 100 - vat) < 0.1)
        item.verifiedGross = Math.round((net + vat) * 100) / 100;
    }
    items.push(item);
  }
  // An OCR digit can change a row total. Repair it only when both the net/VAT
  // columns and the independently printed grand total support the same value.
  if (total && items.length && items.every((i) => i.total !== "")) {
    const difference = Math.round((total - items.reduce((s, i) => s + i.total, 0)) * 100) / 100;
    if (difference) {
      const supported = items.filter(
        (i) => i.verifiedGross && Math.abs(i.verifiedGross - i.total - difference) < 0.02,
      );
      if (supported.length === 1) supported[0].total = supported[0].verifiedGross;
    }
    if (Math.abs(items.reduce((s, i) => s + i.total, 0) - total) < 0.02) {
      for (const i of items)
        if (i.rate != null && i.qty > 0) {
          const implied = Math.round((i.total * 100) / (i.qty * (1 + i.rate / 100))) / 100;
          if (
            i.price === "" ||
            (Math.abs(i.price - implied) > 0.01 && Math.abs(i.price - implied) <= implied * 0.02)
          )
            i.price = implied;
        }
    }
  }
  for (const i of items) {
    delete i.rate;
    delete i.verifiedGross;
  }
  return { items, total };
}
