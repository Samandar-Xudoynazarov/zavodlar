"use client";
// Kuzatuvchi markazi: barcha zavodlar bir ekranda, faqat miqdorlar (pul yo'q). Zavodni bosib — tafsilot.
import { useState } from "react";
import { useT } from "@/lib/i18n";
import { fmt, fmtN } from "@/lib/calc";
import { useLoad } from "./FinanceUi";
import { FactoryPulse, PlanScale, Signals, Trend, dm, pctText } from "./PulseParts";
import TelegramConnect from "./TelegramConnect";

export default function ObserverCenter({ user, notify, onOpenFactory }) {
  const t = useT();
  const scoped = Boolean(user?.factoryId);
  const [open, setOpen] = useState(null);
  const all = useLoad(scoped ? null : "/pulse/all");
  const one = useLoad(scoped ? "/pulse" : open ? `/pulse?id=${open}` : null, [open]);

  if (scoped || open) {
    const p = one.data;
    return (
      <div className="ld-page">
        {!scoped && <button className="btn ld-back" onClick={() => setOpen(null)}>← {t("Barcha zavodlar")}</button>}
        {one.error ? <div className="empty">{one.error}</div> : !p || (open && p.factory.id !== open) ? <div className="loading">{t("Yuklanmoqda…")}</div> : (
          <>
            <header className="ld-hero">
              <span className="ld-eyebrow">{p.factory.name} · {t("oylik reja")} {pctText(p.month.planPct)}</span>
              <h2>{p.signals.find((s) => s.kind !== "approvals") ? t(p.signals.find((s) => s.kind !== "approvals").text) : t("Bu zavodda diqqat talab qiladigan holat yo'q")}</h2>
              {onOpenFactory && <button className="btn" onClick={() => onOpenFactory(p.factory.id)}>{t("Zavod bo'limlarini ochish")}</button>}
            </header>
            {scoped && <TelegramConnect user={user} notify={notify} />}
            <FactoryPulse p={p} observer />
          </>
        )}
      </div>
    );
  }

  const d = all.data;
  if (all.error) return <section className="sheet"><div className="empty">{all.error}</div></section>;
  if (!d) return <section className="sheet"><div className="loading">{t("Yuklanmoqda…")}</div></section>;
  const byId = new Map(d.factories.map((p) => [p.factory.id, p]));
  const ranked = d.ranking.map((id) => byId.get(id));
  const reds = d.factories.flatMap((p) => p.signals.filter((s) => s.level === "red").map((s) => ({ ...s, text: `${p.factory.name}: ${t(s.text)}`, fid: p.factory.id })));
  const T = d.total;
  return (
    <div className="ld-page">
      <header className="ld-hero">
        <span className="ld-eyebrow">{t("{n} ta zavod", { n: d.factories.length })} · {dm(d.today)} · {t("faqat miqdorlar")}</span>
        <h2>{d.headline}</h2>
      </header>
      <div className="ld-kpis ld-card">
        <div className="ld-kpi"><span className="k">{t("Oylik reja (jami)")}</span><strong className={T.planPct < 80 ? "bad" : T.planPct < 95 ? "sig" : "ok"}>{pctText(T.planPct)}</strong><small>{fmt(T.fact)} / {fmt(T.planToDate)}</small></div>
        <div className="ld-kpi"><span className="k">{t("Kecha")}</span><strong>{fmt(T.yesterdayFact)}</strong><small>{t("reja {n}", { n: fmt(T.yesterdayPlan) })}</small></div>
        <div className="ld-kpi"><span className="k">{t("Brak (oy)")}</span><strong className={T.brakPct >= 4 ? "bad" : T.brakPct >= 2 ? "sig" : ""}>{T.brakPct === null ? "—" : `${fmtN(T.brakPct, 1)}%`}</strong><small>{t("barcha zavodlar")}</small></div>
        <div className="ld-kpi"><span className="k">{t("Kechikadigan buyurtma")}</span><strong className={T.lateOrders ? "bad" : "ok"}>{T.lateOrders}</strong><small>{T.notReported ? t("{n} ta zavod kechagi hisobotni topshirmagan", { n: T.notReported }) : t("hisobotlar topshirilgan")}</small></div>
      </div>

      <div className="ld-rank">
        {ranked.map((p, i) => (
          <button key={p.factory.id} className={`ld-fac ${p.status}`} onClick={() => setOpen(p.factory.id)}>
            <span className="ld-fac-top">
              <span className="ld-place">{i + 1}</span>
              <span className="ld-fac-name">{p.factory.name}<small>{p.factory.kind === "metall" ? t("metall") : t("temir-beton")}</small></span>
              <strong className="ld-fac-pct">{pctText(p.month.planPct)}</strong>
            </span>
            <PlanScale pct={p.month.planPct} />
            <span className="ld-fac-line">
              <span>{t("Kecha")} {dm(p.yesterday.date)}: <b>{p.yesterday.reported ? `${fmt(p.yesterday.fact)} / ${fmt(p.yesterday.plan)}` : t("hisobot yo'q")}</b></span>
              <span>{t("brak")} <b>{p.month.brakPct === null ? "—" : `${fmtN(p.month.brakPct, 1)}%`}</b></span>
            </span>
            <Trend data={p.trend} />
            <Signals list={p.signals} limit={3} />
          </button>
        ))}
      </div>

      <div className="ld-grid">
        <section className="ld-card">
          <h3>{t("Qizil signallar")} {reds.length > 0 && <span className="ld-count">{reds.length}</span>}</h3>
          <Signals list={reds} limit={12} />
        </section>
        <TelegramConnect user={user} notify={notify} />
      </div>
    </div>
  );
}
