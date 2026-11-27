"use client";
// Imzolangan akt sverka PDF: yuklash → PDFdan raqamlarni o'qish → dastur hisobi bilan solishtirish → tasdiqlab saqlash.
// Mijozlar uchun (party="customer"). Ta'minotchilar uchun backend tayyor bo'lganda party="supplier" bilan ishlatiladi.
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { show } from "@/lib/i18n";
import { fmtDate } from "@/lib/calc";
import { fileBase64, openPdf } from "@/lib/finance-files";
import { money, Tag } from "./FinanceUi";
import "./act-upload.css";

const KINDS = [["goods", "Faktura / tovar"], ["payment", "To‘lov"], ["return", "Qaytarish"], ["", "— tanlang —"]];
const sideLabel = (party, n) => (n > 0.004 ? (party === "supplier" ? "Ta’minotchi bizga qarz" : "Mijoz bizga qarz") : n < -0.004 ? (party === "supplier" ? "Biz ta’minotchiga qarz" : "Mijozdan avans") : "Qoldiq yo‘q");
const signed = (n) => (n < 0 ? "−" : "") + money(Math.abs(n));

/** Qoldiq: summa + kim foydasiga (ishora o'rniga tushunarli tanlov) */
function Balance({ label, value, party, onChange }) {
  const v = value ?? 0, sign = v < 0 ? -1 : 1;
  return <label>{label}
    <div className="au-bal">
      <input type="number" min="0" step="0.01" value={value == null ? "" : Math.abs(v)} onChange={(e) => onChange(e.target.value === "" ? null : sign * Math.abs(+e.target.value))} />
      <select value={sign} onChange={(e) => onChange(Math.abs(v) * +e.target.value)} aria-label={label + " · yo‘nalishi"}>
        <option value={1}>{party === "supplier" ? "Ta’minotchi bizga qarz" : "Mijoz bizga qarz"}</option>
        <option value={-1}>{party === "supplier" ? "Biz ta’minotchiga qarz" : "Avans (biz qarz)"}</option>
      </select>
    </div></label>;
}

