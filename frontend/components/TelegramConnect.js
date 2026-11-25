"use client";
// Bosh paneldagi «Telegramga ulanish» yo'riqnomasi: 3 qadam, havola 10 daqiqa amal qiladi.
// Ulangandan keyin kichik qatorga aylanadi: «Ulangan: @username · Uzish».
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import "./leader.css";

export const TELEGRAM_ROLES = ["kuzatuvchi", "rahbar"];

export default function TelegramConnect({ user, notify }) {
  const t = useT();
  const [state, setState] = useState(null);
  const [link, setLink] = useState(null);
  const [busy, setBusy] = useState(false);
  const allowed = TELEGRAM_ROLES.includes(user?.role);
  const load = useCallback(async () => {
    try { setState(await api("/notifications/telegram")); } catch { setState({ configured: false, error: true }); }
  }, []);
  useEffect(() => { if (allowed) load(); }, [allowed, load]);
  // havola ochilgandan keyin — ulanishni kutib, har 4 soniyada tekshiramiz (10 daqiqagacha)
  useEffect(() => {
    if (!link || state?.connected) return;
    const id = setInterval(load, 4000);
    const stop = setTimeout(() => clearInterval(id), 10 * 60 * 1000);
    return () => { clearInterval(id); clearTimeout(stop); };
  }, [link, state?.connected, load]);
  if (!allowed || !state) return null;

  async function connect() {
    setBusy(true);
    try {
      const value = await api("/notifications/telegram/link", { method: "POST" });
      setLink(value);
      window.open(value.url, "_blank", "noopener");
    } catch (e) { notify?.(e.message); } finally { setBusy(false); }
  }
  async function disconnect() {
    if (!window.confirm(t("Telegramdan uzasizmi? Ertalabki hisobot kelmay qoladi."))) return; // eslint-disable-line no-alert
    setBusy(true);
    try { await api("/notifications/telegram", { method: "DELETE" }); setLink(null); await load(); } catch (e) { notify?.(e.message); } finally { setBusy(false); }
  }

  if (state.connected) {
    return (
      <div className="ld-tg ld-tg-ok">
        <span className="ld-tg-ico" aria-hidden>✓</span>
        <span>{t("Telegram ulangan")}{state.username ? ` · @${state.username}` : ""}. {t("Har kuni ertalab soat 8:00 da hisobot keladi. Botga /hisobot yozsangiz — hozirgi holat.")}</span>
        <button type="button" className="btn sm" disabled={busy} onClick={disconnect}>{t("Uzish")}</button>
      </div>
    );
  }
  return (
    <section className="ld-tg">
      <div className="ld-tg-head">
        <span className="ld-tg-ico" aria-hidden>✈</span>
        <div>
          <h3>{t("Hisobotni Telegramda oling")}</h3>
          <p>{user.role === "rahbar" ? t("Har kuni ertalab 8:00 da: kechagi reja va fakt, brak, pul, qarz va tasdiq kutayotganlar.") : t("Har kuni ertalab 8:00 da: barcha zavodlar reja bo'yicha, brak, ombor va kechikayotgan buyurtmalar. Pul ko'rsatilmaydi.")}</p>
        </div>
      </div>
      {!state.configured ? (
        <p className="ld-tg-warn">{t("Telegram bot hali sozlanmagan. Administrator bot tokenini kiritgandan keyin bu yerda «Telegramga ulash» tugmasi paydo bo'ladi.")}</p>
      ) : (
        <>
          <ol className="ld-tg-steps">
            <li className={link ? "done" : ""}><b>1</b><span>{t("Pastdagi «Telegramga ulash» tugmasini bosing")}{state.botUsername ? <small> · @{state.botUsername}</small> : null}</span></li>
            <li><b>2</b><span>{t("Telegram ochiladi — botda «Start» (Boshlash) tugmasini bosing")}</span></li>
            <li><b>3</b><span>{t("Bot «Telegram ulandi» deb javob beradi va bu yerda yashil belgi chiqadi")}</span></li>
          </ol>
          <div className="ld-tg-actions">
            <button type="button" className="btn primary" disabled={busy} onClick={connect}>{link ? t("Havolani yangilash") : t("Telegramga ulash")}</button>
            {link?.url && <a className="btn" href={link.url} target="_blank" rel="noreferrer">{t("Telegram ochilmadimi? Shu yerni bosing")}</a>}
          </div>
          <p className="ld-tg-note">{t("Havola 10 daqiqa ishlaydi. Eskirsa, tugmani qayta bosing. Kompyuterda bo'lsangiz, Telegram Desktop ochiladi; u yo'q bo'lsa, havolani telefoningizga yuboring.")}</p>
        </>
      )}
    </section>
  );
}
