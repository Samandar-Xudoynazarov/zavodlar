"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { fmtDate, fmtN } from "@/lib/calc";
import { useT } from "@/lib/i18n";
import Icon from "./Icon";

const titleFor = (item) => item.payload?.action === "cleared" ? "Kunlik reja bekor qilindi" : item.payload?.action === "created" ? "Kunlik reja kiritildi" : "Kunlik reja yangilandi";

export default function NotificationCenter({ user, onOpenPlan, notify }) {
  const t = useT();
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [latest, setLatest] = useState(null);
  const [telegram, setTelegram] = useState(null);
  const [link, setLink] = useState(null);
  const [busy, setBusy] = useState(false);
  const dialog = useRef(null);
  const seen = useRef(null);
  const refresh = useRef(null);
  const live = useRef(true);
  const flashTimer = useRef(null);

  useEffect(() => {
    live.current = true;
    seen.current = null;
    let stopped = false;
    let timer;
    let controller;
    let inFlight = false;
    const poll = async () => {
      if (stopped || inFlight) return;
      clearTimeout(timer);
      controller = new AbortController();
      inFlight = true;
      try {
        const data = await api("/notifications", { signal: controller.signal });
        if (stopped) return;
        const incoming = data.items || [];
        if (seen.current) {
          const added = incoming.find((item) => !seen.current.has(item.id) && !item.readAt);
          if (added) {
            setLatest(added);
            clearTimeout(flashTimer.current);
            flashTimer.current = setTimeout(() => setLatest(null), 15000);
          }
        }
        seen.current = new Set(incoming.map((item) => item.id));
        setItems(incoming);
        setUnread(data.unreadCount || 0);
        setError("");
      } catch (err) {
        if (!stopped && !controller.signal.aborted) setError(err.message);
      } finally {
        inFlight = false;
        if (!stopped) { setLoading(false); timer = setTimeout(poll, document.hidden ? 15000 : 2000); }
      }
    };
    refresh.current = poll;
    const visible = () => { if (!document.hidden) poll(); };
    document.addEventListener("visibilitychange", visible);
    poll();
    return () => {
      stopped = true;
      live.current = false;
      controller?.abort();
      clearTimeout(timer);
      clearTimeout(flashTimer.current);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [user.id]);

  const loadTelegram = useCallback(async () => {
    try {
      const value = await api("/notifications/telegram");
      if (live.current) { setTelegram(value); if (value.connected) setLink(null); }
    } catch (err) { if (live.current) setError(err.message); }
  }, []);

  useEffect(() => {
    const node = dialog.current;
    if (open && !node.open) { node.showModal(); refresh.current?.(); loadTelegram(); }
    if (!open && node.open) node.close();
  }, [open, loadTelegram]);
  useEffect(() => {
    if (!open || !link || telegram?.connected) return;
    const timer = setInterval(loadTelegram, 3000);
    return () => clearInterval(timer);
  }, [open, link, telegram?.connected, loadTelegram]);

  const markRead = async (item) => {
    if (item.readAt) return;
    try { await api(`/notifications/${item.id}/read`, { method: "PUT" }); refresh.current?.(); }
    catch (err) { if (live.current) notify(err.message); }
  };
  const openItem = async (item) => {
    if (onOpenPlan({ factoryId: item.factoryId, date: item.date }) === false) return;
    setOpen(false);
    setLatest(null);
    await markRead(item);
  };
  const readAll = async () => {
    setBusy(true);
    try { await api("/notifications/read-all", { method: "PUT" }); refresh.current?.(); setLatest(null); }
    catch (err) { notify(err.message); }
    finally { if (live.current) setBusy(false); }
  };
  const connect = async () => {
    setBusy(true);
    setError("");
    try { const value = await api("/notifications/telegram/link", { method: "POST" }); if (live.current) setLink(value); }
    catch (err) { if (live.current) setError(err.message); }
    finally { if (live.current) setBusy(false); }
  };
  const disconnect = async () => {
    setBusy(true);
    try { await api("/notifications/telegram", { method: "DELETE" }); setLink(null); await loadTelegram(); }
    catch (err) { if (live.current) setError(err.message); }
    finally { if (live.current) setBusy(false); }
  };
  return (
    <>
      <button type="button" className="notification-trigger btn" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={t("Bildirishnomalar: {n} ta o'qilmagan", { n: unread })}>
        <Icon name="bell" size={20} /><span>{t("Bildirishnomalar")}</span>
        {unread > 0 && <b className="notification-count">{unread > 99 ? "99+" : unread}</b>}
      </button>
      {latest && <div className="notification-flash no-print" role="status">
        <Icon name="bell" size={22} />
        <button type="button" onClick={() => openItem(latest)}><strong>{t(titleFor(latest))}</strong><span>{latest.payload?.factoryName} · {fmtDate(latest.date)}</span></button>
        <button type="button" className="icon-btn" onClick={() => setLatest(null)} aria-label={t("Yopish")}><Icon name="close" /></button>
      </div>}
      <dialog ref={dialog} className="notification-dialog" aria-labelledby="notification-title" onClose={() => setOpen(false)}>
        <div className="notification-header">
          <div><h2 id="notification-title">{t("Bildirishnomalar")}</h2><p className="hint">{t("Kunlik rejalar va ularning o'zgarishlari")}</p></div>
          <button type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label={t("Yopish")}><Icon name="close" /></button>
        </div>
        <div className="notification-tools"><span className="hint">{t("{n} ta o'qilmagan", { n: unread })}</span><button type="button" className="btn sm" disabled={!unread || busy} onClick={readAll}>{t("Hammasi o'qildi")}</button></div>
        {error && <div className="notice" role="alert">{t(error)} <button type="button" className="btn sm" onClick={() => { refresh.current?.(); loadTelegram(); }}>{t("Qayta urinish")}</button></div>}
        <div className="notification-list">
          {loading ? <p className="loading">{t("Yuklanmoqda…")}</p> : !items.length ? <div className="empty"><Icon name="bell" size={28} /><strong>{t("Hozircha bildirishnoma yo'q")}</strong><p className="hint">{t("Kunlik reja saqlanganda xabar shu yerga keladi.")}</p></div> : items.map((item) => (
            <button type="button" key={item.id} className={`notification-item${item.readAt ? "" : " is-unread"}`} onClick={() => openItem(item)}>
              <span className="notification-item-top"><strong>{t(titleFor(item))}</strong>{!item.readAt && <span className="notification-dot" aria-label={t("O'qilmagan")} />}</span>
              <span>{item.payload?.factoryName} · {fmtDate(item.date)}</span>
              <span className="hint">{item.payload?.authorName} · {t("Reja: {n} dona", { n: fmtN(item.payload?.total || 0) })}</span>
              {(item.payload?.lines || []).slice(0, 3).map((line) => <span className="notification-line" key={line.productId}>{line.code || line.name}<b>{fmtN(line.plan)} {t("dona")}</b></span>)}
              <span className="notification-open">{t("Kunlik hisobotni ochish")} <Icon name="chevR" size={14} /></span>
            </button>
          ))}
        </div>
        <section className="notification-telegram">
          <div><h3>{t("Telegram xabarlari")}</h3><p className="hint">{telegram?.connected ? t("Telegram ulangan — yangi rejalar shu yerga ham yuboriladi.") : t("Ilova yopiq bo'lsa ham, reja xabarini Telegramda oling.")}</p></div>
          {telegram?.connected ? <div className="notification-telegram-actions"><span className="pill st-tayyor">{telegram.username ? `@${telegram.username}` : t("Telegram ulangan")}</span><button type="button" className="btn sm" disabled={busy} onClick={disconnect}>{t("Telegramni uzish")}</button></div>
            : telegram?.configured ? <><button type="button" className="btn" disabled={busy} onClick={connect}>{link ? t("Ulash havolasini yangilash") : t("Telegramni ulash")}</button>{link?.url && <div className="notification-link"><a className="btn primary" href={link.url} target="_blank" rel="noreferrer">{t("Telegramda ochish")}</a><p className="hint">{t("Botda Start tugmasini bosing. Havola 10 daqiqa amal qiladi.")}</p></div>}</>
              : telegram && <p className="hint">{t("Telegram botini administrator hali sozlamagan.")}</p>}
        </section>
      </dialog>
    </>
  );
}