export function ActUploadDialog({ party = "customer", counterparty, hasOpening = true, notify, onClose, onSaved }) {
  const ref = useRef(null);
  const [file, setFile] = useState(null), [base64, setBase64] = useState("");
  const [act, setAct] = useState(null), [res, setRes] = useState(null), [note, setNote] = useState("");
  const [busy, setBusy] = useState(""), [error, setError] = useState("");
  const [requestId] = useState(() => crypto.randomUUID()), [openingAdded, setOpeningAdded] = useState(false);
  const first = useRef(true);
  useEffect(() => { ref.current?.showModal(); }, []);

  async function load(f) {
    setError(""); setAct(null); setRes(null); setBusy("read");
    try {
      const b64 = await fileBase64(f);
      setFile(f); setBase64(b64);
      const out = await api("/finance/acts/preview", { method: "POST", body: { party, counterparty, contentBase64: b64 } });
      first.current = true;
      setAct(out.act); setRes(out);
    } catch (e) { setError(e.message); } finally { setBusy(""); }
  }
  // Foydalanuvchi davr, qoldiq yoki qator turini o'zgartirsa — qayta solishtiramiz
  useEffect(() => {
    if (!act) return;
    if (first.current) { first.current = false; return; }
    let live = true;
    const t = setTimeout(() => {
      api("/finance/acts/compare", { method: "POST", body: { party, counterparty, act } }).then((out) => live && setRes(out)).catch((e) => live && setError(e.message));
    }, 350);
    return () => { live = false; clearTimeout(t); };
  }, [act, party, counterparty]);
  const set = (patch) => setAct((a) => ({ ...a, ...patch }));
  const setRow = (i, kind) => setAct((a) => ({ ...a, rows: a.rows.map((x, j) => (j === i ? { ...x, kind } : x)) }));

  async function save() {
    setBusy("save"); setError("");
    try {
      await api("/finance/acts", { method: "POST", body: { requestId, party, counterparty, act, note, name: file?.name || "Akt_sverka.pdf", contentBase64: base64 } });
      notify("Akt sverka saqlandi");
      onSaved?.();
    } catch (e) { setError(e.message); setBusy(""); }
  }
  async function addOpening() {
    const amount = Math.abs(act.opening || 0);
    if (!amount) return;
    const d = new Date(act.from + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - 1);
    setBusy("opening"); setError("");
    try {
      await api("/finance/customers/openings", { method: "POST", body: { requestId: crypto.randomUUID(), customer: counterparty, date: d.toISOString().slice(0, 10), kind: act.opening > 0 ? "debt" : "advance", amount, note: "Akt sverka PDF bo‘yicha (" + fmtDate(act.from) + " holatiga)" } });
      notify("Boshlang‘ich qoldiq kiritildi");
      first.current = false;
      setAct((a) => ({ ...a })); // qayta solishtirish
      setOpeningAdded(true);
    } catch (e) { setError(e.message); } finally { setBusy(""); }
  }

  const cmp = res?.comparison, st = res?.statement;
  const openingDiff = cmp?.lines.find((l) => l.key === "opening");
  const periodOk = act?.from && act?.to && act.from <= act.to;
  const canSave = act && periodOk && act.opening != null && act.closing != null && base64 && !busy;
  return <dialog ref={ref} className="fl-dialog au-dialog" onClose={onClose}><div className="fl-form">
    <div><h3>Akt sverka PDF yuklash</h3><p className="fl-note">{show(counterparty)} · imzolangan akt sverka (Didox, 1C yoki skan). Dastur PDFdagi raqamlarni o‘qiydi va o‘z hisobi bilan solishtiradi. Saqlash qarz va to‘lovlarni o‘zgartirmaydi.</p></div>
    <label>PDF fayl (8 MB gacha)<input type="file" accept=".pdf,application/pdf" disabled={!!busy} onChange={(e) => e.target.files[0] && load(e.target.files[0])} /></label>
    {busy === "read" && <p role="status" className="fl-note">PDF o‘qilmoqda… Skanlangan bo‘lsa, bir daqiqagacha vaqt ketishi mumkin.</p>}
    {error && <p className="err" role="alert">{error}</p>}
    {act && <>
      {act.warnings?.length > 0 && <div className="fl-warn" role="status">{act.warnings.map((w) => <div key={w}>{w}</div>)}</div>}
      <div className="fl-two"><label>Davr boshi<input type="date" value={act.from || ""} max={act.to || undefined} onChange={(e) => set({ from: e.target.value })} /></label><label>Davr oxiri<input type="date" value={act.to || ""} min={act.from || undefined} onChange={(e) => set({ to: e.target.value })} /></label></div>
      <div className="fl-two"><Balance label="PDF: boshlang‘ich qoldiq" value={act.opening} party={party} onChange={(v) => set({ opening: v })} /><Balance label="PDF: yakuniy qoldiq" value={act.closing} party={party} onChange={(v) => set({ closing: v })} /></div>
      {!act.rows?.length && <div className="fl-two">
        <label>PDF: faktura / tovar jami<input type="number" min="0" step="0.01" value={act.goods ?? 0} onChange={(e) => set({ goods: +e.target.value || 0 })} /></label>
        <label>PDF: to‘lovlar jami<input type="number" min="0" step="0.01" value={act.payments ?? 0} onChange={(e) => set({ payments: +e.target.value || 0 })} /></label></div>}
      {!periodOk && <p className="fl-bad">Davrni kiriting — dastur shu davr bo‘yicha solishtiradi.</p>}

      {cmp && st && <>
        <div className={cmp.ok ? "au-verdict ok" : "au-verdict bad"} role="status">{cmp.ok ? "PDF dastur hisobiga to‘liq mos keladi." : "Farqlar bor — qizil qatorlarni tekshiring."}</div>
        <table className="au-table"><thead><tr><th>Ko‘rsatkich</th><th>PDF bo‘yicha</th><th>Dasturda</th><th>Farq</th></tr></thead>
          <tbody>{cmp.lines.map((l) => <tr key={l.key} className={l.ok ? "" : "au-diff"}><td>{l.label}{(l.key === "opening" || l.key === "closing") && <small>{sideLabel(party, l.pdf)}</small>}</td><td>{signed(l.pdf)}</td><td>{signed(l.app)}</td><td>{l.ok ? "✓" : signed(l.diff)}</td></tr>)}</tbody></table>
        <p className="fl-note">Qoldiqlar: «+» — {party === "supplier" ? "ta’minotchi bizga qarz" : "mijoz bizga qarz"}, «−» — {party === "supplier" ? "biz ta’minotchiga qarz" : "mijozdan avans"}. {cmp.matched} ta hujjat ikkala tomonda bir xil.</p>
        {!hasOpening && !openingAdded && party === "customer" && openingDiff && !openingDiff.ok && Math.abs(act.opening || 0) > 0 && periodOk &&
          <div className="au-apply"><span>Dasturda bu mijoz uchun boshlang‘ich qoldiq kiritilmagan. PDFdagi {signed(act.opening)} so‘mni {fmtDate(act.from)} holatiga boshlang‘ich qoldiq sifatida kiritish mumkin.</span>
            <button className="btn sm" disabled={!!busy} onClick={addOpening}>Boshlang‘ich qoldiq sifatida kiritish</button></div>}
        {cmp.amountDiff.length > 0 && <Section title="Summasi farq qiladi" tone="bad">{cmp.amountDiff.map((x, i) => <li key={i}><span>{fmtDate(x.pdf.date)} · {x.pdf.doc || "—"}</span><span>PDF {money(x.pdf.amount)} · dasturda {money(x.app.amount)} ({x.app.doc})</span></li>)}</Section>}
        {cmp.onlyPdf.length > 0 && <Section title="PDFda bor, dasturda yo‘q" tone="bad">{cmp.onlyPdf.map((x, i) => <li key={i}><span>{fmtDate(x.date)} · {x.doc || "—"}</span><span>{x.kind === "payment" ? "To‘lov" : "Faktura"} {money(x.amount)}</span></li>)}</Section>}
        {cmp.onlyApp.length > 0 && <Section title="Dasturda bor, PDFda yo‘q" tone="sig">{cmp.onlyApp.map((x, i) => <li key={i}><span>{fmtDate(x.date)} · {x.doc}</span><span>{x.kind === "payment" ? "To‘lov" : "Faktura"} {money(x.amount)}</span></li>)}</Section>}
      </>}

      {act.rows?.length > 0 && <details className="au-rows" open={act.rows.some((x) => !x.kind)}>
        <summary>PDFdan o‘qilgan qatorlar · {act.rows.length}{act.rows.some((x) => !x.kind) ? " · turi tanlanmagan bor" : ""}</summary>
        <table className="au-table"><thead><tr><th>Sana</th><th>Hujjat</th><th>Summa</th><th>Turi</th></tr></thead>
          <tbody>{act.rows.map((x, i) => <tr key={i} className={x.kind ? "" : "au-diff"}><td>{fmtDate(x.date)}</td><td>{x.doc || "—"}</td><td>{money(x.amount)}</td>
            <td><select value={x.kind} onChange={(e) => setRow(i, e.target.value)} aria-label="Hujjat turi">{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></td></tr>)}</tbody></table>
      </details>}
      <label>Izoh<input value={note} maxLength={500} placeholder="Masalan: Didox orqali imzolangan" onChange={(e) => setNote(e.target.value)} /></label>
    </>}
    <div className="fl-acts" style={{ justifyContent: "flex-end" }}>
      <button className="btn" disabled={busy === "save"} onClick={() => ref.current.close()}>Bekor qilish</button>
      <button className="btn primary" disabled={!canSave} onClick={save}>{busy === "save" ? "Saqlanmoqda…" : "Tasdiqlash va saqlash"}</button>
    </div>
  </div></dialog>;
}

const Section = ({ title, tone, children }) => <div className={"au-sec " + tone}><b>{title}</b><ul>{children}</ul></div>;

/** Kontragentning saqlangan akt sverkalari */
export function ActList({ party = "customer", counterparty, notify, onUpload, version = 0 }) {
  const [list, setList] = useState(null), [error, setError] = useState(""), [voiding, setVoiding] = useState(null), [reason, setReason] = useState(""), [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    api("/finance/acts?party=" + party + "&counterparty=" + encodeURIComponent(counterparty)).then((x) => live && setList(x)).catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [party, counterparty, version, n]);
  async function voidAct(id) {
    try { await api("/finance/acts/" + id + "/void", { method: "POST", body: { reason } }); setVoiding(null); setReason(""); setN((x) => x + 1); notify("Bekor qilindi"); }
    catch (e) { notify(e.message); }
  }
  const active = (list || []).filter((x) => !x.voidedAt);
  return <div className="au-list">
    <div className="au-list-h"><b>Imzolangan akt sverkalar{list ? " · " + active.length : ""}</b><button className="btn sm" onClick={onUpload}>+ PDF yuklash</button></div>
    {error && <p className="err">{error}</p>}
    {list && !active.length && <p className="fl-note">Hali yuklanmagan. Mijoz bilan imzolangan akt sverka PDFini yuklang — dastur raqamlarni solishtiradi.</p>}
    {active.map((x) => <div key={x.id} className="au-item">
      <div><b>{fmtDate(x.periodFrom)} – {fmtDate(x.periodTo)}</b> <Tag tone={x.matched ? "ok" : "bad"}>{x.matched ? "Mos" : "Farq bor"}</Tag>
        <small>PDF yakuniy: {signed(x.parsed?.closing || 0)} · dasturda (saqlanganda): {signed(x.comparison?.statement?.closing || 0)}{x.note ? " · " + x.note : ""}</small></div>
      <div className="fl-acts">
        <button className="btn sm" onClick={() => openPdf("/finance/acts/" + x.id + "/pdf", x.name).catch((e) => notify(e.message))}>PDF</button>
        {voiding === x.id ? <><input className="au-reason" placeholder="Sabab" value={reason} onChange={(e) => setReason(e.target.value)} /><button className="btn sm" disabled={!reason.trim()} onClick={() => voidAct(x.id)}>OK</button></>
          : <button className="linkbtn" onClick={() => { setVoiding(x.id); setReason(""); }}>Bekor qilish</button>}
      </div></div>)}
  </div>;
}
