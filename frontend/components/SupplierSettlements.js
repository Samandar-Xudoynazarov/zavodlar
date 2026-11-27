"use client";
// Ta'minotchilar: mijozlar bo'limi kabi. Chapda ro'yxat, o'ngda ta'minotchi kartasi:
// umumiy qoldiq, shartnomalar (har biri bo'yicha qarz), hujjatlar tarixi, fakturalar, to'lovlar, materiallar, akt sverka.
import { show, useT } from "@/lib/i18n";
import { matches } from "@/lib/script";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { today, fmtDate, fmtN } from "@/lib/calc";
import { openPdf } from "@/lib/finance-files";
import { exportSheets } from "@/lib/xlsx-export";
import ContractReview from "./ContractReview";
import SupplierMaterials from "./SupplierMaterials";
import { money, short, Tag, Pipe, Legend, ddmm } from "./FinanceUi";
import "./supplier-settlements.css";

const base = "/finance/supplier-settlements";
const kinds = { invoice: "Faktura", payment: "To‘lov", opening_debt: "Boshlang‘ich qarz", opening_advance: "Boshlang‘ich avans" };
const DOT = { invoice: ["invoice", "F"], payment: ["receipt", "₮"], opening_debt: ["opening", "Q"], opening_advance: ["opening", "Q"] };
const STATUS = { overdue: ["bad", "Muddati o‘tgan"], waiting: ["sig", "Qarzimiz bor"], advance: ["acc", "Avans berilgan"], closed: ["ok", "Yopilgan"] };
const isDebt = (row) => row.kind === "invoice" || row.kind === "opening_debt";
const signed = (row) => (isDebt(row) ? row.amount : -row.amount);
const sum = (items, fn) => items.reduce((n, item) => n + Math.round(fn(item) * 100), 0) / 100;
const display = (n) => fmtN(n, 2);
const rowName = (row, t) => [t(kinds[row.kind]), row.number].filter(Boolean).join(" № ");
const statusOf = (p) => (p.overdue > 0 ? "overdue" : p.debt - p.advance > 0.004 ? "waiting" : p.advance - p.debt > 0.004 ? "advance" : "closed");
const contractLabel = (c) => "№ " + c.number + (c.date ? " · " + fmtDate(c.date) : "");
const inContract = (row, filter) => !filter || (filter === "none" ? !row.contractId : row.contractId === filter);

