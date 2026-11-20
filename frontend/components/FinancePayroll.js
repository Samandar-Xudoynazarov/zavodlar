"use client";
import { useEffect, useState } from "react";
import { compareTimesheetEmployees } from "@/lib/attendance";
import "./finance-workspace.css";
import { api } from "@/lib/api";
import { today, fmtN } from "@/lib/calc";
import { exportSheets } from "@/lib/xlsx-export";
const columns = [
  ["hours", "Soat"],
  ["openingBalance", "Oldingi qoldiq"],
  ["base", "Vaqtbay ish haqi"],
  ["coefficient", "Koeffitsiyent"],
  ["extra", "Qo‘shimcha"],
  ["tripPay", "Xizmat safari"],
  ["gross", "Jami hisoblandi"],
  ["tax", "Soliq"],
  ["deductions", "Ushlanma"],
  ["net", "Sof maosh"],
  ["cash", "Naqd to‘landi"],
  ["card", "Kartaga to‘landi"],
  ["paid", "Jami to‘landi"],
  ["balance", "Qoldiq"],
];
const status = { draft: "Qoralama", approved: "Tasdiqlangan", closed: "Yopilgan" };
export default function FinancePayroll({ notify, openForm, onManage, data, canPay = true }) {
  const [details, setDetails] = useState(false),
    [onlyDue, setOnlyDue] = useState(false),
    [selected, setSelected] = useState("");
  const shownColumns = details ? columns : columns.filter(([k]) => ["net", "paid", "balance"].includes(k));
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
  const rows = (doc?.payroll || []).map((p) => ({ ...p, paid: p.cash + p.card })).sort(compareTimesheetEmployees);
  const departments = [...new Set(rows.map((r) => r.department).filter(Boolean))].sort();
  const visible = rows.filter(
    (r) =>
      (!onlyDue || r.balance > 0) &&
      (!department || r.department === department) &&
      [r.name, r.code, r.position, r.department].join(" ").toLowerCase().includes(query.trim().toLowerCase()),
  );
  const totals = Object.fromEntries(columns.map(([k]) => [k, visible.reduce((s, r) => s + (+r[k] || 0), 0)]));
  const net = rows.reduce((v, r) => v + r.net, 0),
    paid = rows.reduce((v, r) => v + r.paid, 0);
  const due = rows.reduce((v, r) => v + Math.max(r.balance, 0), 0),
    credit = rows.reduce((v, r) => v + Math.max(-r.balance, 0), 0);
  const settled = rows.reduce((v, r) => v + Math.max(0, Math.min(r.paid, r.net + r.openingBalance)), 0);
  const percent = settled + due ? Math.round((100 * settled) / (settled + due)) : 0;
  const employee = visible.find((r) => r.employeeId === selected);
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
            subtitle: status[doc.status],
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
  return (
    <section className="sheet finance-module pay-register">
      <header className="finance-heading">
        <h2>Oylik hisob-kitobi</h2>
        <label>
          Hisob oyi{" "}
          <input
            type="month"
            value={month}
            onChange={(e) => {
              if (e.target.value) {
                setMonth(e.target.value);
                setSelected("");
              }
            }}
          />
        </label>
      </header>
      {error && (
        <p role="alert" className="err">
          {error}{" "}
          <button className="btn" onClick={() => setRefresh((n) => n + 1)}>
            Yangilash
          </button>
        </p>
      )}
      {loading ? (
        <p role="status">Oylik ma’lumotlari yuklanmoqda…</p>
      ) : doc ? (
        <>
          <div className="pay-summary">
            <div>
              <span>Qo‘lga tegadigan oylik</span>
              <strong>
                {fmtN(net, 2)} <small>so‘m</small>
              </strong>
            </div>
            <div>
              <span>Jami to‘langan</span>
              <strong>
                {fmtN(paid, 2)} <small>so‘m</small>
              </strong>
            </div>
            <div>
              <span>To‘lanadigan qoldiq</span>
              <strong>
                {fmtN(due, 2)} <small>so‘m</small>
              </strong>
            </div>
            <div
              className="pay-progress"
              role="meter"
              aria-label="Qoplangan ulush, oldingi qoldiq bilan"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <i style={{ width: percent + "%" }} />
            </div>
            <small className="pay-legend">
              To‘langan {percent}% · Qoldiq oldingi oy bilan
              {credit > 0 ? " · Ortiqcha to‘langan: " + fmtN(credit, 2) + " so‘m" : ""}
            </small>
          </div>
          <div className="finance-toolbar">
            <input
              type="search"
              aria-label="Xodim qidirish"
              placeholder="Xodim yoki tabel raqami"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button className="btn" aria-pressed={!onlyDue} onClick={() => setOnlyDue(false)}>
              Barchasi
            </button>
            <button className="btn" aria-pressed={onlyDue} onClick={() => setOnlyDue(true)}>
              Qoldig‘i borlar
            </button>
            <select aria-label="Bo‘lim" value={department} onChange={(e) => setDepartment(e.target.value)}>
              <option value="">Barcha bo‘limlar</option>
              {departments.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
            <button className="btn" disabled={busy || !visible.length} onClick={excel}>
              Excel yuklash
            </button>
          </div>
          <div className="finance-table-note">
            <span>
              {visible.length} xodim · {status[doc.status]} · {doc.normHours} soat
            </span>
            <label>
              <input type="checkbox" checked={details} onChange={(e) => setDetails(e.target.checked)} /> Batafsil
              hisob-kitob
            </label>
          </div>
          <div className="tbl-wrap">
            <table className="finance-table finance-payroll">
              <thead>
                <tr>
                  <th>Tabel №</th>
                  <th>Xodim</th>
                  {shownColumns.map(([k, h]) => (
                    <th className="n" key={k}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr
                    key={row.employeeId}
                    className={employee === row ? "finance-selected" : ""}
                    onClick={() => setSelected(row.employeeId)}
                  >
                    <td>{row.code || "—"}</td>
                    <td>
                      <button
                        className="linkbtn"
                        onClick={() => setSelected(row.employeeId)}
                        aria-expanded={employee === row}
                      >
                        {row.name}
                      </button>
                      <small>
                        {row.position}
                        {row.missingRates?.length ? " · Maosh belgilanmagan" : ""}
                      </small>
                    </td>
                    {shownColumns.map(([k]) => (
                      <td key={k} className={"n " + (k === "balance" && row.balance > 0 ? "pay-due" : "")}>
                        {fmtN(row[k], 2)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan="2">Jami · {visible.length} xodim</th>
                  {shownColumns.map(([k]) => (
                    <td key={k} className="n">
                      {fmtN(totals[k], 2)}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
          {!visible.length && <p className="empty">Tanlangan filtr bo‘yicha xodim yo‘q.</p>}
          {employee && (
            <article className="pay-history">
              <header className="finance-heading">
                <div>
                  <h3>{employee.name}</h3>
                  <span>To‘lov tarixi · {month}</span>
                </div>
                {canPay && (
                  <button
                    className="btn primary"
                    disabled={doc.status === "closed"}
                    onClick={() => payment(employee)}
                  >
                    + To‘lov kiritish
                  </button>
                )}
              </header>
              {history.length ? (
                <ul>
                  {history.map((p) => (
                    <li key={p.id}>
                      <time>{p.date}</time>
                      <span>
                        {p.kind === "advance" ? "Avans" : "Oylik to‘lovi"} ·{" "}
                        {p.method === "cash" ? "Naqd" : "Kartaga"}
                        {p.voidedAt ? " · Bekor qilingan" : ""}
                        {p.note && <small>{p.note}</small>}
                      </span>
                      <strong>{fmtN(p.amount, 2)} so‘m</strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Bu oy uchun to‘lov kiritilmagan.</p>
              )}
            </article>
          )}
        </>
      ) : (
        !error && <p className="empty">Bu oy uchun hisob hali ochilmagan.</p>
      )}
      <footer className="finance-toolbar">
        <button className="btn" onClick={onManage}>
          Hisoblash va oy boshqaruvi
        </button>
        <select
          aria-label="Saqlangan oylar"
          value={months.some((m) => m.month === month) ? month : ""}
          onChange={(e) => e.target.value && setMonth(e.target.value)}
        >
          <option value="">Saqlangan oylar</option>
          {months.map((m) => (
            <option key={m.month} value={m.month}>
              {m.month} · {status[m.status]}
            </option>
          ))}
        </select>
      </footer>
    </section>
  );
}
