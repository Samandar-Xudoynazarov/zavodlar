"use client";
// Moliya · Umumiy holat: qarzlar, «Diqqat talab qiladi» ro'yxati va hisob oylari.
import { useEffect, useState } from "react";
import Icon from "./Icon";
import { api } from "@/lib/api";
import { today } from "@/lib/calc";
import { useT } from "@/lib/i18n";
import { Kpi, Tag, short, monthLabel, shiftMonth, ddmm } from "./FinanceUi";
import { PICK_KEY } from "./FinanceCustomers";
import "./supplier-settlements.css";

const tasks = [
  ["finance-customers", "ord", "Mijozlar", "Qarz, faktura, to‘lov va akt sverka"],
  ["finance-settlements", "sup", "Ta’minotchilar", "Qarz, avans, material fakturalari va akt sverka"],
  ["acct", "acct", "Material hisoboti", "Oylik material hisoboti (Word)"],
  ["finance-payroll", "hr", "Oylik", "Vedomost, hisoblash, to‘lovlar va soliqlar"],
  ["finance-close", "day", "Oyni yopish", "Tekshiruv ro‘yxati va qulflash"],
];

export default function FinanceHome({ navigate }) {
  const t = useT();
  const month = today().slice(0, 7);
  const [d, setD] = useState(null), [failed, setFailed] = useState(""), [attempt, retry] = useState(0);
  useEffect(() => {
    let live = true;
    setFailed("");
    Promise.all([
      api("/finance/customers"),
      api("/finance/supplier-settlements"),
      api("/finance/periods"),
      api("/hr/months").then((ms) => (ms.some((m) => m.month === month) ? api("/hr/months/" + month) : null)).catch(() => null),
    ]).then(([customers, suppliers, periods, payroll]) => live && setD({ customers: customers.customers, suppliers, locks: periods.locks, payroll }))
      .catch((e) => live && setFailed(e.message));
    return () => { live = false; };
  }, [attempt, month]);
  const open = (key) => { try { sessionStorage.setItem(PICK_KEY, key); } catch {} navigate("finance-customers"); };

  if (failed) return <section className="sheet finance-module fl"><p className="err" role="alert">{t(failed)} <button className="btn" onClick={() => retry((i) => i + 1)}>{t("Qayta urinish")}</button></p></section>;
  if (!d) return <section className="sheet finance-module fl"><p role="status">{t("Yuklanmoqda…")}</p></section>;

  const C = d.customers, S = d.suppliers || [];
  const debtors = C.filter((c) => c.debt > 0), late = C.filter((c) => c.overdue > 0);
  const supDebt = S.reduce((s, x) => s + Math.max(0, x.debt), 0), supLate = S.filter((x) => x.overdue > 0);
  const payDue = (d.payroll?.payroll || []).reduce((s, r) => s + Math.max(0, r.balance), 0), payPeople = (d.payroll?.payroll || []).filter((r) => r.balance > 0).length;
  const locked = new Set(d.locks.filter((l) => !l.reopenedAt).map((l) => l.month));
  const alerts = [
    ...late.slice(0, 4).map((c) => ["bad", "!", `${c.name}: muddati o‘tgan qarz ${short(c.overdue)}`, `${c.overdueDays} kun kechikkan · jami qarz ${short(c.debt)}`, () => open(c.key)]),
    ...supLate.slice(0, 2).map((x) => ["bad", "₮", `Ta’minotchi ${x.name}: to‘lov kechikmoqda`, `Muddati o‘tgan ${short(x.overdue)}`, () => navigate("finance-settlements")]),
    ...C.filter((c) => c.notInvoiced > 0).slice(0, 3).map((c) => ["sig", "F", `${c.name}: nakladnoy bor, faktura yo‘q`, `Fakturasiz jo‘natma ${short(c.notInvoiced)}`, () => open(c.key)]),
    ...C.filter((c) => c.unpricedLines > 0).slice(0, 2).map((c) => ["acc", "%", `${c.name}: ${c.unpricedLines} ta mahsulotda sotuv narxi yo‘q`, "Tannarx bilan hisoblanmaydi — narxni buyurtmada kiriting", () => open(c.key)]),
  ];
  const months = Array.from({ length: 4 }, (_, i) => shiftMonth(month, i - 3));
  return <section className="sheet finance-module fl">
    <div className="fl-top"><div><h2>{t("Umumiy holat")}</h2><p>{monthLabel(month)} · bugun {ddmm(today())}</p></div>
      <div className="fl-acts"><button className="btn" onClick={() => navigate("finance-settlements")}>{t("Ta’minotchilar")}</button><button className="btn primary" onClick={() => navigate("finance-customers")}>{t("Mijozlar")}</button></div></div>
    <div className="fl-kpis">
      <Kpi tone="sig" label="Mijozlar qarzi" value={short(debtors.reduce((s, c) => s + c.debt, 0))} sub={debtors.length + " ta mijoz"} />
      <Kpi tone="bad" label="Shundan muddati o‘tgan" value={short(late.reduce((s, c) => s + c.overdue, 0))} sub={late.length + " ta mijoz"} />
      <Kpi label="Ta’minotchilarga qarz" value={short(supDebt)} sub={supLate.length ? supLate.length + " tasi kechikkan" : "kechikish yo‘q"} />
      <Kpi label="Oylik qoldig‘i" value={d.payroll ? short(payDue) : "—"} sub={d.payroll ? monthLabel(month) + ", " + payPeople + " xodim" : "oy ochilmagan"} />
    </div>
    <div className="fl-grid2">
      <div className="fl-card"><h3>Diqqat talab qiladi</h3>
        {alerts.length ? alerts.map(([tone, ico, title, sub, go], i) => <div className="fl-alert" key={i}><span className={"fl-ico fl-tag " + tone} aria-hidden="true">{ico}</span><div><b>{title}</b><small>{sub}</small></div><button className="btn sm" onClick={go}>Ochish</button></div>)
          : <p className="fl-note">Hammasi joyida: muddati o‘tgan qarz, fakturasiz nakladnoy yoki narxsiz mahsulot yo‘q.</p>}</div>
      <div className="fl-card"><h3>Hisob oylari</h3>
        <div className="fl-months">{months.map((m) => <button key={m} className={"fl-month" + (locked.has(m) ? "" : " open")} onClick={() => navigate("finance-close")}><b>{monthLabel(m)}</b><Tag tone={locked.has(m) ? "mut" : "acc"}>{locked.has(m) ? "Yopilgan" : "Ochiq"}</Tag></button>)}</div>
        <p className="fl-note" style={{ marginTop: 12 }}>Yopilgan oyga yangi faktura, to‘lov yoki nakladnoy kiritib bo‘lmaydi. To‘g‘rilash kerak bo‘lsa, rahbar oyni sababini yozib ochadi va bu jurnalga tushadi.</p>
        <button className="btn" style={{ marginTop: 12 }} onClick={() => navigate("finance-close")}>Oyni yopishga tayyorlash</button></div>
    </div>
    <div className="fin-actions">{tasks.map(([key, icon, label, desc]) => <button key={key} onClick={() => navigate(key)}>
      <span className="fin-action-icon"><Icon name={icon} size={22} /></span>
      <span><strong>{t(label)}</strong><small>{t(desc)}</small></span><Icon name="chevR" size={16} />
    </button>)}</div>
  </section>;
}
