"use client";
// Foyda va zarar: jadvalsiz. Kartochkalar, 6 oylik ustunli grafik (tushum va xarajat), tanlangan oy xarajatlari va zavod kartochkalari.
import { useState } from "react";
import { today } from "@/lib/calc";
import { exportSheets } from "@/lib/xlsx-export";
import { useT, show } from "@/lib/i18n";
import "./finance-extra.css";
import { Kpi, Tag, money, short, monthLabel, shiftMonth, useLoad } from "./FinanceUi";

const COSTS = [
  ["materials", "Material xaridi", "Shu oyda kirim qilingan material fakturalari"],
  ["payroll", "Oylik fondi", "Tasdiqlangan oylik bo‘yicha hisoblangan"],
  ["socialTax", "Ijtimoiy soliq", "Oylik fondidan"],
  ["expenses", "Boshqa xarajatlar", "Kassa va bankda «xarajat» turi bilan kiritilgan"],
];
const MONTHS_SHORT = ["Yan", "Fev", "Mar", "Apr", "May", "Iyun", "Iyul", "Avg", "Sen", "Okt", "Noy", "Dek"];

export default function FinanceProfit({ user, notify, company }) {
  const t = useT();
  const current = today().slice(0, 7);
  const [end, setEnd] = useState(current);
  const [month, setMonth] = useState(current);
  const hq = !user?.factoryId && (user?.factories?.length || 0) > 1;
  const [all, setAll] = useState(hq);
  const res = useLoad("/finance/profit?month=" + end + (all && hq ? "&all=1" : ""));
  const d = res.data;
  const rows = d ? (d.total || d.factories[0]?.months || []) : [];
  const cur = rows.find((x) => x.month === month) || rows.at(-1);
  const idx = rows.indexOf(cur);
  const prev = idx > 0 ? rows[idx - 1] : null;
  const change = cur && prev && prev.profit ? Math.round((cur.profit - prev.profit) / Math.abs(prev.profit) * 100) : null;
  const max = Math.max(1, ...rows.map((x) => Math.max(x.revenue, x.costs)));
  const costLines = cur ? COSTS.filter(([k]) => cur[k] !== null && cur[k] > 0) : [];
  const shift = (n) => { const e = shiftMonth(end, n); if (e > current) return; setEnd(e); setMonth(e); };

  async function excel() {
    try {
      const cols = [{ key: "name", header: "Ko‘rsatkich", width: 38 }, ...d.months.map((m) => ({ key: m, header: monthLabel(m), type: "money", width: 18 }))];
      const lines = [["revenue", "Tushum (QQSsiz)"], ...COSTS.map(([k, l]) => [k, l]), ["profit", "Sof foyda"]];
      const sheetFor = (title, list) => ({ name: title.slice(0, 28), title: "Foyda va zarar · " + title, columns: cols,
        rows: lines.map(([k, label]) => ({ name: label, ...Object.fromEntries(list.map((x) => [x.month, x[k] ?? null])) })) });
      const sheets = d.total ? [sheetFor("Jami", d.total), ...d.factories.map((f) => sheetFor(f.name, f.months))] : [sheetFor(d.factories[0]?.name || "Zavod", rows)];
      await exportSheets({ filename: "Foyda_va_zarar_" + end + ".xlsx", company, sheets });
    } catch (e) { notify?.(e.message); }
  }

  return <section className="sheet finance-module fl">
    <div className="fl-top"><div><h2>{t("Foyda va zarar")} · {t(monthLabel(cur?.month || month))}</h2><p>{t("Sotuvdan tushum, xarajatlar va oy oxiridagi sof natija.")}</p></div>
      <div className="fl-acts">
        {hq && <label className="fl-inline"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> {t("Barcha zavodlar")}</label>}
        <button className="btn" disabled={!d} onClick={excel}>Excel</button>
      </div></div>
    {res.error && <p className="err" role="alert">{res.error} <button className="btn sm" onClick={res.reload}>{t("Qayta urinish")}</button></p>}
    {!d || !cur ? !res.error && <p role="status">{t("Hisoblanmoqda…")}</p> : <>
      <div className="fl-kpis">
        <Kpi label={t("Tushum (QQSsiz)")} value={short(cur.revenue)} sub={cur.vat ? t("QQS") + ": " + short(cur.vat) : ""} tone="acc" />
        <Kpi label={t("Xarajatlar")} value={short(cur.costs)} sub={t("material, oylik, soliq, boshqa")} />
        <Kpi label={t(cur.profit < 0 ? "Zarar" : "Sof foyda")} value={short(cur.profit)} tone={cur.profit < 0 ? "bad" : "ok"} sub={change === null ? "" : (change >= 0 ? "▲ +" : "▼ ") + change + "% " + t("o‘tgan oyga nisbatan")} />
        <Kpi label={t("Rentabellik")} value={cur.margin === null ? "—" : cur.margin + "%"} sub={t("har 100 so‘m tushumdan qolgan foyda")} />
      </div>
      {!cur.complete && <p className="fl-warnline"><Tag tone="sig">{t("Diqqat")}</Tag> {t("{m} oyligi hali tasdiqlanmagan, shuning uchun oylik xarajati hisobga olinmadi. Natija haqiqatdan yuqori ko‘rinishi mumkin.", { m: t(monthLabel(cur.month)) })}</p>}

      <div className="pl-grid">
        <div className="pl-card">
          <div className="pl-card-head"><b>{t("6 oylik natija")}</b>
            <span className="pl-nav"><button className="btn sm" onClick={() => shift(-6)} aria-label={t("Oldingi oylar")}>‹</button><button className="btn sm" disabled={end >= current} onClick={() => shift(6)} aria-label={t("Keyingi oylar")}>›</button></span></div>
          <div className="pl-chart" role="group" aria-label={t("Oylar")}>
            {rows.map((x) => <button key={x.month} type="button" className="pl-col" aria-pressed={x.month === cur.month} onClick={() => setMonth(x.month)} title={t(monthLabel(x.month))}>
              <span className={"pl-val" + (x.profit < 0 ? " fl-neg" : "")}>{x.revenue || x.costs ? short(x.profit) : "—"}</span>
              <span className="pl-bars"><i className="pl-rev" style={{ height: (x.revenue / max) * 100 + "%" }} /><i className="pl-cost" style={{ height: (x.costs / max) * 100 + "%" }} /></span>
              <span className="pl-mon">{t(MONTHS_SHORT[+x.month.slice(5, 7) - 1])}{!x.complete && (x.revenue || x.costs) ? "*" : ""}</span>
            </button>)}
          </div>
          <div className="fl-legend"><span><i className="pl-rev" />{t("Tushum")}</span><span><i className="pl-cost" />{t("Xarajat")}</span><span className="muted">{t("Ustun ustida — sof foyda. Oyni bosing.")}</span></div>
        </div>

        <div className="pl-card">
          <div className="pl-card-head"><b>{t("Pul qayerga ketdi")} · {t(monthLabel(cur.month))}</b></div>
          {!costLines.length ? <p className="muted">{t("Bu oyda xarajat kiritilmagan.")}</p> :
            <ul className="pl-list">{costLines.map(([k, label, hint]) => { const share = cur.costs ? Math.round(cur[k] / cur.costs * 100) : 0; return <li key={k}>
              <div><b>{t(label)}</b><small>{t(hint)}</small></div>
              <strong>{short(cur[k])}<small>{share}%</small></strong>
              <span className="pl-share"><i style={{ width: share + "%" }} /></span></li>; })}</ul>}
          <div className="pl-total"><span>{t(cur.profit < 0 ? "Zarar" : "Sof foyda")}</span><strong className={cur.profit < 0 ? "fl-neg" : "fl-pos"}>{money(cur.profit)}</strong></div>
        </div>
      </div>

      {d.total && <><h3 className="pl-h3">{t("Zavodlar bo‘yicha")} · {t(monthLabel(cur.month))}</h3>
        <div className="pl-factories">{d.factories.map((f) => { const x = f.months.find((m) => m.month === cur.month) || f.months.at(-1); return <div className="pl-factory" key={f.id}>
          <b>{show(f.name)}</b>
          <strong className={x.profit < 0 ? "fl-neg" : "fl-pos"}>{short(x.profit)}</strong>
          <small>{t("Tushum")}: {short(x.revenue)} · {t("Xarajat")}: {short(x.costs)}{!x.complete && x.revenue ? " · " + t("oylik tasdiqlanmagan") : ""}</small>
          <span className="pl-share"><i className={x.profit < 0 ? "bad" : ""} style={{ width: Math.min(100, Math.abs(x.margin || 0)) + "%" }} /></span>
        </div>; })}</div></>}
      <p className="fl-note">{t("Tushum — shu oyda yozilgan sotuv fakturalari (QQSsiz). Material — shu oyda kirim qilingan fakturalar (ishlatilgani emas). * — oylik hali tasdiqlanmagan.")}</p>
    </>}
  </section>;
}
