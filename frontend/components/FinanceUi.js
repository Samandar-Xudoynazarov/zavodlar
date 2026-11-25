"use client";
// Moliya bo'limi uchun umumiy kichik bo'laklar: summa formati, holat belgilari, KPI kartochka, «pul yo'li» chizig'i.
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { fmtN } from "@/lib/calc";
import "./finance-ledger.css";

export const money = (n) => fmtN(Math.round((+n || 0) * 100) / 100, 2);
/** Qisqa summa: 1 250 mln, 2,35 mlrd */
export function short(n) {
  const v = Math.abs(+n || 0), sign = n < 0 ? "−" : "";
  if (v >= 1e9) return sign + (v / 1e9).toFixed(2).replace(".", ",") + " mlrd";
  if (v >= 1e6) return sign + fmtN(Math.round(v / 1e5) / 10, 1) + " mln";
  return sign + fmtN(Math.round(v), 0);
}
export const MONTHS = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"];
export const monthLabel = (m) => (m ? MONTHS[+m.slice(5, 7) - 1] + " " + m.slice(0, 4) : "");
export const shiftMonth = (m, d) => { const [y, mo] = m.split("-").map(Number); const t = new Date(Date.UTC(y, mo - 1 + d, 1)); return t.toISOString().slice(0, 7); };
export const monthEndDate = (m) => { const [y, mo] = m.split("-").map(Number); return m + "-" + String(new Date(Date.UTC(y, mo, 0)).getUTCDate()).padStart(2, "0"); };
export const ddmm = (d) => (d ? d.slice(8, 10) + "." + d.slice(5, 7) + "." + d.slice(2, 4) : "—");

export const STATUS = {
  overdue: ["bad", "Muddati o‘tgan"],
  waiting: ["sig", "To‘lov kutilmoqda"],
  advance: ["acc", "Avans"],
  closed: ["ok", "Yopilgan"],
};
export const Tag = ({ tone, children }) => <span className={"fl-tag " + tone}>{children}</span>;
export const Kpi = ({ label, value, sub, tone = "" }) => (
  <div className={"fl-kpi " + tone}><span>{label}</span><strong>{value}</strong>{sub != null && <small>{sub}</small>}</div>
);
/** Pul yo'li: to'langan (yashil), jo'natilgan/fakturalangan lekin to'lanmagan (sariq), qolgani — kulrang */
export function Pipe({ total, done, paid }) {
  const t = Math.max(total, done, paid, 1);
  return <div className="fl-pipe" aria-hidden="true"><i className="fl-c1" style={{ width: (Math.min(paid, done || paid) / t) * 100 + "%" }} /><i className="fl-c3" style={{ width: (Math.max(0, done - paid) / t) * 100 + "%" }} /></div>;
}
export const Legend = ({ items = [["fl-c1", "To‘langan"], ["fl-c3", "Jo‘natilgan, to‘lanmagan"], ["", "Hali jo‘natilmagan"]] }) => (
  <div className="fl-legend">{items.map(([c, l]) => <span key={l}><i className={c} style={c ? undefined : { background: "var(--line)" }} />{l}</span>)}</div>
);

/** GET so'rovi: { data, error, loading, reload } */
export function useLoad(path, deps = []) {
  const [state, setState] = useState({ data: null, error: "", loading: true });
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!path) return;
    let live = true;
    setState((s) => ({ ...s, loading: true, error: "" }));
    api(path).then((data) => live && setState({ data, error: "", loading: false })).catch((e) => live && setState((s) => ({ ...s, error: e.message, loading: false })));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, n, ...deps]);
  return { ...state, reload: () => setN((x) => x + 1) };
}
