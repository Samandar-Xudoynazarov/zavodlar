"use client";
import { show } from "@/lib/i18n";
import { matches } from "@/lib/script";
import { useEffect, useState } from "react";
import { compareTimesheetEmployees } from "@/lib/attendance";
import "./finance-workspace.css";
import { api } from "@/lib/api";
import { today, fmtN } from "@/lib/calc";
import { exportSheets } from "@/lib/xlsx-export";
import { Kpi, Tag, money, short, monthLabel } from "./FinanceUi";
const columns = [
  ["hours", "Soat"],
  ["openingBalance", "Oldingi qoldiq"],
  ["base", "Vaqtbay ish haqi"],
  ["coefficient", "Koeffitsiyent"],
  ["extra", "Qo‘shimcha"],
  ["tripPay", "Xizmat safari"],
  ["gross", "Jami hisoblandi"],
  ["tax", "JShDS (xodimdan)"],
  ["deductions", "Ushlanma"],
  ["net", "Sof maosh"],
  ["cash", "Naqd to‘landi"],
  ["card", "Kartaga to‘landi"],
  ["paid", "Jami to‘landi"],
  ["balance", "Qoldiq"],
  ["social", "Ijtimoiy soliq (zavod)"],
];
const status = { draft: "Qoralama", approved: "Tasdiqlangan", closed: "Yopilgan" };
export default function FinancePayroll({ notify, openForm, onManage, data, canPay = true }) {
  const [onlyDue, setOnlyDue] = useState(false),
    [selected, setSelected] = useState("");
  const [month, setMonth] = useState(() => today().slice(0, 7)),
    [doc, setDoc] = useState(null),
    [months, setMonths] = useState([]),
    [query, setQuery] = useState(""),
    [department, setDepartment] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setDoc(null);
    setError("");
    (async () => {
      try {
        const ms = await api("/hr/months");
        const d = ms.some((m) => m.month === month) ? await api("/hr/months/" + month) : null;
        if (live) {
          setMonths(ms);
          setDoc(d);
        }
      } catch (e) {
        if (live) setError(e.message);
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [month, refresh]);
  // Ijtimoiy soliq: ish beruvchi to'laydi, hisoblangan oylikdan foiz. Sof maosh hisobi o'zgarmaydi.
  const socialRate = doc?.socialTaxRate ?? 12;
  const rows = (doc?.payroll || []).map((p) => ({ ...p, paid: p.cash + p.card, social: Math.round(p.gross * socialRate) / 100 })).sort(compareTimesheetEmployees);
  const departments = [...new Set(rows.map((r) => r.department).filter(Boolean))].sort();
  const visible = rows.filter(
    (r) =>
      (!onlyDue || r.balance > 0) &&
      (!department || r.department === department) &&
      matches([r.name, r.code, r.position, r.department], query),
  );
  const totals = Object.fromEntries(columns.map(([k]) => [k, visible.reduce((s, r) => s + (+r[k] || 0), 0)]));
  const net = rows.reduce((v, r) => v + r.net, 0),
    paid = rows.reduce((v, r) => v + r.paid, 0);
  const due = rows.reduce((v, r) => v + Math.max(r.balance, 0), 0),
    credit = rows.reduce((v, r) => v + Math.max(-r.balance, 0), 0);
  const settled = rows.reduce((v, r) => v + Math.max(0, Math.min(r.paid, r.net + r.openingBalance)), 0);
  const percent = settled + due ? Math.round((100 * settled) / (settled + due)) : 0;
  const employee = visible.find((r) => r.employeeId === selected);
  const gross = rows.reduce((v, r) => v + r.gross, 0), tax = rows.reduce((v, r) => v + r.tax, 0), social = rows.reduce((v, r) => v + r.social, 0);
  function socialTax() {
    openForm({ title: "Ijtimoiy soliq foizi · " + month, description: "Ish beruvchi to‘laydigan soliq. Xodimning sof maoshiga ta’sir qilmaydi. Foizni buxgalteringiz bilan tekshiring.", values: { rate: socialRate },
      fields: [{ name: "rate", label: "Foiz", type: "number", min: 0, step: 0.01, req: true, unit: "%" }],
      onSubmit: async (v) => { await api("/finance/payroll/" + month + "/social-tax", { method: "PUT", body: v }); setRefresh((n) => n + 1); notify("Saqlandi"); } });
  }
  const history = (doc?.payments || [])
    .filter((p) => p.employeeId === employee?.employeeId)
    .sort((a, b) => b.date.localeCompare(a.date));
  function payment(row) {
    const requestId = crypto.randomUUID();
    openForm({
      title: row.name + " · " + month + " uchun to‘lov",
      values: { date: today(), method: "card", kind: "salary", amount: Math.max(0, row.balance) },
      fields: [
        { name: "date", label: "To‘lov sanasi", type: "date", req: true },
        { name: "amount", label: "Summa", type: "number", min: 0.01, step: 0.01, req: true },
        {
          name: "method",
          label: "To‘lov usuli",
          type: "select",
          options: [
            ["cash", "Naqd"],
            ["card", "Bank kartasi"],
          ],
        },
        {
          name: "kind",
          label: "To‘lov turi",
          type: "select",
          options: [
            ["advance", "Avans"],
            ["salary", "Oylik"],
          ],
        },
        { name: "note", label: "Izoh", wide: true },
      ],
      onSubmit: async (v) => {
        await api("/hr/months/" + month + "/payments", {
          method: "POST",
          body: { ...v, employeeId: row.employeeId, version: doc.version, requestId },
        });
        setRefresh((n) => n + 1);
        notify("To‘lov saqlandi");
      },
    });
  }
  async function excel() {
    setBusy(true);
    try {
      await exportSheets({
        filename: "Moliyaviy_oylik_" + month + ".xlsx",
        company: data.settings?.company,
        sheets: [
          {
            name: "Oylik",
            title: "Barcha xodimlar oylik vedomosti · " + month,
            subtitle: status[doc.status] + " · JShDS " + doc.taxRate + "% · Ijtimoiy soliq " + socialRate + "%",
            columns: [
              { key: "code", header: "Tabel №", width: 12 },
              { key: "name", header: "F.I.Sh.", width: 30 },
              { key: "department", header: "Bo‘lim", width: 22 },
              ...columns.map(([key, header]) => ({
                key,
                header,
                type: key === "hours" ? "num" : "money",
                total: "sum",
                width: 20,
              })),
            ],
            rows: visible,
          },
        ],
      });
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  }
  const facts = [["hours", "Soat", 0], ["openingBalance", "Oldingi qoldiq"], ["base", "Vaqtbay ish haqi"], ["coefficient", "Koeffitsiyent"], ["extra", "Qo‘shimcha"], ["tripPay", "Xizmat safari"], ["gross", "Jami hisoblandi"], ["tax", "JShDS"], ["deductions", "Ushlanma"], ["net", "Sof maosh"], ["cash", "Naqd"], ["card", "Kartaga"], ["social", "Ijtimoiy soliq (zavod)"]];
  return (
    <section className="sheet finance-module fl pay-register">
      <div className="fl-top">
        <div><h2>Oylik · {monthLabel(month)}</h2><p>{doc ? status[doc.status] + " · " + doc.normHours + " soat norma · xodimlar tabel raqami bo‘yicha" : "Hisob oyini tanlang"}</p></div>
        <div className="fl-acts">
          {doc && <Tag tone={doc.status === "draft" ? "sig" : "acc"}>{status[doc.status]}</Tag>}
          <label className="fl-form" style={{ gap: 2 }}><span className="fl-note">Hisob oyi</span><input type="month" value={month} onChange={(e) => { if (e.target.value) { setMonth(e.target.value); setSelected(""); } }} /></label>
          <button className="btn" disabled={busy || !visible.length} onClick={excel}>Excel yuklash</button>
        </div>
      </div>
      {error && <p role="alert" className="err">{error} <button className="btn" onClick={() => setRefresh((n) => n + 1)}>Yangilash</button></p>}
      {loading ? <p role="status">Oylik ma’lumotlari yuklanmoqda…</p> : doc ? <>
        <div className="fl-kpis">
          <Kpi label="Hisoblandi" value={short(gross)} sub={rows.length + " xodim"} />
          <Kpi label={"Ushlangan JShDS " + doc.taxRate + "%"} value={short(tax)} sub="xodimdan" />
          <Kpi label={"Ijtimoiy soliq " + socialRate + "%"} value={short(social)} sub={<>zavod to‘laydi · {doc.status !== "closed" && <button className="linkbtn" onClick={socialTax}>foizni o‘zgartirish</button>}</>} />
          <Kpi tone="sig" label="To‘lanmagan" value={short(due)} sub={rows.filter((r) => r.balance > 0).length + " xodim · to‘langan " + percent + "%"} />
        </div>
        {credit > 0 && <p className="fl-note">Ortiqcha to‘langan: {money(credit)} so‘m (keyingi oyga o‘tadi).</p>}
        <div className="fl-acts">
          <input className="fl-search" style={{ flex: "1 1 220px", margin: 0 }} type="search" aria-label="Xodim qidirish" placeholder="Xodim yoki tabel raqami" value={query} onChange={(e) => setQuery(e.target.value)} />
          <button className="btn" aria-pressed={!onlyDue} onClick={() => setOnlyDue(false)}>Barchasi</button>
          <button className="btn" aria-pressed={onlyDue} onClick={() => setOnlyDue(true)}>Qoldig‘i borlar</button>
          <select aria-label="Bo‘lim" value={department} onChange={(e) => setDepartment(e.target.value)}><option value="">Barcha bo‘limlar</option>{departments.map((d) => <option key={d}>{d}</option>)}</select>
        </div>
        <div className="fl-people">
          {visible.map((row) => {
            const owed = row.net + row.openingBalance, open = employee === row;
            return <div key={row.employeeId} style={{ display: "grid", gap: 6 }}>
              <button className="fl-person" aria-expanded={open} onClick={() => setSelected(open ? "" : row.employeeId)}>
                <span className="no">{row.code || "—"}</span>
                <div><b>{show(row.name)}</b><small>{[row.position, row.department].filter(Boolean).join(" · ")} · {fmtN(row.hours, 2)} soat{row.missingRates?.length ? " · Maosh belgilanmagan" : ""}</small></div>
                <div className="bar"><div className="fl-pipe"><i className="fl-c1" style={{ width: (owed > 0 ? Math.min(100, (row.paid / owed) * 100) : 100) + "%" }} /></div><small>{money(row.paid)} / {money(owed)} to‘landi</small></div>
                <span className="fl-money" style={{ fontWeight: 700, color: row.balance > 0 ? "var(--signal)" : row.balance < 0 ? "var(--accent)" : "var(--ok)" }}>{row.balance > 0 ? money(row.balance) : row.balance < 0 ? "Ortiqcha " + money(-row.balance) : "To‘langan"}</span>
              </button>
              {open && <article className="fl-card">
                <div className="fl-dh"><div><h3>{show(row.name)}</h3><small>To‘lov tarixi · {month}</small></div>
                  {canPay && <button className="btn primary" disabled={doc.status === "closed"} onClick={() => payment(row)}>+ To‘lov kiritish</button>}</div>
                <div className="fl-breakdown">{facts.map(([k, l, d = 2]) => <div className="fl-fact" key={k}><span>{l}</span><b>{fmtN(row[k], d)}</b></div>)}</div>
                {history.length ? <ul className="fl-tl">{history.map((p) => <li key={p.id} className={p.voidedAt ? "void" : ""}><time>{p.date}</time><span className="fl-dot receipt" aria-hidden="true">₮</span>
                  <div><b style={{ fontWeight: 600 }}>{p.kind === "advance" ? "Avans" : "Oylik to‘lovi"} · {p.method === "cash" ? "Naqd" : "Kartaga"}{p.voidedAt ? " · Bekor qilingan" : ""}</b>{p.note && <small>{show(p.note)}</small>}</div>
                  <span className="fl-money fl-plus">{money(p.amount)}</span></li>)}</ul> : <p className="fl-note">Bu oy uchun to‘lov kiritilmagan.</p>}
              </article>}
            </div>;
          })}
        </div>
        {!visible.length && <p className="fl-empty">Tanlangan filtr bo‘yicha xodim yo‘q.</p>}
        <p className="fl-note">Jami: hisoblandi {money(totals.gross)} · JShDS {money(totals.tax)} · sof {money(totals.net)} · to‘landi {money(totals.paid)} · qoldiq {money(totals.balance)} · ijtimoiy soliq {money(totals.social)}.</p>
      </> : !error && <p className="fl-empty">Bu oy uchun hisob hali ochilmagan.</p>}
      <div className="fl-acts">
        <button className="btn" onClick={onManage}>Hisoblash va oy boshqaruvi</button>
        <select aria-label="Saqlangan oylar" value={months.some((m) => m.month === month) ? month : ""} onChange={(e) => e.target.value && setMonth(e.target.value)}>
          <option value="">Saqlangan oylar</option>
          {months.map((m) => <option key={m.month} value={m.month}>{m.month} · {status[m.status]}</option>)}
        </select>
      </div>
    </section>
  );
}
