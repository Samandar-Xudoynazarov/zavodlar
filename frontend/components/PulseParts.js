"use client";
// Bosh panel bo'laklari: zavod pulsi (reja shkalasi, 25 kunlik grafik, signallar, ombor, buyurtmalar, pul).
// Kuzatuvchi markazi va direktor bosh sahifasi shularni ishlatadi.
import { useT, show } from "@/lib/i18n";
import { fmt, fmtN, fmtDate } from "@/lib/calc";
import "./leader.css";

export const dm = (d) => (d ? `${d.slice(8, 10)}.${d.slice(5, 7)}` : "—");
export const pctText = (p) => (p === null || p === undefined ? "—" : `${fmtN(p, 1)}%`);
const tone = (p) => (p === null || p === undefined ? "" : p < 80 ? "bad" : p < 95 ? "sig" : "ok");
export const mln = (x) => fmtN(Math.round((+x || 0) / 1e5) / 10, 1);

/** Oylik reja shkalasi: fakt / bugungacha reja, 100% belgisi */
export function PlanScale({ pct }) {
  const v = pct === null || pct === undefined ? 0 : Math.min(130, pct);
  return (
    <div className="ld-scale" aria-hidden>
      <span className={`ld-scale-fill ${tone(pct)}`} style={{ width: `${(v / 130) * 100}%` }} />
      <span className="ld-scale-mark" style={{ left: `${(100 / 130) * 100}%` }} />
    </div>
  );
}

/** So'nggi 25 kun: ustun — fakt, chiziqcha — reja */
export function Trend({ data, height = 44 }) {
  const t = useT();
  const max = Math.max(1, ...data.map((d) => Math.max(d.fact, d.plan)));
  const w = 100 / data.length;
  return (
    <svg className="ld-trend" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" role="img" aria-label={t("So'nggi 25 kun: fakt va reja")} style={{ height }}>
      {data.map((d, i) => {
        const h = (d.fact / max) * (height - 2);
        const ph = (d.plan / max) * (height - 2);
        const low = d.plan > 0 && d.fact < d.plan * 0.9;
        return (
          <g key={d.date}>
            <title>{`${dm(d.date)} · ${t("fakt")} ${fmt(d.fact)} / ${t("reja")} ${fmt(d.plan)}`}</title>
            <rect x={i * w + w * 0.15} y={height - h} width={w * 0.7} height={Math.max(h, d.fact ? 0.8 : 0)} className={low ? "low" : "ok"} />
            {d.plan > 0 && <rect x={i * w} y={height - ph - 0.4} width={w} height={0.8} className="plan" />}
          </g>
        );
      })}
    </svg>
  );
}

export function Signals({ list, limit = 6 }) {
  const t = useT();
  if (!list?.length) return <div className="ld-calm">{t("Hammasi joyida — diqqat talab qiladigan holat yo'q")}</div>;
  return (
    <ul className="ld-signals">
      {list.slice(0, limit).map((s, i) => (
        <li key={i} className={s.level}>
          <span className="dot" />
          {t(s.text)}
        </li>
      ))}
    </ul>
  );
}

function StockList({ stock }) {
  const t = useT();
  if (!stock.length) return <div className="ld-calm">{t("Sarf ma'lumoti yo'q")}</div>;
  return (
    <ul className="ld-stock">
      {stock.slice(0, 8).map((m) => (
        <li key={m.id} className={`lv-${m.level}`}>
          <span className="nm">{show(m.name)}</span>
          <span className="bar"><span style={{ width: `${Math.min(100, ((m.daysLeft ?? 30) / 30) * 100)}%` }} /></span>
          <strong>{m.daysLeft === null ? "—" : t("{n} kun", { n: m.daysLeft })}</strong>
          <small>{fmtN(m.qty, 1)} {m.unit}</small>
        </li>
      ))}
    </ul>
  );
}

