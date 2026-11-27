"use client";
// Mijozlar: qarz mijoz bo'yicha jamlanadi. Chapda ro'yxat, o'ngda batafsil panel va hujjatlar tarixi (jadvalsiz).
import { show } from "@/lib/i18n";
import { matches } from "@/lib/script";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { fmtDate, fmtN, today } from "@/lib/calc";
import { openPdf } from "@/lib/finance-files";
import { exportSheets } from "@/lib/xlsx-export";
import { InvoiceDialog, receiptForm } from "./FinanceOrders";
import { money, short, STATUS, Tag, Pipe, Legend, ddmm, monthEndDate, shiftMonth, useLoad } from "./FinanceUi";
import { ActUploadDialog, ActList } from "./ActUpload";

const DOT = { shipment: "N", invoice: "F", receipt: "₮", opening: "Q" };
// Buyurtmalar bo'limi: holat bo'yicha guruhlar (Tugallangan = tayyor + yakunlangan)
const ORD_GROUPS = [["all", "Hammasi"], ["yangi", "Yangi"], ["jarayonda", "Jarayonda"], ["done", "Tugallangan"]];
const ORD_STATUS = { yangi: ["Yangi", "mut"], jarayonda: ["Jarayonda", "sig"], tayyor: ["Tayyor", "ok"], topshirildi: ["Tugallangan", "ok"], bekor: ["Bekor qilingan", "mut"] };
const ordGroup = (o) => (o.status === "tayyor" || o.status === "topshirildi" || o.status === "bekor" ? "done" : o.status === "jarayonda" ? "jarayonda" : "yangi");
export const PICK_KEY = "fin.customer";

/** /finance/orders dan buyurtma modeli (faktura oynasi uchun) */
function orderModel(o, ledger, prods) {
  const active = ledger.invoices.filter((x) => x.orderId === o.id && !x.voidedAt);
  const lines = o.items.map((it) => ({ ...it, code: prods.get(it.productId)?.code || "O‘chirilgan mahsulot", price: +it.price || 0,
    invoicedQty: active.reduce((s, x) => s + x.items.filter((i) => i.productId === it.productId).reduce((a, i) => a + i.qty, 0), 0) }));
  return { ...o, lines };
}

