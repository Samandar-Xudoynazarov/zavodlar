"use client";
// Zavod direktori bosh sahifasi: bugun, oy rejasi, signallar, tasdiqlar, ombor, buyurtmalar va pul (faqat ruxsat bo'lsa).
import { useT } from "@/lib/i18n";
import { useLoad } from "./FinanceUi";
import { FactoryPulse, pctText } from "./PulseParts";
import TelegramConnect from "./TelegramConnect";

export default function DirectorHome({ user, factory, notify, onOpenTab, version }) {
  const t = useT();
  const { data: p, error, loading, reload } = useLoad("/pulse", [factory?.id, version]);
  if (error) return <section className="sheet"><div className="empty">{error} <button className="btn sm" onClick={reload}>{t("Qayta urinish")}</button></div></section>;
  if (!p) return <section className="sheet"><div className="loading">{t("Yuklanmoqda…")}</div></section>;
  const red = p.signals.filter((s) => s.level === "red");
  const headline = red[0]?.text ? t(red[0].text) : p.month.planPct !== null && p.month.planPct >= 95 ? t("Oylik reja bo'yicha ketmoqdasiz") : p.signals[0] ? t(p.signals[0].text) : t("Bugun diqqat talab qiladigan holat yo'q");
  return (
    <div className={`ld-page${loading ? " is-loading" : ""}`}>
      <header className="ld-hero">
        <span className="ld-eyebrow">{p.factory.name} · {t("oylik reja")} {pctText(p.month.planPct)}</span>
        <h2>{headline}</h2>
      </header>
      <FactoryPulse p={p} onOpenTab={onOpenTab} />
      <TelegramConnect user={user} notify={notify} />
    </div>
  );
}