function Statement({ ledger, contracts, company, supplier, notify, t }) {
  // Istalgan davr: oy, chorak, yil yoki o'zingiz tanlagan sanalar; hammasi yoki bitta shartnoma bo'yicha
  const [from, setFrom] = useState(() => today().slice(0, 7) + "-01"), [to, setTo] = useState(() => today());
  const [contract, setContract] = useState("");
  const [busy, setBusy] = useState(false);
  const y = today().slice(0, 4), m = +today().slice(5, 7), q = String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, "0");
  const presets = [["Bu oy", today().slice(0, 7) + "-01", today()], ["Shu chorak", y + "-" + q + "-01", today()], ["Shu yil", y + "-01-01", today()], ["O‘tgan yil", (+y - 1) + "-01-01", (+y - 1) + "-12-31"]];
  const rows = ledger.filter((r) => inContract(r, contract));
  const chosen = contracts.find((c) => c.id === contract);
  const beginning = rows.find((r) => r.kind.startsWith("opening"));
  const tooEarly = !from || !to || from > to || (beginning && to < beginning.date);
  const start = beginning && beginning.date > from ? beginning.date : from;
  const initial = sum(rows.filter((r) => r.kind.startsWith("opening") || r.date < start), signed);
  const entries = rows.filter((r) => !r.kind.startsWith("opening") && r.date >= start && r.date <= to);
  const closing = (Math.round(sum(entries, signed) * 100) + Math.round(initial * 100)) / 100;
  const balance = (n) => display(Math.abs(n)) + " " + t("so‘m") + (n ? " · " + t(n > 0 ? "Qarz" : "Avans") : "");
  const scope = chosen ? " · " + t("Shartnoma") + " " + contractLabel(chosen) : contract === "none" ? " · " + t("Shartnomasiz hujjatlar") : "";
  async function download() {
    setBusy(true);
    try {
      await exportSheets({ filename: "Solishtirma_" + from + "_" + to + ".xlsx", company, sheets: [{
        name: t("Hisob-kitob"), title: t("Solishtirma dalolatnoma"), subtitle: supplier + scope + " · " + fmtDate(start) + " – " + fmtDate(to),
        columns: [{ key: "date", header: t("Sana"), width: 16 }, { key: "doc", header: t("Hujjat"), width: 36 },
          { key: "bill", header: t("Qarz oshishi"), width: 22, type: "num" }, { key: "pay", header: t("Qarz kamayishi"), width: 22, type: "num" }],
        rows: [{ date: start, doc: t("Boshlang‘ich qoldiq"), bill: Math.max(initial, 0), pay: Math.max(-initial, 0) },
          ...entries.map((r) => ({ date: r.date, doc: rowName(r, t), bill: isDebt(r) ? r.amount : null, pay: isDebt(r) ? null : r.amount })),
          { doc: t("Yakuniy qoldiq"), bill: Math.max(closing, 0), pay: Math.max(-closing, 0), _style: "bold" }],
        notes: [company + " ____________________", supplier + " ____________________"],
      }] });
    } catch (e) { notify(e.message); } finally { setBusy(false); }
  }
  return <section className="settle-statement"><div className="finance-toolbar">{presets.map(([l, a, b]) => <button key={l} className="btn sm" aria-pressed={from === a && to === b} onClick={() => { setFrom(a); setTo(b); }}>{t(l)}</button>)}
    <label>{t("Boshlanishi")}<input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} /></label>
    <label>{t("Oxiri")}<input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} /></label>
    {contracts.length > 0 && <label>{t("Shartnoma")}<select value={contract} onChange={(e) => setContract(e.target.value)}><option value="">{t("Hammasi")}</option>{contracts.map((c) => <option key={c.id} value={c.id}>{contractLabel(c)}</option>)}<option value="none">{t("Shartnomasiz")}</option></select></label>}
    <button className="btn" disabled={busy || tooEarly} onClick={download}>{t("Dalolatnomani Excelga yuklash")}</button></div>
    {tooEarly ? <p className="empty">{t("Bu davr uchun boshlang‘ich qoldiq kiritilmagan yoki sanalar noto‘g‘ri.")}</p> : <>
      <p>{fmtDate(start)} · {t("Boshlang‘ich qoldiq")} <strong>{balance(initial)}</strong></p>
      <div className="tbl-wrap"><table><thead><tr>{["Sana", "Hujjat", "Qarz oshishi", "Qarz kamayishi"].map((k) => <th key={k}>{t(k)}</th>)}</tr></thead>
        <tbody>{entries.map((r) => <tr key={r.id}><td>{fmtDate(r.date)}</td><td>{rowName(r, t)}</td>
          <td className="n">{isDebt(r) ? display(r.amount) : "—"}</td><td className="n">{!isDebt(r) ? display(r.amount) : "—"}</td></tr>)}</tbody></table></div>
      {!entries.length && <p>{t("Bu davrda harakat yo‘q.")}</p>}<p>{t("Yakuniy qoldiq")} <strong>{balance(closing)}</strong></p></>}
  </section>;
}

/** Shartnoma kartochkasi: summa, fakturalangan, to'langan, qarz, yetkazilmagan qismi */
function ContractCard({ c, active, onPick, onPay, onPdf, t }) {
  return <div className={"fl-ord settle-contract" + (active ? " is-active" : "")}>
    <div className="l"><button className="linkbtn settle-contract-title" onClick={onPick} aria-pressed={active}>
      <b>{c.id ? t("Shartnoma") + " " + contractLabel(c) : t("Shartnomasiz hujjatlar")}</b></button>
      <span className="fl-money">{c.id ? money(c.total) : ""}</span></div>
    {c.id ? <Pipe total={c.total} done={c.invoiced} paid={c.paid} /> : null}
    <div className="l sub"><span>{t("Faktura")} {short(c.invoiced)}</span><span>{t("To‘landi")} {short(c.paid)}</span>
      <span style={{ fontWeight: 700, color: c.debt > 0 ? "var(--signal)" : c.debt < 0 ? "var(--accent)" : "var(--ok)" }}>{c.debt < 0 ? t("Avans") : t("Qarz")} {short(Math.abs(c.debt))}</span>
      {c.id ? <span>{t("Faktura qilinmagan")} {short(c.left)}</span> : c.opening ? <span>{t("Boshlang‘ich qoldiq")} {short(c.opening)}</span> : null}</div>
    {c.id && <div className="l sub"><span>{c.invoices} {t("faktura")}</span><span className="fl-acts">
      <button className="btn sm" onClick={onPay}>+ {t("To‘lov")}</button>{c.name && <button className="btn sm" onClick={onPdf}>PDF</button>}</span></div>}
  </div>;
}