export default function FinanceCustomers({ data, notify, openForm, navigate }) {
  const list = useLoad("/finance/customers");
  const [orders, setOrders] = useState(null);
  const [filter, setFilter] = useState("all"), [q, setQ] = useState(""), [sel, setSel] = useState(() => { try { const k = sessionStorage.getItem(PICK_KEY) || ""; sessionStorage.removeItem(PICK_KEY); return k; } catch { return ""; } });
  const [ordFilter, setOrdFilter] = useState("all"), [ordSort, setOrdSort] = useState("new");
  const [tab, setTab] = useState("hist"), [invoiceOrder, setInvoiceOrder] = useState(null), [statement, setStatement] = useState(false), [busy, setBusy] = useState(false);
  const customers = list.data?.customers || [];
  const locks = new Set(list.data?.locks || []);
  const reload = () => { list.reload(); setOrders(null); };
  useEffect(() => { if (!orders) api("/finance/orders").then(setOrders).catch(() => {}); }, [orders]);
  const groups = useMemo(() => [["all", "Hammasi", customers], ...Object.keys(STATUS).map((k) => [k, STATUS[k][1], customers.filter((c) => c.status === k)])], [customers]);
  const visible = customers.filter((c) => (filter === "all" || c.status === filter) && matches([c.name, c.inn], q));
  const c = visible.find((x) => x.key === sel) || customers.find((x) => x.key === sel) || visible[0];

  function addOpening(customer) {
    const requestId = crypto.randomUUID();
    openForm({ title: "Boshlang‘ich qoldiq", description: "Tizimdan oldingi (masalan, 2025 yildan qolgan) qarz yoki avans. Shu sanadagi qoldiqni kiriting. Har mijozga bitta boshlang‘ich qoldiq.",
      values: { customer: customer?.name || "", inn: customer?.inn || "", date: "2026-01-01", kind: "debt" },
      fields: [{ name: "customer", label: "Mijoz (buyurtmadagi nomi bilan)", req: true, wide: true }, { name: "inn", label: "STIR" }, { name: "date", label: "Sana", type: "date", req: true },
        { name: "kind", label: "Qoldiq turi", type: "select", options: [["debt", "Mijoz bizga qarz"], ["advance", "Mijozdan olingan avans"]] }, { name: "amount", label: "Summa", type: "number", min: 0.01, step: 0.01, req: true, unit: "so‘m" }, { name: "note", label: "Izoh / asos hujjat", wide: true }],
      onSubmit: async (v) => { await api("/finance/customers/openings", { method: "POST", body: { ...v, requestId } }); reload(); notify("Boshlang‘ich qoldiq saqlandi"); } });
  }
  function addReceipt() {
    const openOrders = c.orders.map((o) => [o.id, "№" + o.no + (o.contractNo ? " · " + o.contractNo : "")]);
    openForm(receiptForm({ title: "To‘lov qabul qilish · " + c.name, invoices: c.invoices, receipts: [],
      extraFields: openOrders.length ? [{ name: "orderId", label: "Buyurtma (ixtiyoriy)", type: "select", raw: true, wide: true, options: [["", "Buyurtmaga bog‘lamasdan (mijoz bo‘yicha)"], ...openOrders] }] : [],
      onSubmit: async (body) => { await api("/finance/customers/receipts", { method: "POST", body: { ...body, customer: c.name, orderId: body.orderId || null } }); reload(); notify("To‘lov saqlandi"); } }));
  }
  function addInvoice() {
    if (!orders) return notify("Buyurtmalar yuklanmoqda…");
    const own = orders.orders.filter((o) => c.orders.some((x) => x.id === o.id));
    if (!own.length) return notify("Bu mijozda buyurtma yo‘q. Faktura buyurtmaga yoziladi");
    const open = (o) => setInvoiceOrder(orderModel(o, orders, data.prods));
    if (own.length === 1) return open(own[0]);
    openForm({ title: "Qaysi buyurtma uchun faktura?", values: { orderId: own[0].id }, fields: [{ name: "orderId", label: "Buyurtma", type: "select", raw: true, wide: true, options: own.map((o) => [o.id, "№" + o.no + " · " + (o.contractNo || "Shartnomasiz")]) }],
      submitLabel: "Davom etish", onSubmit: async (v) => open(own.find((o) => o.id === v.orderId)) });
  }
  function voidEvent(e) {
    const path = e.type === "receipt" ? "/finance/customers/receipts/" + e.id + "/void" : e.type === "opening" ? "/finance/customers/openings/" + e.id + "/void" : "/finance/orders/" + e.orderId + "/invoices/" + e.id + "/void";
    openForm({ title: e.title + " · bekor qilish", fields: [{ name: "reason", label: "Bekor qilish sababi", req: true, wide: true }], onSubmit: async (v) => { await api(path, { method: "POST", body: v }); reload(); notify("Bekor qilindi"); } });
  }
  function mergeInto() {
    const others = customers.filter((x) => x.key !== c.key).sort((a, b) => a.name.localeCompare(b.name));
    if (!others.length) return notify("Birlashtirish uchun boshqa mijoz yo‘q");
    openForm({ title: "Mijozni birlashtirish · " + c.name, submitLabel: "Birlashtirish",
      description: "Bir mijoz ikki xil yozilgan bo‘lsa, shu mijozning buyurtmalari, to‘lovlari, boshlang‘ich qoldig‘i va shartnomalari tanlangan mijozga o‘tkaziladi. Summalar o‘zgarmaydi. Bu mijoz ro‘yxatdan yo‘qoladi.",
      values: { to: others[0].name }, fields: [{ name: "to", label: "Qaysi mijozga qo‘shilsin", type: "select", raw: true, wide: true, req: true, options: others.map((x) => [x.name, x.name + (x.inn ? " · STIR " + x.inn : "") + " · " + x.orders.length + " buyurtma"]) }],
      onSubmit: async (v) => {
        const res = await api("/finance/customers/merge", { method: "POST", body: { from: c.name, to: v.to } });
        const target = others.find((x) => x.name === v.to);
        if (target) setSel(target.key);
        reload(); notify("Birlashtirildi: " + (res.moved?.orders || 0) + " buyurtma, " + (res.moved?.receipts || 0) + " to‘lov o‘tkazildi");
      } });
  }
  function dueDate(inv) {
    openForm({ title: "Faktura №" + inv.number + " · to‘lov muddati", values: { dueDate: inv.dueDate || inv.date }, fields: [{ name: "dueDate", label: "To‘lov muddati", type: "date", req: true, min: inv.date }],
      onSubmit: async (v) => { await api("/finance/customers/invoices/" + inv.id + "/due-date", { method: "POST", body: v }); reload(); notify("Muddat saqlandi"); } });
  }
  async function excel() {
    setBusy(true);
    try {
      await exportSheets({ filename: "Mijozlar_qarzi_" + today() + ".xlsx", company: data.settings?.company, sheets: [{ name: "Mijozlar", title: "Mijozlar bilan hisob-kitob", subtitle: fmtDate(today()) + " holatiga",
        columns: [{ key: "name", header: "Mijoz", width: 30 }, { key: "inn", header: "STIR", width: 14 }, ...[["opening", "Boshlang‘ich qoldiq"], ["shipped", "Jo‘natildi"], ["net", "Faktura QQSsiz"], ["vat", "QQS"], ["invoiced", "Faktura jami"], ["paid", "To‘landi"], ["debt", "Qarz (+) / Avans (−)"], ["overdue", "Muddati o‘tgan"], ["notInvoiced", "Fakturasiz jo‘natma"]].map(([key, header]) => ({ key, header, type: "money", total: "sum", width: 18 }))],
        rows: visible.map((x) => ({ ...x, _style: x.status === "overdue" ? "bad" : undefined })) }] });
    } catch (e) { notify(e.message); } finally { setBusy(false); }
  }

  return <section className="sheet finance-module fl">
    <div className="fl-top"><div><h2>Mijozlar</h2><p>Qarz mijoz bo‘yicha jamlanadi. Buyurtmalar, fakturalar va to‘lovlar mijoz ichida ko‘rinadi.</p></div>
      <div className="fl-acts"><button className="btn" disabled={busy || !visible.length} onClick={excel}>Excel yuklash</button><button className="btn" onClick={() => addOpening(null)}>+ Boshlang‘ich qoldiq</button></div></div>
    {list.error && <p className="err" role="alert">{list.error} <button className="btn sm" onClick={list.reload}>Qayta urinish</button></p>}
    {!list.data ? !list.error && <p role="status">Yuklanmoqda…</p> : <>
      <div className="fl-chips" role="group" aria-label="Holat bo‘yicha">{groups.map(([k, l, xs]) => <button key={k} className="fl-chip" aria-pressed={filter === k} onClick={() => setFilter(k)}><b>{l} · {xs.length}</b><span>{short(xs.reduce((s, x) => s + Math.max(0, x.debt), 0))} qarz</span></button>)}</div>
      <div className="fl-split">
        <div><input className="fl-search" type="search" placeholder="Mijoz nomi yoki STIR…" aria-label="Mijoz qidirish" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="fl-list" role="listbox" aria-label="Mijozlar">{visible.map((x) => <button key={x.key} role="option" className="fl-row" aria-selected={c?.key === x.key} onClick={() => { setSel(x.key); setTab("hist"); }}>
            <div><b>{show(x.name)}</b><br /><small>{x.orders.length} buyurtma · {x.status === "overdue" ? x.overdueDays + " kun kechikkan" : x.nextDue ? "Muddat " + ddmm(x.nextDue) : x.notInvoiced > 0 ? "Faktura yozilmagan" : STATUS[x.status][1]}</small></div>
            <div className="r"><span className="fl-money" style={{ fontWeight: 700, color: x.debt > 0 ? "var(--signal)" : x.debt < 0 ? "var(--accent)" : "var(--ok)" }}>{x.debt ? short(Math.abs(x.debt)) : "0"}</span><Tag tone={STATUS[x.status][0]}>{STATUS[x.status][1]}</Tag></div></button>)}
            {!visible.length && <p className="fl-empty">Mijoz topilmadi.</p>}</div></div>
        {c ? <article className="fl-detail">
          <div className="fl-dh"><div><h3>{show(c.name)}</h3><small>{c.inn ? "STIR " + c.inn : "STIR kiritilmagan"}</small></div>
            <div className="fl-acts"><button className="btn sm" onClick={() => setStatement(true)}>Akt sverka</button><button className="btn sm" onClick={mergeInto} title="Bir mijoz ikki xil yozilgan bo‘lsa — bitta qilish">Birlashtirish</button><button className="btn sm" onClick={addInvoice}>+ Faktura</button><button className="btn sm primary" onClick={addReceipt}>+ To‘lov</button></div></div>
          <div className="fl-facts">
            <div className="fl-fact"><span>Boshlang‘ich qoldiq</span><b>{c.openingEntry ? money(c.opening) : <button className="linkbtn" onClick={() => addOpening(c)}>Kiritish</button>}</b></div>
            <div className="fl-fact"><span>Faktura (QQS bilan)</span><b>{money(c.invoiced)}</b></div>
            <div className="fl-fact"><span>To‘landi</span><b style={{ color: "var(--ok)" }}>{money(c.paid)}</b></div>
            <div className="fl-fact"><span>{c.debt < 0 ? "Avans" : "Qarz"}</span><b style={{ color: c.debt > 0 ? "var(--signal)" : "var(--accent)" }}>{money(Math.abs(c.debt))}</b></div>
          </div>
          <div><Pipe total={c.orders.reduce((s, o) => s + o.total, 0) || c.shipped} done={c.shipped} paid={c.paid} /><Legend /></div>
          {c.overdue > 0 && <p className="fl-bad">Muddati o‘tgan qarz: {money(c.overdue)} so‘m · {c.overdueDays} kun kechikkan.</p>}
          {c.notInvoiced > 0 && <p className="fl-warn">Jo‘natilgan, lekin faktura yozilmagan: {money(c.notInvoiced)} so‘m.</p>}
          {c.unpricedLines > 0 && <p className="fl-warn">{c.unpricedLines} ta mahsulotda sotuv narxi kiritilmagan{c.unpricedQty ? " (" + fmtN(c.unpricedQty) + " dona jo‘natilgan)" : ""}. Tannarx bilan hisoblanmaydi — narxni buyurtmada kiriting.</p>}
          <div className="fl-tabs" role="group">{[["hist", "Hujjatlar tarixi"], ["inv", "Fakturalar · " + c.invoices.length], ["ord", "Buyurtmalar · " + c.orders.length]].map(([k, l]) => <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>)}</div>
          {tab === "hist" ? (c.events.length ? <ul className="fl-tl">{c.events.map((e) => <li key={e.type + e.id}>
            <time>{ddmm(e.date)}</time><span className={"fl-dot " + e.type} aria-hidden="true">{DOT[e.type]}</span>
            <div><b style={{ fontWeight: 600 }}>{e.title}</b> {e.locked && <Tag tone="mut">qulflangan</Tag>}<small>{e.sub}{e.dueDate ? " · muddat " + ddmm(e.dueDate) : ""}</small>
              {!e.locked && e.type !== "shipment" && <button className="linkbtn" onClick={() => voidEvent(e)}>Bekor qilish</button>}</div>
            <span className={"fl-money " + (!e.affects ? "fl-neutral" : e.amount < 0 ? "fl-plus" : "fl-minus")}>{!e.affects ? "" : e.amount < 0 ? "−" : "+"}{money(Math.abs(e.amount))}</span></li>)}</ul>
            : <p className="fl-empty">Hujjat yo‘q.</p>)
          : tab === "inv" ? (c.invoices.length ? <div className="fl-orders">{c.invoices.slice().reverse().map((i) => <div className="fl-ord" key={i.id}>
              <div className="l"><b>Faktura №{i.number} · {fmtDate(i.date)}</b><span className="fl-money">{money(i.amount)}</span></div>
              <div className="l sub"><span>QQSsiz {money(i.net)} · QQS {money(i.vat)}</span><span>Buyurtma №{i.orderNo}</span></div>
              <div className="l sub"><span>{i.remaining > 0 ? "Qoldiq " + money(i.remaining) : "To‘langan"}{i.dueDate ? " · muddat " + fmtDate(i.dueDate) : ""} {i.overdue && <Tag tone="bad">Muddati o‘tgan</Tag>}</span>
                <span className="fl-acts"><button className="btn sm" onClick={() => dueDate(i)}>Muddat</button><button className="btn sm" onClick={() => openPdf("/finance/invoices/" + i.id + "/pdf", "Faktura_" + i.number + ".pdf").catch((e) => notify(e.message))}>PDF</button></span></div></div>)}</div>
            : <p className="fl-empty">Faktura yo‘q.</p>)
          : <div className="fl-orders">
            <div className="fl-ordbar">
              <div className="fl-tabs" role="group" aria-label="Buyurtma holati">{ORD_GROUPS.map(([k, l]) => <button key={k} aria-pressed={ordFilter === k} onClick={() => setOrdFilter(k)}>{l} · {k === "all" ? c.orders.length : c.orders.filter((o) => ordGroup(o) === k).length}</button>)}</div>
              <select aria-label="Tartib" value={ordSort} onChange={(e) => setOrdSort(e.target.value)}><option value="new">Yangilari avval</option><option value="old">Eskilari avval</option></select>
            </div>
            {c.orders.filter((o) => ordFilter === "all" || ordGroup(o) === ordFilter)
              .sort((a, b) => ((a.date || "").localeCompare(b.date || "") || a.no - b.no) * (ordSort === "new" ? -1 : 1))
              .map((o) => <div className="fl-ord" key={o.id}><div className="l"><b>Buyurtma №{o.no} · {o.contractNo || "Shartnomasiz"}{o.date ? " · " + fmtDate(o.date) : ""}</b><span className="fl-money">{money(o.total)}</span></div>
              <Pipe total={o.total} done={o.shipped} paid={o.paid} />
              <div className="l sub"><span>Jo‘natildi {short(o.shipped)}</span><span>Faktura {short(o.invoiced)}</span><span>To‘landi {short(o.paid)}</span>{ORD_STATUS[o.status] && <Tag tone={ORD_STATUS[o.status][1]}>{ORD_STATUS[o.status][0]}</Tag>}{o.unpricedLines > 0 && <Tag tone="sig">Narx yo‘q</Tag>}</div></div>)}
            {!c.orders.length ? <p className="fl-empty">Buyurtma yo‘q (faqat boshlang‘ich qoldiq yoki to‘lov).</p>
              : !c.orders.some((o) => ordFilter === "all" || ordGroup(o) === ordFilter) && <p className="fl-empty">Bu holatda buyurtma yo‘q.</p>}</div>}
          <p className="fl-note">Qarz = boshlang‘ich qoldiq + fakturalar (QQS bilan) − to‘lovlar. Yopilgan oydagi hujjatlarni o‘zgartirib bo‘lmaydi.</p>
        </article> : <p className="fl-empty">Mijoz yo‘q. Buyurtma qo‘shing yoki boshlang‘ich qoldiq kiriting.</p>}
      </div></>}
    {invoiceOrder && <InvoiceDialog order={invoiceOrder} notify={notify} onClose={() => setInvoiceOrder(null)} onSaved={() => { setInvoiceOrder(null); reload(); }} />}
    {statement && c && <StatementDialog customer={c} company={data.settings?.company} notify={notify} onChanged={reload} onClose={() => setStatement(false)} />}
  </section>;
}

