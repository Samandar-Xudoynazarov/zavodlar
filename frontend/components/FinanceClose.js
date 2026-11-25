"use client";
// Oyni yopish: tekshiruv ro'yxati, qulflash va (rahbar uchun) sababi bilan qayta ochish.
import { useState } from "react";
import { api } from "@/lib/api";
import { today } from "@/lib/calc";
import { Tag, monthLabel, shiftMonth, useLoad } from "./FinanceUi";

const ICON = { ok: ["ok", "✓"], warn: ["sig", "?"], bad: ["bad", "!"] };

export default function FinanceClose({ user, notify, openForm, navigate }) {
  const current = today().slice(0, 7);
  const periods = useLoad("/finance/periods");
  const locked = new Set((periods.data?.locks || []).filter((l) => !l.reopenedAt).map((l) => l.month));
  const firstOpen = (() => { let m = shiftMonth(current, -1); for (let i = 0; i < 24 && locked.has(m); i++) m = shiftMonth(m, 1); return m > current ? current : m; })();
  const [month, setMonth] = useState("");
  const m = month || firstOpen;
  const check = useLoad(periods.data ? "/finance/periods/" + m + "/checklist" : null);
  const isLocked = locked.has(m);
  const canReopen = ["admin", "rahbar"].includes(user?.role);
  const reload = () => { periods.reload(); check.reload(); };
  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(current, i - 5));

  function lock() {
    const bad = check.data?.checks.filter((c) => c.status !== "ok") || [];
    openForm({ title: "Oyni yopish · " + monthLabel(m), description: (bad.length ? `Diqqat: ${bad.length} ta tekshiruv yashil emas. ` : "") + "Yopilgan oyga faktura, to‘lov, nakladnoy va material fakturasini kiritib yoki bekor qilib bo‘lmaydi. Kerak bo‘lsa, rahbar sababini yozib qayta ochadi.",
      fields: [{ name: "note", label: "Izoh (masalan: hisobot topshirildi)", wide: true }], submitLabel: "Oyni yopish",
      onSubmit: async (v) => { await api("/finance/periods/" + m + "/lock", { method: "POST", body: v }); reload(); notify(monthLabel(m) + " yopildi"); } });
  }
  function reopen() {
    openForm({ title: "Oyni qayta ochish · " + monthLabel(m), description: "Sabab jurnalga yoziladi. To‘g‘rilab bo‘lgach, oyni yana yoping.",
      fields: [{ name: "reason", label: "Qayta ochish sababi", req: true, wide: true }], submitLabel: "Qayta ochish",
      onSubmit: async (v) => { await api("/finance/periods/" + m + "/reopen", { method: "POST", body: v }); reload(); notify(monthLabel(m) + " qayta ochildi"); } });
  }
  const lockInfo = check.data?.lock;
  return <section className="sheet finance-module fl">
    <div className="fl-top"><div><h2>Oyni yopish · {monthLabel(m)}</h2><p>Hammasi yashil bo‘lsa, oy qulflanadi va hisobotlar shu holatda saqlanadi.</p></div>
      <div className="fl-acts">{isLocked ? <><Tag tone="mut">Yopilgan</Tag>{canReopen && <button className="btn" onClick={reopen}>Qayta ochish</button>}</>
        : <button className="btn primary" disabled={!check.data} onClick={lock}>Oyni yopish</button>}</div></div>
    <div className="fl-months" role="group" aria-label="Hisob oylari">{months.map((x) => <button key={x} className={"fl-month" + (x === m ? " open" : "")} aria-pressed={x === m} onClick={() => setMonth(x)}>
      <b>{monthLabel(x)}</b><Tag tone={locked.has(x) ? "mut" : "acc"}>{locked.has(x) ? "Yopilgan" : "Ochiq"}</Tag></button>)}</div>
    {(periods.error || check.error) && <p className="err" role="alert">{periods.error || check.error} <button className="btn sm" onClick={reload}>Qayta urinish</button></p>}
    {lockInfo && <p className="fl-note">{lockInfo.reopenedAt ? `Oxirgi marta ${new Date(lockInfo.reopenedAt).toLocaleString("ru-RU")} da ${lockInfo.reopenedBy?.name || ""} qayta ochgan. Sabab: ${lockInfo.reopenReason}` : `${new Date(lockInfo.lockedAt).toLocaleString("ru-RU")} da ${lockInfo.lockedBy?.name || ""} yopgan.${lockInfo.note ? " " + lockInfo.note : ""}`}</p>}
    {!check.data ? !check.error && <p role="status">Tekshirilmoqda…</p> :
      <div className="fl-checks">{check.data.checks.map((x) => <div className="fl-check" key={x.key}>
        <span className={"fl-ico fl-tag " + ICON[x.status][0]} aria-hidden="true">{ICON[x.status][1]}</span>
        <div><b>{x.title}</b>{x.detail && <><br /><small>{x.detail}</small></>}</div>
        {x.status !== "ok" && x.go && <button className="btn sm" onClick={() => navigate?.(x.go)}>Tuzatish</button>}</div>)}</div>}
    <p className="fl-note">Yopishni admin, rahbar yoki buxgalter qiladi. Qayta ochish faqat admin va rahbarda, sababi bilan.</p>
  </section>;
}
