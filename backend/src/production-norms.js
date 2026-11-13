// Same norm expansion used by the daily editor; parity covered by integration tests.
export function expandNorms(product, mats, settings) {
  const out = new Map();
  const add = (id, q, derived) => {
    const r = out.get(id) || { qty: 0, derived };
    r.qty += q;
    r.derived = r.derived && derived;
    out.set(id, r);
  };
  let metal = 0;
  for (const l of product?.norms || []) {
    const m = mats.get(l.materialId);
    const q = +l.norm || 0;
    add(l.materialId, q, false);
    if (m?.group === "beton") for (const w of m.writeoff || []) add(w.materialId, q * (+w.norm || 0), true);
    if (m?.electrodeBase) metal += q;
  }
  const pct = +settings?.electrodePct || 0;
  const all = [...mats.values()];
  // «Elektrod» belgisi qo'yilgan material; eski ma'lumotlar uchun — nomi bo'yicha
  const electrode = all.find((m) => m.isElectrode) || all.find((m) => m.name?.trim().toLowerCase() === "электрод");
  if (electrode && pct && metal) {
    const hasManual = (product?.norms || []).some((l) => l.materialId === electrode.id);
    if (!hasManual) add(electrode.id, Math.round(((pct / 100) * metal + 1e-9) * 1000) / 1000, true); // Excel ROUND(…;3)
  }
  return out;
}

/** Bir necha mahsulot × soni uchun jami sarf: Map(materialId → qty) */
export function consumption(lines, products, mats, settings) {
  const total = new Map();
  for (const { productId, qty } of lines) {
    if (!qty) continue;
    const p = products.get(productId);
    if (!p) continue;
    for (const [id, r] of expandNorms(p, mats, settings)) total.set(id, (total.get(id) || 0) + r.qty * qty);
  }
  return total;
}