/** Akt sverka: istalgan davr (oy, chorak, yil yoki o'zingiz tanlagan sanalar) */
export function StatementDialog({ customer, company, notify, onClose, onChanged }) {
  const ref = useRef(null);
  const m = today().slice(0, 7), y = m.slice(0, 4), qStart = y + "-" + String(Math.floor((+m.slice(5, 7) - 1) / 3) * 3 + 1).padStart(2, "0");
  const presets = [["Bu oy", m + "-01", today()], ["O‘tgan oy", shiftMonth(m, -1) + "-01", monthEndDate(shiftMonth(m, -1))], ["Shu chorak", qStart + "-01", today()], ["Shu yil", y + "-01-01", today()], ["O‘tgan yil", (+y - 1) + "-01-01", (+y - 1) + "-12-31"]];
  const [from, setFrom] = useState(m + "-01"), [to, setTo] = useState(today()), [st, setSt] = useState(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [upload, setUpload] = useState(false), [acts, setActs] = useState(0);
  useEffect(() => { ref.current?.showModal(); }, []);
  useEffect(() => {
    if (!from || !to || from > to) return;
    let live = true; setError("");
    api("/finance/customers/statement?name=" + encodeURIComponent(customer.name) + "&from=" + from + "&to=" + to).then((x) => live && setSt(x)).catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [from, to, customer.name]);
  const bal = (n) => money(Math.abs(n)) + (n > 0 ? " · mijoz qarzi" : n < 0 ? " · avans" : "");
  async function download() {
    setBusy(true);
    try {
      await exportSheets({ filename: "Akt_sverka_" + customer.name.replace(/[^\p{L}\p{N}]+/gu, "_") + "_" + from + "_" + to + ".xlsx", company, sheets: [{ name: "Akt sverka", title: "Solishtirma dalolatnoma (akt sverka)", subtitle: customer.name + (customer.inn ? " · STIR " + customer.inn : "") + " · " + fmtDate(from) + " – " + fmtDate(to),
        columns: [{ key: "date", header: "Sana", width: 14 }, { key: "doc", header: "Hujjat", width: 46 }, { key: "debit", header: "Debet (qarz oshdi)", type: "money", width: 20 }, { key: "credit", header: "Kredit (to‘landi)", type: "money", width: 20 }],
        rows: [{ date: fmtDate(from), doc: "Boshlang‘ich qoldiq", debit: Math.max(st.initial, 0), credit: Math.max(-st.initial, 0), _style: "bold" },
          ...st.entries.map((e) => ({ ...e, date: fmtDate(e.date) })),
          { doc: "Davr aylanmasi", debit: st.debit, credit: st.credit, _style: "bold" },
          { date: fmtDate(to), doc: "Yakuniy qoldiq", debit: Math.max(st.closing, 0), credit: Math.max(-st.closing, 0), _style: "bold" }],
        notes: [(company || "Korxona") + " ____________________  M.O‘.", customer.name + " ____________________  M.O‘."] }] });
    } catch (e) { notify(e.message); } finally { setBusy(false); }
  }
  return <><dialog ref={ref} className="fl-dialog" onClose={onClose}><div className="fl-form">
    <div><h3>Akt sverka</h3><p className="fl-note">{show(customer.name)}</p></div>
    <div className="fl-chips">{presets.map(([l, a, b]) => <button key={l} type="button" className="fl-chip" aria-pressed={from === a && to === b} onClick={() => { setFrom(a); setTo(b); }}><b>{l}</b></button>)}</div>
    <div className="fl-two"><label>Boshlanishi<input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label><label>Oxiri<input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label></div>
    {error && <p className="err" role="alert">{error}</p>}
    {st && <div className="fl-facts" style={{ gridTemplateColumns: "repeat(2,minmax(0,1fr))" }}>
      <div className="fl-fact"><span>Boshlang‘ich qoldiq</span><b>{bal(st.initial)}</b></div><div className="fl-fact"><span>Yakuniy qoldiq</span><b>{bal(st.closing)}</b></div>
      <div className="fl-fact"><span>Faktura (debet)</span><b>{money(st.debit)}</b></div><div className="fl-fact"><span>To‘lov (kredit)</span><b>{money(st.credit)}</b></div></div>}
    {st && <p className="fl-note">{st.entries.length} ta hujjat. Jo‘natmalar akt sverkaga kirmaydi, faqat faktura va to‘lovlar.</p>}
    <ActList party="customer" counterparty={customer.name} notify={notify} version={acts} onUpload={() => setUpload(true)} />
    <div className="fl-acts" style={{ justifyContent: "flex-end" }}><button className="btn" onClick={() => ref.current.close()}>Yopish</button><button className="btn primary" disabled={!st || busy} onClick={download}>Excelga yuklash</button></div>
  </div></dialog>
  {upload && <ActUploadDialog party="customer" counterparty={customer.name} hasOpening={!!customer.openingEntry} notify={notify}
    onClose={() => { setUpload(false); onChanged?.(); }} onSaved={() => { setUpload(false); setActs((n) => n + 1); onChanged?.(); }} />}
  </>;
}
