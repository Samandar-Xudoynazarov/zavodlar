"use client";
// Kassa va bank: hisoblar qoldig'i, kunlik kirim-chiqim, yangi yozuv, bekor qilish va Excel.
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { today } from "@/lib/calc";
import { exportSheets } from "@/lib/xlsx-export";
import { useT, show } from "@/lib/i18n";
import "./finance-extra.css";
import { Kpi, Tag, money, short, ddmm, monthLabel, monthEndDate, useLoad } from "./FinanceUi";

export const CATEGORY = { mijoz: "Mijozdan to‘lov", taminotchi: "Ta’minotchiga to‘lov", oylik: "Oylik / avans", soliq: "Soliq", xarajat: "Xarajat (elektr, yoqilg‘i, ijara…)", otkazma: "Hisoblar orasida o‘tkazma", boshqa: "Boshqa" };
const rid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (c ^ (Math.random() * 16) >> (c / 4)).toString(16)));

export default function FinanceCash({ notify, openForm, company }) {
  const t = useT();
  const [month, setMonth] = useState(today().slice(0, 7));
  const [account, setAccount] = useState("");
  const [query, setQuery] = useState("");
  const res = useLoad("/finance/cash?from=" + month + "-01&to=" + monthEndDate(month));
  const d = res.data;
  const accounts = d?.accounts || [];
  const active = accounts.filter((a) => !a.archived);
  const entries = useMemo(() => (d?.entries || []).filter((e) => (!account || e.accountId === account) && (!query.trim() || `${e.counterparty} ${e.note} ${e.docNumber} ${CATEGORY[e.category]}`.toLowerCase().includes(query.trim().toLowerCase()))), [d, account, query]);
  const live = entries.filter((e) => !e.voidedAt);
  const inSum = live.filter((e) => e.direction === "in").reduce((s, e) => s + +e.amount, 0);
  const outSum = live.filter((e) => e.direction === "out").reduce((s, e) => s + +e.amount, 0);
  const accName = (id) => accounts.find((a) => a.id === id)?.name || "—";
  const allTotal = active.reduce((s, a) => s + a.balance, 0);
  const total = (account ? accounts.filter((a) => a.id === account) : active).reduce((s, a) => s + a.balance, 0);

  function addAccount() {
    openForm({ title: "Yangi kassa yoki bank hisobi", fields: [
      { name: "name", label: "Nomi (masalan: Asosiy kassa, Kapitalbank)", req: true, wide: true },
      { name: "kind", label: "Turi", type: "select", options: [["naqd", "Naqd kassa"], ["bank", "Bank hisob raqami"]] },
      { name: "openingDate", label: "Qoldiq sanasi", type: "date", req: true, def: month + "-01" },
      { name: "openingBalance", label: "Shu sanadagi qoldiq", type: "number", step: "0.01", unit: "so‘m", def: 0 },
    ], submitLabel: "Qo‘shish", onSubmit: async (v) => { await api("/finance/cash/accounts", { method: "POST", body: v }); res.reload(); notify("Hisob qo‘shildi"); } });
  }
  function addEntry(direction) {
    if (!active.length) return addAccount();
    openForm({ title: direction === "in" ? "Kirim (pul keldi)" : "Chiqim (pul ketdi)", fields: [
      { name: "accountId", label: "Kassa / bank", type: "select", raw: true, options: active.map((a) => [a.id, a.name]), def: account || active[0].id },
      { name: "date", label: "Sana", type: "date", req: true, def: today().startsWith(month) ? today() : month + "-01" },
      { name: "amount", label: "Summa", type: "number", step: "0.01", min: "0.01", req: true, unit: "so‘m" },
      { name: "category", label: "Turi", type: "select", options: Object.entries(CATEGORY).filter(([k]) => direction === "in" ? !["taminotchi", "oylik", "xarajat", "soliq"].includes(k) : k !== "mijoz"), def: direction === "in" ? "mijoz" : "xarajat" },
      { name: "counterparty", label: direction === "in" ? "Kimdan" : "Kimga", wide: true },
      { name: "docNumber", label: "Hujjat raqami (to‘lov topshiriqnomasi, chek)" },
      { name: "note", label: "Izoh", wide: true },
    ], submitLabel: "Saqlash", onSubmit: async (v) => { await api("/finance/cash/entries", { method: "POST", body: { ...v, direction, requestId: rid() } }); res.reload(); notify("Saqlandi"); } });
  }
  function voidEntry(e) {
    openForm({ title: "Yozuvni bekor qilish", description: `${ddmm(e.date)} · ${money(e.amount)} so‘m · ${e.counterparty || CATEGORY[e.category]}. Yozuv o‘chmaydi, «bekor qilingan» bo‘lib qoladi.`,
      fields: [{ name: "reason", label: "Sababi", req: true, wide: true }], submitLabel: "Bekor qilish",
      onSubmit: async (v) => { await api("/finance/cash/entries/" + e.id + "/void", { method: "POST", body: v }); res.reload(); notify("Bekor qilindi"); } });
  }
  function archive(a) {
    openForm({ title: (a.archived ? "Qayta ochish: " : "Arxivga olish: ") + a.name, description: a.archived ? "Hisobga yana yozuv kiritish mumkin bo‘ladi." : "Arxivdagi hisobga yangi yozuv kiritilmaydi, tarixi saqlanadi.",
      fields: [], submitLabel: a.archived ? "Qayta ochish" : "Arxivga olish",
      onSubmit: async () => { await api("/finance/cash/accounts/" + a.id, { method: "PUT", body: { archived: !a.archived } }); res.reload(); } });
  }
  async function excel() {
    try {
      await exportSheets({ filename: "Kassa_" + month + ".xlsx", company, sheets: [{ name: "Kassa va bank", title: "Kassa va bank · " + monthLabel(month) + (account ? " · " + accName(account) : ""),
        columns: [{ key: "date", header: "Sana", width: 12 }, { key: "account", header: "Hisob", width: 20 }, { key: "category", header: "Turi", width: 24 }, { key: "counterparty", header: "Kimdan / kimga", width: 28 }, { key: "docNumber", header: "Hujjat", width: 14 }, { key: "in", header: "Kirim", type: "money", total: "sum", width: 16 }, { key: "out", header: "Chiqim", type: "money", total: "sum", width: 16 }, { key: "note", header: "Izoh", width: 30 }],
        rows: live.slice().reverse().map((e) => ({ date: e.date, account: accName(e.accountId), category: CATEGORY[e.category], counterparty: e.counterparty, docNumber: e.docNumber, in: e.direction === "in" ? +e.amount : null, out: e.direction === "out" ? +e.amount : null, note: e.note })) }] });
    } catch (e) { notify(e.message); }
  }

  return <section className="sheet finance-module fl">
    <div className="fl-top"><div><h2>{t("Kassa va bank")} · {t(monthLabel(month))}</h2><p>{t("Naqd pul va bank hisobidagi har bir kirim-chiqim, kun oxiridagi qoldiq.")}</p></div>
      <div className="fl-acts"><button className="btn in" onClick={() => addEntry("in")}>{t("+ Kirim")}</button><button className="btn out" onClick={() => addEntry("out")}>{t("− Chiqim")}</button><button className="btn" onClick={addAccount}>{t("Hisob qo‘shish")}</button><button className="btn" disabled={!live.length} onClick={excel}>{t("Excel")}</button></div></div>
    {res.error && <p className="err" role="alert">{res.error} <button className="btn sm" onClick={res.reload}>{t("Qayta urinish")}</button></p>}
    {!d ? !res.error && <p role="status">{t("Yuklanmoqda…")}</p> : <>
      {!accounts.length ? <div className="fl-empty"><p>{t("Hali kassa yoki bank hisobi yo‘q. Avval hisob qo‘shing: masalan «Asosiy kassa» (naqd) va bankdagi hisob raqamingiz.")}</p><button className="btn primary" onClick={addAccount}>{t("Hisob qo‘shish")}</button></div> : <>
        <div className="fl-accounts" role="group" aria-label={t("Hisoblar")}>
          <button type="button" className="fl-account" aria-pressed={!account} onClick={() => setAccount("")}><small>{t("Hammasi · oy oxiridagi qoldiq")}</small><strong className={allTotal < 0 ? "fl-neg" : ""}>{money(allTotal)}</strong></button>
          {accounts.map((a) => <button type="button" key={a.id} className="fl-account" aria-pressed={account === a.id} onClick={() => setAccount(a.id)}>
            <small>{t(a.kind === "naqd" ? "Naqd kassa" : "Bank")}{a.archived && " · " + t("arxivda")}</small><b>{show(a.name)}</b><strong className={a.balance < 0 ? "fl-neg" : ""}>{money(a.balance)}</strong></button>)}
        </div>
        <div className="fl-kpis">
          <Kpi label={t("Oy davomida kirim")} value={short(inSum)} tone="ok" />
          <Kpi label={t("Oy davomida chiqim")} value={short(outSum)} tone="sig" />
          <Kpi label={t("Farq")} value={short(inSum - outSum)} tone={inSum - outSum < 0 ? "bad" : ""} />
          <Kpi label={t("Qoldiq (oy oxiri)")} value={short(total)} sub={account ? show(accName(account)) : t("barcha ochiq hisoblar")} />
        </div>
        <div className="fl-filters"><input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label={t("Oy")} /><input type="search" placeholder={t("Qidirish: kim, izoh, hujjat…")} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t("Qidirish")} />
          {account && <button className="btn sm" onClick={() => archive(accounts.find((a) => a.id === account))}>{t(accounts.find((a) => a.id === account)?.archived ? "Hisobni qayta ochish" : "Hisobni arxivga olish")}</button>}</div>
        {!entries.length ? <p className="fl-note">{t("Bu oyda yozuv yo‘q.")}</p> : <div className="tbl-wrap"><table className="finance-table">
          <thead><tr><th>{t("Sana")}</th><th>{t("Hisob")}</th><th>{t("Turi")}</th><th>{t("Kimdan / kimga")}</th><th className="num">{t("Kirim")}</th><th className="num">{t("Chiqim")}</th><th>{t("Izoh")}</th><th /></tr></thead>
          <tbody>{entries.map((e) => <tr key={e.id} className={e.voidedAt ? "is-void" : ""}>
            <td>{ddmm(e.date)}</td><td>{show(accName(e.accountId))}</td><td>{t(CATEGORY[e.category])}</td><td>{show(e.counterparty)}{e.docNumber && <small className="muted"> · №{e.docNumber}</small>}</td>
            <td className="num fl-pos">{e.direction === "in" ? money(e.amount) : ""}</td><td className="num fl-neg">{e.direction === "out" ? money(e.amount) : ""}</td>
            <td>{e.voidedAt ? <Tag tone="mut">{t("Bekor")}: {show(e.voidReason)}</Tag> : show(e.note)}</td>
            <td>{!e.voidedAt && <button className="btn sm" onClick={() => voidEntry(e)}>{t("Bekor qilish")}</button>}</td></tr>)}</tbody>
        </table></div>}
      </>}
      <p className="fl-note">{t("Yopilgan oyga yozuv kiritib bo‘lmaydi. «Xarajat» turidagi chiqimlar «Foyda va zarar» hisobotiga kiradi. Mijoz va ta’minotchi to‘lovlarini qarzga bog‘lash uchun ularni «Mijozlar» va «Ta’minotchilar» bo‘limida ham kiriting.")}</p>
    </>}
  </section>;
}