function OrderList({ orders }) {
  const t = useT();
  const list = [...orders.late.map((o) => ({ ...o, lv: "red" })), ...orders.risk.map((o) => ({ ...o, lv: "amber" }))];
  if (!list.length) return <div className="ld-calm">{t("Barcha buyurtmalar muddatga ulguradi")}</div>;
  return (
    <ul className="ld-orders">
      {list.slice(0, 8).map((o, i) => (
        <li key={i} className={o.lv}>
          <span className="no">№{o.no ?? "—"}</span>
          <span className="nm">{show(o.customer)}<small>{o.product} · {t("qoldi {n}", { n: fmt(o.remaining) })}</small></span>
          <span className="dl">
            {t("muddat")} {dm(o.deadline)}
            {o.lateDays > 0 && <small>{t("{n} kun kechikadi", { n: o.lateDays })}</small>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Bitta zavodning to'liq pulsi (direktor sahifasi va kuzatuvchi tafsiloti) */
export function FactoryPulse({ p, onOpenTab, observer = false }) {
  const t = useT();
  const signals = observer ? p.signals.filter((s) => s.kind !== "approvals") : p.signals;
  const y = p.yesterday, d = p.day, m = p.month;
  return (
    <div className="ld-grid">
      <section className="ld-card ld-span2">
        <div className="ld-kpis">
          <div className="ld-kpi">
            <span className="k">{t("Bugun")} · {dm(p.today)}</span>
            <strong>{d.reported ? `${fmt(d.fact)} / ${fmt(d.plan)}` : t("hisobot yo'q")}</strong>
            <small>{d.reported ? t("fakt / reja") : d.plan ? t("reja: {n}", { n: fmt(d.plan) }) : ""}</small>
          </div>
          <div className="ld-kpi">
            <span className="k">{t("Kecha")} · {dm(y.date)}</span>
            <strong className={tone(y.planPct)}>{pctText(y.planPct)}</strong>
            <small>{fmt(y.fact)} / {fmt(y.plan)}{y.brakPct !== null ? ` · ${t("brak")} ${fmtN(y.brakPct, 1)}%` : ""}</small>
          </div>
          <div className="ld-kpi">
            <span className="k">{t("Oylik reja")}</span>
            <strong className={tone(m.planPct)}>{pctText(m.planPct)}</strong>
            <small>{t("fakt {a} / bugungacha reja {b}", { a: fmt(m.fact), b: fmt(m.planToDate) })}</small>
          </div>
          <div className="ld-kpi">
            <span className="k">{t("Oy bo'yicha brak")}</span>
            <strong className={m.brakPct >= 4 ? "bad" : m.brakPct >= 2 ? "sig" : ""}>{m.brakPct === null ? "—" : `${fmtN(m.brakPct, 1)}%`}</strong>
            <small>{fmt(m.brak)} {t("dona")}</small>
          </div>
        </div>
        <PlanScale pct={m.planPct} />
        <div className="ld-trend-wrap">
          <span className="k">{t("So'nggi 25 kun")}</span>
          <Trend data={p.trend} height={70} />
          <div className="ld-legend"><span className="ok" />{t("fakt")} <span className="low" />{t("rejadan kam")} <span className="plan" />{t("reja")}</div>
        </div>
      </section>

      <section className="ld-card">
        <h3>{t("Diqqat")}</h3>
        <Signals list={signals} />
      </section>

      {p.money && (
        <section className="ld-card ld-money">
          <h3>{t("Pul")} <small>{t("faqat direktor ko'radi")}</small></h3>
          <div className="ld-money-grid">
            <div><span className="k">{t("Oy tushumi")}</span><strong>{mln(p.money.month.revenue)}</strong><small>{t("mln so'm")}</small></div>
            <div><span className="k">{t("Oy foydasi")}</span><strong className={p.money.month.profit < 0 ? "bad" : "ok"}>{mln(p.money.month.profit)}</strong><small>{p.money.month.complete ? t("mln so'm") : t("oylik hali kiritilmagan")}</small></div>
            <div><span className="k">{t("Mijozlar qarzi")}</span><strong>{mln(p.money.receivable)}</strong><small>{t("mln so'm")}</small></div>
            <div><span className="k">{t("Kassa va bank")}</span><strong>{mln(p.money.cash.total)}</strong><small>{p.money.cash.accounts ? t("mln so'm") : t("hisob ochilmagan")}</small></div>
          </div>
          {onOpenTab && <button className="btn" onClick={() => onOpenTab("pl")}>{t("Foyda va zararni ochish")}</button>}
        </section>
      )}

      {!observer && <section className="ld-card">
        <h3>{t("Tasdiq kutmoqda")} {p.approvals.total > 0 && <span className="ld-count">{p.approvals.total}</span>}</h3>
        {!p.approvals.total ? <div className="ld-calm">{t("Hech narsa kutmayapti")}</div> : (
          <ul className="ld-approvals">
            {p.approvals.days.map((date) => (
              <li key={date}><span>{t("Kunlik hisobot")} · {fmtDate(date)}</span>{onOpenTab && <button className="btn sm" onClick={() => onOpenTab("day", date)}>{t("Ko'rish")}</button>}</li>
            ))}
            {p.approvals.inventories > 0 && <li><span>{t("Inventarizatsiya: {n} ta", { n: p.approvals.inventories })}</span>{onOpenTab && <button className="btn sm" onClick={() => onOpenTab("inv")}>{t("Ko'rish")}</button>}</li>}
            {p.approvals.workforce > 0 && <li><span>{t("Kadrlar qarori: {n} ta", { n: p.approvals.workforce })}</span>{onOpenTab && <button className="btn sm" onClick={() => onOpenTab("hr-overview")}>{t("Ko'rish")}</button>}</li>}
          </ul>
        )}
      </section>}

      <section className="ld-card">
        <h3>{t("Xomashyo necha kunga yetadi")}</h3>
        <StockList stock={p.stock} />
      </section>

      <section className="ld-card">
        <h3>{t("Buyurtmalar")} <small>{t("{n} ta faol", { n: p.orders.active })}</small></h3>
        <OrderList orders={p.orders} />
      </section>
    </div>
  );
}
