"use client";
// Sifat nazorati: beton kub namunalarining 7 va 28 kunlik sinov natijalari.
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { today, productOptions } from "@/lib/calc";
import { exportSheets } from "@/lib/xlsx-export";
import { useT } from "@/lib/i18n";
import "./finance-extra.css";
import { Kpi, Tag, ddmm, useLoad } from "./FinanceUi";

const STATUS = { ok: ["ok", "Talabga javob beradi"], fail: ["bad", "Yaroqsiz"], risk: ["sig", "Xavf: 7 kunlik past"], pending: ["acc", "28 kunlik kutilmoqda"], late: ["bad", "28 kunlik kiritilmagan"], void: ["mut", "Bekor qilingan"] };
const rid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (c ^ (Math.random() * 16) >> (c / 4)).toString(16)));
const n1 = (v) => (v === null || v === undefined ? "—" : String(Math.round(v * 10) / 10).replace(".", ","));

export default function QualityTab({ data, notify, openForm }) {
  const tt = useT();
  const [from, setFrom] = useState(() => { const d = new Date(Date.now() - 90 * 864e5); return d.toISOString().slice(0, 10); });
  const [filter, setFilter] = useState("");
  const res = useLoad("/quality?from=" + from);
  const d = res.data;
  const products = data?.products || [];
  const pName = (id) => products.find((p) => p.id === id)?.code || "";
  const list = useMemo(() => (d?.tests || []).filter((t) => !filter || t.status === filter), [d, filter]);

  function edit(t) {
    const isNew = !t;
    openForm({ title: isNew ? "Yangi beton sinovi" : "Sinov natijasi · " + t.grade + " · " + ddmm(t.castDate),
      description: "Talab qilingan mustahkamlik — loyiha bo‘yicha (MPa). B25 uchun odatda 32,7 MPa. 28 kunlik natija talabdan past bo‘lsa — partiya «yaroqsiz» deb belgilanadi.",
      values: t ? { ...t, productId: t.productId || "" } : undefined,
      fields: [
        { name: "castDate", label: "Quyilgan sana", type: "date", req: true, def: today() },
        { name: "grade", label: "Beton sinfi (markasi)", req: true, def: "B25", hint: "Masalan: B25, B30, M350" },
        { name: "requiredMpa", label: "Talab qilingan mustahkamlik", type: "number", step: "0.1", req: true, unit: "MPa", def: 32.7 },
        { name: "batch", label: "Partiya / zames raqami" },
        { name: "productId", label: "Mahsulot (ixtiyoriy)", type: "select", raw: true, options: [["", "—"], ...productOptions(products)] },
        { name: "samples", label: "Namunalar soni", type: "number", min: 1, step: 1, def: 3 },
        { name: "r7Mpa", label: "7 kunlik natija", type: "text", unit: "MPa", hint: "Bo‘sh qoldirsa bo‘ladi" },
        { name: "r28Mpa", label: "28 kunlik natija", type: "text", unit: "MPa", hint: "Bo‘sh qoldirsa bo‘ladi" },
        { name: "lab", label: "Laboratoriya / kim sinadi" },
        { name: "note", label: "Izoh", wide: true },
      ],
      submitLabel: "Saqlash",
      onSubmit: async (v) => {
        const body = { ...v, r7Mpa: v.r7Mpa === "" ? null : String(v.r7Mpa).replace(",", "."), r28Mpa: v.r28Mpa === "" ? null : String(v.r28Mpa).replace(",", "."), productId: v.productId || null };
        if (isNew) await api("/quality", { method: "POST", body: { ...body, requestId: rid() } });
        else await api("/quality/" + t.id, { method: "PUT", body });
        res.reload(); notify("Saqlandi");
      } });
  }
  function voidTest(t) {
    openForm({ title: "Sinovni bekor qilish", description: t.grade + " · " + ddmm(t.castDate) + ". Yozuv o‘chmaydi, «bekor qilingan» bo‘lib qoladi.", fields: [{ name: "reason", label: "Sababi", req: true, wide: true }], submitLabel: "Bekor qilish",
      onSubmit: async (v) => { await api("/quality/" + t.id + "/void", { method: "POST", body: v }); res.reload(); } });
  }
  async function excel() {
    try {
      await exportSheets({ filename: "Beton_sinovlari_" + today() + ".xlsx", company: data?.settings?.company, sheets: [{ name: "Beton sinovlari", title: "Beton namunalarini sinash jurnali",
        columns: [{ key: "castDate", header: "Quyilgan sana", width: 13 }, { key: "grade", header: "Sinf", width: 10 }, { key: "batch", header: "Partiya", width: 14 }, { key: "product", header: "Mahsulot", width: 18 }, { key: "samples", header: "Namuna", type: "num", width: 9 }, { key: "requiredMpa", header: "Talab, MPa", type: "num", width: 12 }, { key: "r7Mpa", header: "7 kun, MPa", type: "num", width: 12 }, { key: "r28Mpa", header: "28 kun, MPa", type: "num", width: 12 }, { key: "percent", header: "% talabdan", type: "num", width: 11 }, { key: "status", header: "Natija", width: 22 }, { key: "lab", header: "Laboratoriya", width: 18 }],
        rows: list.filter((t) => t.status !== "void").map((t) => ({ ...t, product: pName(t.productId), status: STATUS[t.status][1] })) }] });
    } catch (e) { notify(e.message); }
  }
  const s = d?.summary;
  return <section className="sheet finance-module fl">
    <div className="fl-top"><div><h2>{tt("Sifat nazorati · beton sinovlari")}</h2><p>{tt("Har bir partiyadan olingan kub namunalarining 7 va 28 kunlik siqilish natijasi.")}</p></div>
      <div className="fl-acts">{d?.canEdit && <button className="btn primary" onClick={() => edit(null)}>{tt("+ Yangi sinov")}</button>}<button className="btn" disabled={!list.length} onClick={excel}>{tt("Excel")}</button></div></div>
    {res.error && <p className="err" role="alert">{res.error} <button className="btn sm" onClick={res.reload}>{tt("Qayta urinish")}</button></p>}
    {!d ? !res.error && <p role="status">{tt("Yuklanmoqda…")}</p> : <>
      <div className="fl-kpis">
        <Kpi label={tt("Sinovlar")} value={s.total} sub={tt("sanadan") + ": " + ddmm(from)} />
        <Kpi label={tt("Talabga javob beradi")} value={s.ok} tone="ok" />
        <Kpi label={tt("Yaroqsiz yoki xavf")} value={s.fail + s.risk} tone={s.fail + s.risk ? "bad" : ""} sub={s.risk ? tt("{n} ta 7 kunlikda past", { n: s.risk }) : ""} />
        <Kpi label={tt("28 kunlik kutilmoqda")} value={s.pending + s.late} tone={s.late ? "sig" : ""} sub={s.late ? tt("{n} tasi muddati o‘tgan", { n: s.late }) : ""} />
      </div>
      <div className="fl-filters"><label className="fl-inline">{tt("Sanadan")} <input type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} /></label>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={tt("Natija bo‘yicha")}><option value="">{tt("Hamma natijalar")}</option>{Object.entries(STATUS).map(([k, [, l]]) => <option key={k} value={k}>{tt(l)}</option>)}</select></div>
      {!list.length ? <p className="fl-note">{tt("Sinov yozuvi yo‘q.")}{d.canEdit ? " " + tt("«+ Yangi sinov» tugmasi bilan qo‘shing.") : ""}</p> : <div className="tbl-wrap"><table className="finance-table">
        <thead><tr><th>{tt("Quyilgan")}</th><th>{tt("Sinf")}</th><th>{tt("Partiya / mahsulot")}</th><th className="num">{tt("Talab")}</th><th className="num">{tt("7 kun")}</th><th className="num">{tt("28 kun")}</th><th>{tt("Natija")}</th><th /></tr></thead>
        <tbody>{list.map((t) => <tr key={t.id} className={t.status === "void" ? "is-void" : ""}>
          <td>{ddmm(t.castDate)}</td><td><b>{t.grade}</b></td><td>{[t.batch, pName(t.productId)].filter(Boolean).join(" · ") || "—"}<small className="muted"> · {tt("{n} ta namuna", { n: t.samples })}</small></td>
          <td className="num">{n1(t.requiredMpa)}</td><td className="num">{n1(t.r7Mpa)}</td><td className="num">{n1(t.r28Mpa)}{t.percent !== null && <small className="muted"> ({t.percent}%)</small>}</td>
          <td><Tag tone={STATUS[t.status][0]}>{tt(STATUS[t.status][1])}</Tag></td>
          <td>{d.canEdit && t.status !== "void" && <><button className="btn sm" onClick={() => edit(t)}>{tt("Natija")}</button> <button className="btn sm" onClick={() => voidTest(t)}>{tt("Bekor")}</button></>}</td></tr>)}</tbody>
      </table></div>}
      <p className="fl-note">{tt("Talab qilingan mustahkamlikni loyiha yoki laboratoriya xulosasidan oling. 7 kunlik natija talabning 60 foizidan past bo‘lsa, ogohlantirish chiqadi.")}</p>
    </>}
  </section>;
}