export default function SupplierSettlements({ company, notify, openForm, factoryData }) {
  const t = useT();
  const [review, setReview] = useState(false);
  const [party, setParty] = useState(""), [query, setQuery] = useState(""), [filter, setFilter] = useState("all");
  const [view, setView] = useState("hist"), [contract, setContract] = useState("");
  const [list, setList] = useState(null), [detail, setDetail] = useState(null), [error, setError] = useState(""), [revision, reload] = useState(0), [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    setError("");
    api(base).then((v) => { if (live) setList(v); }).catch((e) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [revision]);
  const all = (list || []).map((p) => ({ ...p, status: statusOf(p) }));
  const visible = all.filter((p) => (filter === "all" || p.status === filter) && matches([p.name, p.inn], query));
  const current = party || visible[0]?.id || "";
  useEffect(() => {
    let live = true;
    if (!current) { setDetail(null); return; }
    api(base + "/" + current).then((v) => { if (live) setDetail({ id: current, revision, value: v }); }).catch((e) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [current, revision]);
  const data = detail?.id === current ? detail.value : null;
  const ledger = data?.ledger || [], allocations = data?.allocations || [];
  const summary = data?.summary;
  const contracts = summary?.contracts || [];
  const shown = ledger.filter((r) => inContract(r, contract));
  const debts = shown.filter(isDebt), credits = shown.filter((r) => !isDebt(r));
  const unpaidAll = ledger.filter((r) => isDebt(r) && r.remaining > 0);
  const refresh = () => reload((x) => x + 1);
  const route = base + "/" + current;
  const contractOf = (id) => contracts.find((c) => c.id === id);
  function select(id) { setParty(id); setContract(""); setView("hist"); setError(""); }

  function form(title, path, fields, values = {}, fixed = {}, description = "", after) {
    const requestId = crypto.randomUUID();
    openForm({ title, fields, values, description, submitLabel: "Saqlash", onSubmit: async (v) => {
      const extra = {};
      if (v.contractLine != null) {
        const [cid, mid] = String(v.contractLine).split("|");
        extra.contractId = cid || null;
        extra.materialId = mid || null;
        delete v.contractLine;
      }
      const saved = await api(path, { method: "POST", body: { ...v, ...fixed, ...extra, requestId } });
      after?.(saved);
      refresh(); notify(t("Saqlandi"));
    } });
  }
  const amountField = { name: "amount", label: "Summa", type: "number", min: 0.01, step: 0.01, unit: "so‘m", req: true };
  const dateField = { name: "date", label: "Sana", type: "date", req: true };
  const debtOptions = (cid) => unpaidAll.filter((r) => !cid || r.contractId === cid).map((r) => [r.id, rowName(r, t) + " · " + display(r.remaining) + (r.contractId ? " · " + t("Shartnoma") + " № " + (contractOf(r.contractId)?.number || "") : "")]);
  const contractOptions = (withMaterials) => [["", t("Shartnomasiz (umumiy to‘lov)")], ...contracts.flatMap((c) => [[c.id + "|", t("Shartnoma") + " " + contractLabel(c)],
    ...(withMaterials ? (c.items || []).filter((l) => l.materialId).map((l) => [c.id + "|" + l.materialId, "   № " + c.number + " · " + l.name + " · " + display(l.price) + " / " + l.unit + " (" + t("material avansi") + ")"]) : [])])];
  function payment(cid = "") {
    form("To‘lov kiritish", route + "/entries", [dateField, { name: "number", label: "To‘lov hujjati raqami", req: true }, amountField,
      { name: "contractLine", label: "Qaysi shartnoma bo‘yicha?", type: "select", raw: true, wide: true, options: contractOptions(true) },
      { name: "targetId", label: "Qaysi hujjat uchun?", type: "select", raw: true, wide: true, options: [["", t("Avans sifatida saqlash")], ...debtOptions(cid)] }],
      { date: today(), contractLine: cid ? cid + "|" : "" }, { kind: "payment" });
  }
  function opening() {
    form("Boshlang‘ich qoldiq", route + "/entries", [dateField, { name: "kind", label: "Qoldiq turi", type: "select", options: [["opening_debt", "Boshlang‘ich qarz"], ["opening_advance", "Boshlang‘ich avans"]] }, { ...amountField, min: 0 }],
      { date: today() }, {}, "Shu kun boshidagi qoldiqni kiriting. Oldingi fakturalar ushbu summaga kiradi.");
  }
  function match(credit) {
    const options = debtOptions(credit.contractId || "");
    if (!options.length) return notify(t("Bu shartnomada to‘lanmagan faktura yo‘q"));
    form("Avansni bog‘lash", route + "/allocations", [{ name: "targetId", label: "Hujjat", type: "select", req: true, raw: true, wide: true, options }, amountField],
      { amount: Math.min(credit.remaining, unpaidAll.find((r) => r.id === options[0][0])?.remaining || credit.remaining) }, { sourceId: credit.id });
  }
  function cancel(kind, id) {
    form(kind === "allocation" ? "Bog‘lanishni ajratish" : "Yozuvni bekor qilish", route + "/cancel", [{ name: "reason", label: "Sabab", req: true, wide: true }], {}, { kind, id });
  }
  function assign(row) {
    form(rowName(row, t) + " · " + t("shartnoma"), route + "/contract", [{ name: "contractId", label: "Shartnoma", type: "select", raw: true, wide: true, options: [["", t("Shartnomasiz")], ...contracts.map((c) => [c.id, contractLabel(c)])] }],
      { contractId: row.contractId || "" }, { kind: row.kind === "invoice" ? "invoice" : "payment", id: row.id },
      "Hujjat summasi o‘zgarmaydi, faqat qaysi shartnoma hisobiga yozilishi tanlanadi.");
  }
  function dueDate(r) {
    form("To‘lov muddati", route + "/due-date", [{ name: "dueDate", label: "To‘lov muddati", type: "date", req: true, min: r.date }], { dueDate: r.dueDate || r.date }, { invoiceId: r.id });
  }
  function profile() {
    form("Ta’minotchi ma’lumotlari", route + "/profile", [{ name: "name", label: "Ta’minotchi nomi", req: true, wide: true }, { name: "inn", label: "STIR (9 ta raqam)" }],
      { name: data.supplier.name, inn: data.supplier.inn || "" });
  }
  function mergeInto() {
    const others = all.filter((x) => x.id !== current).sort((a, b) => a.name.localeCompare(b.name));
    if (!others.length) return notify(t("Birlashtirish uchun boshqa ta’minotchi yo‘q"));
    form("Ta’minotchini birlashtirish · " + data.supplier.name, route + "/merge",
      [{ name: "targetId", label: "Qaysi ta’minotchiga qo‘shilsin", type: "select", raw: true, wide: true, req: true, options: others.map((x) => [x.id, x.name + (x.inn ? " · STIR " + x.inn : "") + " · " + x.contracts + " " + t("shartnoma")]) }],
      { targetId: others[0].id }, {}, "Bir ta’minotchi ikki xil yozilgan bo‘lsa, shu ta’minotchining fakturalari, to‘lovlari, shartnomalari va kirimlari tanlangan ta’minotchiga o‘tadi. Summalar o‘zgarmaydi.",
      (saved) => select(saved.id));
  }
  async function excel() {
    setBusy(true);
    try {
      await exportSheets({ filename: "Taminotchilar_" + today() + ".xlsx", company, sheets: [{ name: t("Ta’minotchilar"), title: t("Ta’minotchilar bilan hisob-kitob"), subtitle: fmtDate(today()) + " " + t("holatiga"),
        columns: [{ key: "name", header: t("Ta’minotchi"), width: 30 }, { key: "inn", header: "STIR", width: 14 }, { key: "contracts", header: t("Shartnomalar"), type: "num", width: 12 },
          ...[["opening", "Boshlang‘ich qoldiq"], ["invoiced", "Fakturalar"], ["paid", "To‘langan"], ["balance", "Qarz (+) / Avans (−)"], ["overdue", "Muddati o‘tgan"]].map(([key, header]) => ({ key, header: t(header), type: "money", total: "sum", width: 18 }))],
        rows: visible.map((p) => ({ ...p, balance: Math.round((p.debt - p.advance) * 100) / 100, _style: p.status === "overdue" ? "bad" : undefined })) }] });
    } catch (e) { notify(e.message); } finally { setBusy(false); }
  }
  async function contractPdf(c) {
    try { await openPdf("/finance/contracts/" + c.id + "/pdf", c.name || "Shartnoma.pdf"); } catch (e) { notify(e.message); }
  }

  const groups = [["all", "Hammasi"], ...Object.entries(STATUS).map(([k, v]) => [k, v[1]])].map(([k, l]) => [k, l, k === "all" ? all : all.filter((p) => p.status === k)]);
  const p = all.find((x) => x.id === current);
  const balance = summary ? summary.total.debt : 0;
  const overdue = sum(ledger.filter((r) => isDebt(r) && r.dueDate && r.dueDate < today()), (r) => r.remaining);
  const allocationLinks = (r) => allocations.filter((a) => a.sourceId === r.id || a.targetId === r.id);
  const cards = [...contracts, ...(summary && (summary.unassigned.docs > 0) ? [summary.unassigned] : [])];

  function docActions(r) {
    const related = allocationLinks(r);
    return <>
      {related.map((a) => {
        const other = ledger.find((item) => item.id === (a.sourceId === r.id ? a.targetId : a.sourceId));
        return <div className="settle-link" key={a.id}><span>{other && rowName(other, t)} · {display(a.amount)}</span>
          <button className="btn sm" onClick={() => cancel("allocation", a.id)}>{t("Ajratish")}</button></div>;
      })}
      <span className="fl-acts">
        {(r.kind === "invoice" || r.kind === "payment") && contracts.length > 0 && <button className="btn sm" onClick={() => assign(r)}>{t("Shartnoma")}</button>}
        {r.kind === "invoice" && <button className="btn sm" onClick={() => dueDate(r)}>{t("Muddat")}</button>}
        {!isDebt(r) && r.remaining > 0 && unpaidAll.length > 0 && <button className="btn sm" onClick={() => match(r)}>{t("Avansni bog‘lash")}</button>}
        {r.kind !== "invoice" && !related.length && <button className="btn sm" onClick={() => cancel("entry", r.id)}>{t("Bekor qilish")}</button>}
      </span></>;
  }

  return <section className="sheet finance-module fl settlements">
    {review && <ContractReview data={factoryData} initialKind="purchase" lockKind supplier={review === "supplier" && data ? data.supplier : null} onClose={() => setReview(false)} onSaved={(d) => { setReview(false); select(d.supplierId); setView("contracts"); refresh(); notify("Shartnoma saqlandi"); }} />}
    <div className="fl-top"><div><h2>{t("Ta’minotchilar")}</h2><p>{t("Qarz ta’minotchi bo‘yicha jamlanadi. Bir ta’minotchi bilan bir nechta shartnoma bo‘lishi mumkin — har biri bo‘yicha alohida hisob.")}</p></div>
      <div className="fl-acts"><button className="btn" disabled={busy || !visible.length} onClick={excel}>{t("Excel yuklash")}</button>
        <button className="btn" onClick={() => form("Ta’minotchi qo‘shish", base, [{ name: "name", label: "Ta’minotchi nomi", req: true, wide: true }, { name: "inn", label: "STIR (ixtiyoriy)" }], {}, {}, "", (saved) => select(saved.id))}>+ {t("Ta’minotchi")}</button>
        <button className="btn primary" onClick={() => setReview(true)}>+ {t("Shartnoma")}</button></div></div>
    {error && <p className="err" role="alert">{t(error)} <button className="btn sm" onClick={refresh}>{t("Qayta urinish")}</button></p>}
    {!list ? !error && <p className="loading" role="status">{t("Yuklanmoqda…")}</p> : <>
      <div className="fl-chips" role="group" aria-label={t("Holat bo‘yicha")}>{groups.map(([k, l, xs]) => <button key={k} className="fl-chip" aria-pressed={filter === k} onClick={() => setFilter(k)}><b>{t(l)} · {xs.length}</b><span>{short(xs.reduce((s, x) => s + Math.max(0, x.debt - x.advance), 0))} {t("qarz")}</span></button>)}</div>
      <div className="fl-split">
        <div><input className="fl-search" type="search" placeholder={t("Ta’minotchi nomi yoki STIR…")} aria-label={t("Ta’minotchini qidirish")} value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="fl-list" role="listbox" aria-label={t("Ta’minotchilar")}>{visible.map((x) => {
            const bal = Math.round((x.debt - x.advance) * 100) / 100;
            return <button key={x.id} role="option" className="fl-row" aria-selected={current === x.id} onClick={() => select(x.id)}>
              <div><b>{show(x.name)}</b>{x.archived && <small> · {t("Arxiv")}</small>}<br /><small>{x.contracts} {t("shartnoma")}{x.inn ? " · STIR " + x.inn : ""}</small></div>
              <div className="r"><span className="fl-money" style={{ fontWeight: 700, color: bal > 0 ? "var(--signal)" : bal < 0 ? "var(--accent)" : "var(--ok)" }}>{bal ? short(Math.abs(bal)) : "0"}</span><Tag tone={STATUS[x.status][0]}>{t(STATUS[x.status][1])}</Tag></div></button>;
          })}
            {!visible.length && <p className="fl-empty">{t(query || filter !== "all" ? "Ta’minotchi topilmadi." : "Ta’minotchi qo‘shing yoki shartnoma yuklang.")}</p>}</div></div>
        {!current ? <p className="fl-empty">{t("Ta’minotchi yo‘q. Shartnoma yuklang yoki ta’minotchi qo‘shing.")}</p> : !data ? <p className="loading" role="status">{t("Yuklanmoqda…")}</p> : <article className="fl-detail">
          <div className="fl-dh"><div><h3>{show(data.supplier.name)}</h3><small>{data.supplier.inn ? "STIR " + data.supplier.inn : t("STIR kiritilmagan")} · {contracts.length} {t("shartnoma")}</small></div>
            <div className="fl-acts"><button className="btn sm" onClick={profile}>{t("Tahrirlash")}</button><button className="btn sm" onClick={mergeInto} title={t("Bir ta’minotchi ikki xil yozilgan bo‘lsa — bitta qilish")}>{t("Birlashtirish")}</button>
              <button className="btn sm" onClick={() => setReview("supplier")}>+ {t("Shartnoma")}</button><button className="btn sm primary" onClick={() => payment(contract && contract !== "none" ? contract : "")}>+ {t("To‘lov")}</button></div></div>
          <div className="fl-facts">
            <div className="fl-fact"><span>{t("Boshlang‘ich qoldiq")}</span><b>{ledger.some((r) => r.kind.startsWith("opening")) ? money(summary.total.opening) : <button className="linkbtn" onClick={opening}>{t("Kiritish")}</button>}</b></div>
            <div className="fl-fact"><span>{t("Fakturalar")}</span><b>{money(summary.total.invoiced)}</b></div>
            <div className="fl-fact"><span>{t("To‘langan")}</span><b style={{ color: "var(--ok)" }}>{money(summary.total.paid)}</b></div>
            <div className="fl-fact"><span>{balance < 0 ? t("Avans") : t("Qarz")}</span><b style={{ color: balance > 0 ? "var(--signal)" : "var(--accent)" }}>{money(Math.abs(balance))}</b></div>
          </div>
          {overdue > 0 && <p className="fl-bad">{t("Muddati o‘tgan qarz")}: {money(overdue)} {t("so‘m")}.</p>}
          {p && p.advance > 0 && p.debt > 0 && <p className="fl-warn">{t("Bog‘lanmagan avans")}: {money(p.advance)} {t("so‘m")}. {t("To‘lovlar bo‘limida fakturaga bog‘lang.")}</p>}
          {cards.length > 0 && <div className="settle-contracts">
            {cards.map((c) => <ContractCard key={c.id || "none"} c={c} t={t} active={contract === (c.id || "none")}
              onPick={() => setContract(contract === (c.id || "none") ? "" : c.id || "none")} onPay={() => payment(c.id)} onPdf={() => contractPdf(c)} />)}
            <Legend items={[["fl-c1", t("To‘langan")], ["fl-c3", t("Faktura qilingan, to‘lanmagan")], ["", t("Shartnoma bo‘yicha qolgan")]]} />
          </div>}
          {contract && <p className="fl-note">{t("Faqat tanlangan shartnoma hujjatlari ko‘rsatilmoqda.")} <button className="linkbtn" onClick={() => setContract("")}>{t("Hammasini ko‘rsatish")}</button></p>}
          <div className="fl-tabs" role="group">{[["hist", "Hujjatlar tarixi"], ["inv", t("Fakturalar") + " · " + debts.length], ["pay", t("To‘lovlar") + " · " + credits.length], ["contracts", t("Shartnomalar va materiallar")], ["statement", "Akt sverka"]].map(([k, l]) =>
            <button key={k} aria-pressed={view === k} onClick={() => setView(k)}>{t(l)}</button>)}</div>
          {view === "hist" ? (shown.length ? <ul className="fl-tl">{shown.slice().sort((a, b) => b.date.localeCompare(a.date)).map((r) => {
            const c = contractOf(r.contractId);
            return <li key={r.id}><time>{ddmm(r.date)}</time><span className={"fl-dot " + DOT[r.kind][0]} aria-hidden="true">{DOT[r.kind][1]}</span>
              <div><b style={{ fontWeight: 600 }}>{rowName(r, t)}</b>
                <small>{c ? t("Shartnoma") + " № " + c.number : r.kind.startsWith("opening") ? t("Umumiy") : t("Shartnomasiz")}
                  {isDebt(r) ? (r.remaining > 0 ? " · " + t("Qoldiq") + " " + money(r.remaining) : " · " + t("To‘langan")) : r.remaining > 0 ? " · " + t("Bog‘lanmagan") + " " + money(r.remaining) : ""}
                  {r.dueDate ? " · " + t("muddat") + " " + ddmm(r.dueDate) : ""}</small>
                <details><summary>{t("Amallar")}</summary>{docActions(r)}</details></div>
              <span className={"fl-money " + (isDebt(r) ? "fl-minus" : "fl-plus")}>{isDebt(r) ? "+" : "−"}{money(r.amount)}</span></li>;
          })}</ul> : <p className="fl-empty">{t("Hujjat yo‘q.")}</p>)
          : view === "inv" || view === "pay" ? <div className="fl-orders">{(view === "inv" ? debts : credits).slice().reverse().map((r) => {
              const c = contractOf(r.contractId);
              return <div className="fl-ord" key={r.id}>
                <div className="l"><b>{rowName(r, t)} · {fmtDate(r.date)}</b><span className="fl-money">{money(r.amount)}</span></div>
                <div className="l sub"><span>{c ? t("Shartnoma") + " " + contractLabel(c) : t("Shartnomasiz")}</span>
                  <span>{isDebt(r) ? (r.remaining > 0 ? t("Qoldiq") + " " + money(r.remaining) : t("To‘langan")) : t("Bog‘lanmagan") + " " + money(r.remaining)}{r.dueDate ? " · " + t("muddat") + " " + fmtDate(r.dueDate) : ""}
                    {r.dueDate && r.dueDate < today() && r.remaining > 0 && <> <Tag tone="bad">{t("Muddati o‘tgan")}</Tag></>}</span></div>
                <div className="l sub">{docActions(r)}</div></div>;
            })}
            {!(view === "inv" ? debts : credits).length && <p className="fl-empty">{t(view === "inv" ? "Hozircha faktura yoki boshlang‘ich qarz yo‘q." : "Hozircha to‘lov yoki avans yo‘q.")}</p>}
            {view === "inv" && !ledger.some((r) => r.kind.startsWith("opening")) && <button className="btn sm" onClick={opening}>{t("Boshlang‘ich qoldiq kiritish")}</button>}</div>
          : view === "contracts" ? <SupplierMaterials account={data} materials={factoryData.materials} refresh={refresh} notify={notify} openContract={() => setReview("supplier")} />
          : <Statement ledger={ledger} contracts={contracts} company={company} supplier={data.supplier.name} t={t} notify={notify} />}
          <p className="fl-note">{t("Qarz = boshlang‘ich qoldiq + fakturalar − to‘lovlar. Har bir shartnoma qarzi = shu shartnoma fakturalari − shu shartnoma to‘lovlari. Boshlang‘ich qoldiq «Shartnomasiz» qismida.")}</p>
        </article>}
      </div></>}
  </section>;
}
