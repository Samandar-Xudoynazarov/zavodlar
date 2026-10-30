"use client";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, login, logout, setFactory } from "@/lib/api";
import { UserContext, roleLabel, canStoreRole } from "@/lib/role";
import { I18nProvider, LANGS, tr, useI18n, useT } from "@/lib/i18n";
import { useCardTables } from "@/lib/cards";
import { applyScheme, byId, fmtDate, lsGet, lsSet, today } from "@/lib/calc";
import FormDialog from "@/components/FormDialog";
import DayTab from "@/components/DayTab";
import MonthTab from "@/components/MonthTab";
import StockTab from "@/components/StockTab";
import OrdersTab from "@/components/OrdersTab";
import CostTab from "@/components/CostTab";
import CatalogTab from "@/components/CatalogTab";
import MaterialsTab from "@/components/MaterialsTab";
import ProductEditor from "@/components/ProductEditor";
import Icon from "@/components/Icon";
import AdminTab from "@/components/AdminTab";
import PasswordDialog from "@/components/PasswordDialog";
import InstallHint, { InstallButton } from "@/components/InstallHint";
import WarehouseTab from "@/components/WarehouseTab";
import MovesTab from "@/components/MovesTab";
import TargetsTab from "@/components/TargetsTab";
import MoveSheet from "@/components/MoveSheet";
import PlanTab from "@/components/PlanTab";
import { confirmLeave as confirmUnsaved, hasUnsaved } from "@/lib/dirty";
import InventoryTab from "@/components/InventoryTab";
import SuppliersTab from "@/components/SuppliersTab";
import FinishedTab from "@/components/FinishedTab";
import FleetTab from "@/components/FleetTab";
import DashTab from "@/components/DashTab";
import OverviewTab from "@/components/OverviewTab";
import AcctTab from "@/components/AcctTab";
import HrTab from "@/components/HrTab";
import ShareReady from "@/components/ShareReady";
import NotificationCenter from "@/components/NotificationCenter";

// [kalit, nomi, izoh, kimlarga (bo'sh — hammaga)]
const NO_STORE = ["admin", "rahbar", "pto", "buxgalter", "kuzatuvchi", "kurator"]; // buxgalter hammasini ko'radi, faqat material hisobotini yozadi
const WITH_USTA = [...NO_STORE, "usta"]; // sex boshlig'i: kunlik va oylik hisobot, ombor qoldig'i
const TABS = [
  // bosh ofis (zavodga bog'lanmagan) foydalanuvchilar uchun — tabsFor() da tekshiriladi
  ["all", "Umumiy panel", "Barcha zavodlar: bugun, oylik natija, solishtirish, ombor va buyurtmalar", NO_STORE, "hq"],
  ["day", "Kunlik hisobot", "Reja / fakt, xomashyo sarfi, jo'natish", WITH_USTA],
  ["month", "Oylik hisobot", "Reja bajarilishi, haqiqiy sarf va norma farqi", WITH_USTA],
  ["acct", "Material hisoboti", "Oyda quyilgan mahsulotlar ro'yxati — Word (DOCX) shaklida", NO_STORE],
  ["dash", "Grafiklar", "Oyma-oy asosiy ko'rsatkichlar", NO_STORE],
  ["wh", "Ombor", "Materiallar qoldig'i, kirim va chiqim"],
  ["moves", "Kirim-chiqim tarixi", "Ombordagi barcha harakatlar", [...NO_STORE, "omborchi"]],
  ["inv", "Inventarizatsiya", "Omborni sanash: kamomad va ortiqcha", [...NO_STORE, "omborchi"]],
  ["sup", "Ta'minotchilar", "Kimdan qancha olindi, narxlar qanday o'zgardi", [...NO_STORE, "omborchi"]],
  ["stock", "Qoldiq va ehtiyoj", "Material va tayyor mahsulot qiymati, buyurtmalar uchun ehtiyoj", NO_STORE],
  ["fg", "Tayyor mahsulot", "Qoldiq, buyurtmalarga band va brak hisobi", WITH_USTA],
  ["ord", "Buyurtmalar", "Buyurtmachilar, muddatlar va jo'natish holati", NO_STORE],
  ["plan", "Buyurtmalar rejasi", "Dastur prognozi va tasdiqlangan oylik reja (Excel / qo'lda)", WITH_USTA],
  ["cost", "Kalkulyatsiya", "Tannarx va sotuv narxi — Excel tartibida", NO_STORE],
  ["cat", "Katalog", "Mahsulotlar, sarf normalari va kalkulyatsiya kartalari", NO_STORE],
  ["mat", "Materiallar", "Narxlar, beton retseptlari va sozlamalar", NO_STORE],
  ["veh", "Texnika hisobi", "Yoqilg'i sarfi normaga nisbatan, ta'mir va texnik xizmat", [...NO_STORE, "omborchi"]],
  ["targets", "Sex va texnika", "Chiqim manzillari: bo'limlar va mashinalar", [...NO_STORE, "omborchi"]],
  ["admin", "Boshqaruv", "Foydalanuvchilar, zaxira nusxa va o'zgarishlar tarixi", ["admin", "rahbar"]],
  ["hr", "Xodimlar", "Xodimlar, tabel, oylik hisoblash va to'lovlar", ["admin", "rahbar", "buxgalter", "kadrlar", "usta"]],
];
TABS.push(["hr-time", "Tabel", "Davomat va ish soati", ["admin","rahbar","buxgalter","kadrlar","usta"]], ["hr-payroll", "Oylik hisoblash", "Oylik hisoblash", ["admin","rahbar","buxgalter"]], ["hr-payments", "To'lovlar", "Avans va oylik", ["admin","rahbar","buxgalter"]], ["hr-reports", "Hisobotlar", "Kadrlar hisobotlari", ["admin","rahbar","buxgalter","kadrlar","usta"]]);
const NAV_GROUPS = [
  { id: "personnel", label: "Kadrlar bo‘limi", keys: ["hr", "hr-time", "hr-payroll", "hr-payments", "hr-reports"] },
  { id: "overview", label: "Ish stoli", keys: ["all", "dash"] },
  { id: "production", label: "Ishlab chiqarish", keys: ["day", "fg", "cat"] },
  { id: "warehouse", label: "Ombor va ta'minot", keys: ["wh", "moves", "inv", "sup", "stock", "mat"] },
  { id: "orders", label: "Buyurtmalar", keys: ["ord", "plan", "cost"] },
  { id: "reports", label: "Hisobotlar", keys: ["month", "acct"] },
  { id: "management", label: "Boshqaruv", keys: ["veh", "targets", "admin"] },
];
const groupFor = (key) => NAV_GROUPS.find((group) => group.keys.includes(key));
const tabsFor = (user) => TABS.filter((t) => (user?.role !== "kadrlar" || t[0].startsWith("hr")) && (!t[3] || t[3].includes(user?.role)) && (t[4] !== "hq" || (user && !user.factoryId && (user.factories?.length || 0) > 1)));
// Telefondagi pastki menyu: rol bo'yicha 4 ta asosiy bo'lim (+ o'rtada «+» tugmasi)
const BOTTOM = {
  kadrlar: ["hr"],
  omborchi: ["wh", "moves", "targets"],
  buxgalter: ["hr", "acct", "month", "cost"],
  usta: ["day", "plan", "hr"],
  admin: ["all", "day", "wh", "moves"],
  pto: ["day", "wh", "moves"],
  rahbar: ["all", "dash", "day", "wh"], // to'liq huquq — o'rtada «+» (kirim/chiqim) ham bor
  kuzatuvchi: ["all", "dash", "day", "plan", "wh"],
  kurator: ["all", "dash", "day", "plan", "wh"],
};
const DEFAULT_TAB = { kadrlar: "hr", buxgalter: "acct", omborchi: "wh", rahbar: "dash", kuzatuvchi: "dash", kurator: "dash" };
// bosh ofis rahbari tizimga kirganda — umumiy panel
const HQ_DEFAULT = { rahbar: "all", kuzatuvchi: "all", kurator: "all" };
// pastki menyuda sig'adigan qisqa nomlar
const SHORT = { all: "Umumiy", day: "Kunlik", month: "Oylik", moves: "Tarix", targets: "Sex/texnika", stock: "Qoldiq", ord: "Buyurtma", plan: "Reja", inv: "Sanash", sup: "Ta'minot", fg: "Tayyor", veh: "Texnika", dash: "Grafik", acct: "Hisobot", cost: "Tannarx" };

function LangSwitch({ dark }) {
  const { lang, setLang } = useI18n();
  return (
    <div className={`lang${dark ? " dark" : ""}`} role="group" aria-label="Til / Язык">
      {LANGS.map((l) => (
        <button key={l.code} type="button" aria-pressed={lang === l.code} onClick={() => setLang(l.code)} title={l.label}>
          {l.short}
        </button>
      ))}
    </div>
  );
}

function Login({ onDone }) {
  const t = useT();
  const [username, setUsername] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await login(username, pw);
      onDone();
    } catch (e2) {
      setErr(t(e2.message));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login">
      <form onSubmit={submit}>
        <div className="login-top">
          <div className="brand-mark">ПТО</div>
          <LangSwitch />
        </div>
        <h1>{t("Zavod ish stoli")}</h1>
        <p className="hint">{t("Davom etish uchun login va parolni kiriting")}</p>
        <InstallHint />
        <div className="field">
          <label htmlFor="login-user">{t("Login")}</label>
          <input
            id="login-user"
            autoFocus
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="pw">{t("Parol")}</label>
          <input id="pw" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required />
        </div>
        {err && <p className="err">{err}</p>}
        <button className="btn primary big" disabled={busy}>
          {busy ? t("Tekshirilmoqda…") : t("Kirish")}
        </button>
        <InstallButton className="btn sm login-install" mobileOnly />
      </form>
    </div>
  );
}

export default function Home() {
  return (
    <I18nProvider>
      <App />
    </I18nProvider>
  );
}

function App() {
  const t = useT();
  useCardTables();
  const [phase, setPhase] = useState("loading"); // loading | login | ready | error
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState(""); // bo'sh — rolning standart bo'limi (DEFAULT_TAB) yoki birinchisi
  const [materials, setMaterials] = useState([]);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [settings, setSettings] = useState(null);
  const [targets, setTargets] = useState([]);
  const [move, setMove] = useState(null); // kirim/chiqim oynasi: { type, materialId? }
  const [version, setVersion] = useState(0); // ombor harakati saqlanganda qoldiqlarni yangilash uchun
  const [user, setUser] = useState(null);
  const [pwOpen, setPwOpen] = useState(false);
  const [form, setForm] = useState(null);
  const [editProduct, setEditProduct] = useState(undefined); // undefined = yopiq, null = yangi
  const [toast, setToast] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [dayFocus, setDayFocus] = useState(0);
  const toastTimer = useRef(null);
  const [navQuery, setNavQuery] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState(["warehouse", "orders", "reports", "management"]);
  const menuButton = useRef(null);
  const navigation = useRef(null);

  useEffect(() => {
    if (!user) return;
    const allowed = tabsFor(user);
    const key = allowed.find(([k]) => k === tab)?.[0] || allowed.find(([k]) => k === HQ_DEFAULT[user?.role])?.[0] || allowed.find(([k]) => k === DEFAULT_TAB[user?.role])?.[0] || allowed[0]?.[0];
    const group = groupFor(key);
    if (group) setCollapsedGroups(NAV_GROUPS.filter((item) => item.id !== group.id && item.id !== "overview").map((item) => item.id));
  }, [tab, user?.role, user?.factoryId, user?.factories?.length]);

  useEffect(() => {
    if (!menuOpen) return;
    const mobile = window.matchMedia("(max-width: 980px)").matches;
    const previousOverflow = document.body.style.overflow;
    if (mobile) document.body.style.overflow = "hidden";
    const input = navigation.current?.querySelector("input");
    input?.focus();
    const escape = (event) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
      if (event.key === "Tab" && mobile) {
        const controls = [...navigation.current.querySelectorAll("button, input, select")].filter((element) => !element.disabled && element.getClientRects().length);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", escape);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", escape); };
  }, [menuOpen]);

  const notify = useCallback((msg) => {
    setToast(tr(msg)); // server xabarlari ham tanlangan tilga o'giriladi
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3000);
  }, []);

  const loadAll = useCallback(async () => {
    setPhase((p) => (p === "ready" ? p : "loading"));
    try {
      const me = await api("/me");
      setUser(me);
      // server tanlagan zavodni eslab qolamiz (keyingi so'rovlar shu zavod uchun)
      setFactory(me.factory?.id || "");
      // vaqtinchalik parol: server boshqa ma'lumotni bermaydi — avval yangi parol o'rnatiladi
      if (me.mustChangePassword) {
        setPhase("password");
        return;
      }
      if (me.role === "kadrlar") {
        setMaterials([]); setProducts([]); setOrders([]); setTargets([]); setSettings({});
        setPhase("ready"); return;
      }
      const [m, p, o, s, tg] = await Promise.all([api("/materials"), api("/products"), api("/orders"), api("/settings"), api("/targets")]);
      setTargets(tg);
      setMaterials(m);
      setProducts(p);
      setOrders(o);
      setSettings(s);
      setPhase("ready");
    } catch (e) {
      if (e.status === 401) setPhase("login");
      else {
        setLoadError(tr(e.message));
        setPhase("error");
      }
    }
  }, []);

  const safe = (fn) => async () => {
    try {
      await fn();
    } catch (e) {
      notify(e.message);
    }
  };
  const reloadMaterials = useCallback(safe(async () => setMaterials(await api("/materials"))), []); // eslint-disable-line react-hooks/exhaustive-deps
  const reloadProducts = useCallback(safe(async () => setProducts(await api("/products"))), []); // eslint-disable-line react-hooks/exhaustive-deps
  const reloadOrders = useCallback(safe(async () => setOrders(await api("/orders"))), []); // eslint-disable-line react-hooks/exhaustive-deps
  const reloadSettings = useCallback(safe(async () => setSettings(await api("/settings"))), []); // eslint-disable-line react-hooks/exhaustive-deps
  const reloadTargets = useCallback(safe(async () => setTargets(await api("/targets"))), []); // eslint-disable-line react-hooks/exhaustive-deps
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const targetDay = query.get("day");
    const targetFactory = query.get("factory");
    const linkedDay = /^\d{4}-\d{2}-\d{2}$/.test(targetDay || "") && !Number.isNaN(Date.parse(targetDay)) && new Date(`${targetDay}T00:00:00Z`).toISOString().slice(0, 10) === targetDay;
    if (linkedDay) {
      lsSet("pto.day", targetDay);
      lsSet("pto.tab", "day");
      if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(targetFactory || "")) setFactory(targetFactory);
      // Havolani bir marta ochamiz; keyingi refresh oxirgi tanlangan kunni saqlasin.
      const consumed = new URL(window.location.href);
      consumed.searchParams.delete("day");
      consumed.searchParams.delete("factory");
      window.history.replaceState(window.history.state, "", consumed.pathname + consumed.search + consumed.hash);
    }
    const saved = linkedDay ? "day" : lsGet("pto.tab", "");
    if (TABS.some(([k]) => k === saved)) setTab(saved);
    loadAll();
  }, [loadAll]);

  // token eskirgan yoki foydalanuvchi bloklangan bo'lsa — kirish sahifasiga
  useEffect(() => {
    const onAuth = () => setPhase("login");
    window.addEventListener("pto:unauthorized", onAuth);
    return () => window.removeEventListener("pto:unauthorized", onAuth);
  }, []);

  // Kunlik hisobotda saqlanmagan o'zgarish bor-yo'qligi (DayTab xabar beradi)
  const unsaved = useRef(false);
  const onDirtyChange = useCallback((v) => {
    unsaved.current = v;
  }, []);
  // boshqa bo'limlar (material hisoboti, oylik reja tahriri) lib/dirty orqali xabar beradi —
  // sahifani yopish yoki yangilashda ham brauzer ogohlantiradi
  useEffect(() => {
    const warn = (e) => {
      if (!hasUnsaved()) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  const confirmLeave = () =>
    (!unsaved.current || window.confirm(t("Kunlik hisobotda saqlanmagan o'zgarishlar bor. Ularni tashlab ketasizmi?"))) &&
    (!hasUnsaved() || confirmUnsaved(t("Saqlanmagan o'zgarishlar bor. Ularni tashlab ketasizmi?")));

  const chooseTab = (k) => {
    setMenuOpen(false);
    setNavQuery("");
    if (k === active) return;
    if (!confirmLeave()) return;
    unsaved.current = false;
    setTab(k);
    lsSet("pto.tab", k);
  };
  const openForm = useCallback((f) => setForm({ ...f, key: Date.now() }), []);

  // mahsulotlar kalkulyatsiyasi umumiy xarajat andozasi bilan (rawProds — tahrirlash uchun asl ko'rinish)
  const data = useMemo(() => {
    const schemes = settings?.costSchemes || [];
    const resolved = products.map((p) => applyScheme(p, schemes));
    return { materials, products: resolved, orders, targets, settings: settings || {}, schemes, mats: byId(materials), prods: byId(resolved), rawProds: byId(products) };
  }, [materials, products, orders, targets, settings]);

  if (phase === "login") return <Login onDone={loadAll} />;

  const tabs = tabsFor(user);
  const current = tabs.find(([k]) => k === tab) || tabs.find(([k]) => k === HQ_DEFAULT[user?.role]) || tabs.find(([k]) => k === DEFAULT_TAB[user?.role]) || tabs[0];
  const active = current[0];
  const canMove = canStoreRole(user?.role) && !active.startsWith("hr");
  const bottom = (BOTTOM[user?.role] || BOTTOM.kuzatuvchi).map((k) => tabs.find((x) => x[0] === k)).filter(Boolean);

  const factories = user?.factories || [];
  const factory = user?.factory || null;
  const switchFactory = (id, alreadyConfirmed = false) => {
    if (!id || id === factory?.id) return;
    if (!alreadyConfirmed && !confirmLeave()) return;
    unsaved.current = false;
    setMenuOpen(false);
    setFactory(id);
    setMaterials([]);
    setProducts([]);
    setOrders([]);
    setTargets([]);
    setSettings(null);
    setPhase("loading");
    loadAll();
  };
  const openDailyPlan = ({ factoryId: targetFactory, date }) => {
    if (user?.role !== "kuzatuvchi" || !/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return false;
    if (user.factoryId && user.factoryId !== targetFactory) return false;
    if (!confirmLeave()) return false;
    lsSet("pto.day", date);
    lsSet("pto.tab", "day");
    unsaved.current = false;
    setTab("day");
    setDayFocus((value) => value + 1);
    if (targetFactory !== factory?.id) switchFactory(targetFactory, true);
    return true;
  };
  const factoryPicker = (cls) =>
    factories.length > 1 && (
      <select className={cls} value={factory?.id || ""} onChange={(e) => switchFactory(e.target.value)} aria-label={t("Zavod")}>
        {factories.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
    );

  const doLogout = () => {
    if (!confirmLeave()) return;
    unsaved.current = false;
    logout();
    setUser(null);
    setMenuOpen(false);
    setPhase("login");
  };

  return (
    <UserContext.Provider value={user}>
      <div className={`app${menuOpen ? " menu-open" : ""}`}>
        <aside ref={navigation} id="app-navigation" className="side no-print" aria-label={t("Bo'limlar")}>
          <div className="brand">
            <div className="brand-mark">ПТО</div>
            <div>
              <div className="brand-name">{t("Zavod ish stoli")}</div>
              <div className="brand-sub">{factory?.name || settings?.company || t("Temir-beton zavodi")}</div>
            </div>
            <button className="icon-btn side-close" onClick={() => setMenuOpen(false)} aria-label={t("Menyuni yopish")}>
              <Icon name="close" size={18} />
            </button>
          </div>
          {factoryPicker("factory-pick side-pick")}
          <label className="nav-search">
            <Icon name="search" size={18} />
            <input type="search" value={navQuery} onChange={(event) => setNavQuery(event.target.value)} placeholder={t("Bo'limni qidirish")} aria-label={t("Bo'limni qidirish")} />
          </label>
          <nav className="nav" aria-label={t("Bo'limlar")}>
            {NAV_GROUPS.map((group) => {
              const visibleTabs = tabs.filter(([key, label]) => group.keys.includes(key) && (!navQuery.trim() || `${t(label)} ${t(group.label)}`.toLocaleLowerCase().includes(navQuery.trim().toLocaleLowerCase())));
              if (!visibleTabs.length) return null;
              const expanded = Boolean(navQuery.trim()) || !collapsedGroups.includes(group.id);
              return (
                <section className={`nav-group${group.keys.includes(active) ? " is-active" : ""}`} key={group.id}>
                  <button type="button" className="nav-group-title" aria-expanded={expanded} aria-controls={`nav-group-${group.id}`} onClick={() => setCollapsedGroups((prev) => prev.includes(group.id) ? prev.filter((id) => id !== group.id) : [...prev, group.id])}>
                    <span>{t(group.label)}</span><Icon name="chevR" size={15} />
                  </button>
                  <div id={`nav-group-${group.id}`} className="nav-group-items" role="tablist" aria-label={t(group.label)} hidden={!expanded}>
                    {visibleTabs.map(([key, label]) => (
                      <button key={key} id={`nav-tab-${key}`} type="button" role="tab" aria-selected={active === key} onClick={() => chooseTab(key)}>
                        <Icon name={key.startsWith("hr") ? "hr" : key} size={19} /><span>{t(label)}</span>
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}
            {navQuery.trim() && !tabs.some(([key, label]) => `${t(label)} ${t(groupFor(key)?.label || "")}`.toLocaleLowerCase().includes(navQuery.trim().toLocaleLowerCase())) && <p className="nav-empty" role="status">{t("Bo'lim topilmadi")}</p>}
          </nav>
          <div className="side-foot">
            <LangSwitch dark />
            <div className="side-date" suppressHydrationWarning>
              {fmtDate(today())}
            </div>
            <InstallButton />
            <div className={`side-state ${phase === "password" ? "ready" : phase}`}>
              {phase === "ready" || phase === "password" ? t("Server bilan ulangan") : phase === "error" ? t("Ulanishda xato") : t("Yuklanmoqda…")}
            </div>
            {(phase === "ready" || phase === "password") && user && (
              <div className="side-user">
                <div className="side-user-name">{user.name || user.username}</div>
                <div className="side-user-role">{t(roleLabel(user.role))}</div>
                <div className="side-user-acts">
                  <button className="side-logout" onClick={() => setPwOpen(true)}>
                    <Icon name="key" /> {t("Parol")}
                  </button>
                  <button className="side-logout" onClick={doLogout}>
                    <Icon name="logout" /> {t("Chiqish")}
                  </button>
                </div>
              </div>
            )}
          </div>
        </aside>
        <div className="scrim no-print" onClick={() => setMenuOpen(false)} />

        <main className="main">
          <header className="topbar no-print">
            <button ref={menuButton} type="button" className="icon-btn menu-btn" onClick={() => setMenuOpen(true)} aria-label={t("Menyuni ochish")} aria-expanded={menuOpen} aria-controls="app-navigation"><Icon name="menu" size={22} /></button>
            <div className="topbar-txt">
              <div className="topbar-eyebrow"><span>{t(groupFor(active)?.label || "Ish stoli")}</span><span className="topbar-context">{active === "all" ? t("Barcha zavodlar") : factory?.name || t("Zavod ish stoli")}</span></div>
              <h1>{t(current[1])}</h1>
              <p>{t(current[2])}</p>
            </div>
            {active !== "all" && factoryPicker("factory-pick top-pick")}
            {phase === "ready" && user?.role === "kuzatuvchi" && <NotificationCenter key={user.id} user={user} onOpenPlan={openDailyPlan} notify={notify} />}
            {canMove && phase === "ready" && (
              <div className="topbar-acts">
                <button className="btn in" onClick={() => setMove({ type: "in" })}>
                  <Icon name="in" /> {t("Kirim")}
                </button>
                <button className="btn out" onClick={() => setMove({ type: "out" })}>
                  <Icon name="out" /> {t("Chiqim")}
                </button>
              </div>
            )}
          </header>

          <InstallHint />

          {phase === "error" && (
            <div className="notice">
              {loadError}{" "}
              <button className="btn sm" onClick={loadAll}>
                {t("Qayta urinish")}
              </button>
            </div>
          )}

          {phase !== "ready" ? (
            <section className="sheet">
              <div className="loading">
                {phase === "loading" ? t("Ma'lumotlar yuklanmoqda…") : phase === "password" ? t("Davom etish uchun yangi parol o'rnating.") : t("Ma'lumotlarni yuklab bo'lmadi.")}
              </div>
            </section>
          ) : (
            // zavod almashganda barcha bo'limlar qaytadan yuklanadi
            <Fragment key={factory?.id || "-"}>
              {active === "day" && <DayTab key={dayFocus} data={data} notify={notify} onSaved={reloadOrders} onDirtyChange={onDirtyChange} version={version} />}
              {active === "month" && <MonthTab data={data} notify={notify} />}
              {active === "acct" && <AcctTab data={data} notify={notify} />}
              {active.startsWith("hr") && <HrTab initialView={active === "hr" ? "employees" : active.slice(3)} onViewChange={v=>chooseTab(v === "employees" ? "hr" : `hr-${v}`)} notify={notify} openForm={openForm} />}
              {active === "wh" && <WarehouseTab data={data} notify={notify} version={version} openMove={setMove} reloadMaterials={reloadMaterials} />}
              {active === "moves" && <MovesTab data={data} notify={notify} version={version} onChanged={bump} />}
              {active === "stock" && <StockTab data={data} notify={notify} reloadSettings={reloadSettings} version={version} />}
              {active === "ord" && <OrdersTab data={data} openForm={openForm} notify={notify} reload={reloadOrders} />}
              {active === "dash" && <DashTab data={data} notify={notify} />}
              {active === "all" && (
                <OverviewTab
                  notify={notify}
                  onOpenFactory={(id) => {
                    if (id !== factory?.id) switchFactory(id);
                    setTab("dash");
                    lsSet("pto.tab", "dash");
                  }}
                />
              )}
              {active === "veh" && <FleetTab data={data} notify={notify} version={version} />}
              {active === "fg" && <FinishedTab data={data} notify={notify} version={version} />}
              {active === "inv" && <InventoryTab data={data} notify={notify} onChanged={bump} onDirtyChange={onDirtyChange} />}
              {active === "sup" && <SuppliersTab data={data} openForm={openForm} notify={notify} />}
              {active === "plan" && <PlanTab data={data} notify={notify} reloadOrders={reloadOrders} reloadSettings={reloadSettings} />}
              {active === "cost" && (
                <CostTab
                  data={data}
                  notify={notify}
                  onEdit={(p) => setEditProduct(p)}
                  onSchemesSaved={async () => {
                    await Promise.all([reloadSettings(), reloadProducts()]);
                  }}
                />
              )}
              {active === "cat" && <CatalogTab data={data} notify={notify} reload={reloadProducts} onEdit={(p) => setEditProduct(p)} />}
              {active === "mat" && <MaterialsTab data={data} notify={notify} reload={reloadMaterials} reloadSettings={reloadSettings} />}
              {active === "targets" && <TargetsTab data={data} notify={notify} reload={reloadTargets} />}
              {active === "admin" && <AdminTab data={data} openForm={openForm} notify={notify} />}
              <ProductEditor
                product={editProduct || null}
                open={editProduct !== undefined}
                onClose={() => setEditProduct(undefined)}
                data={data}
                notify={notify}
                onSaved={reloadProducts}
              />
              <MoveSheet init={move} onClose={() => setMove(null)} onSaved={bump} data={data} notify={notify} reloadMaterials={reloadMaterials} />
            </Fragment>
          )}
        </main>
        <ShareReady />

        {/* telefon: pastki menyu */}
        {user && (
          <nav className="bnav no-print" aria-label={t("Asosiy bo'limlar")}>
            {bottom.slice(0, canMove ? 2 : 4).map(([k, l]) => (
              <button key={k} aria-current={active === k ? "page" : undefined} onClick={() => chooseTab(k)}>
                <Icon name={k} size={22} />
                <span>{t(SHORT[k] || l)}</span>
              </button>
            ))}
            {canMove && (
              <button className="bnav-fab" onClick={() => setMove({ type: "in" })} aria-label={t("Kirim yoki chiqim")} disabled={phase !== "ready"}>
                <Icon name="plus" size={26} />
              </button>
            )}
            {canMove &&
              bottom.slice(2, 3).map(([k, l]) => (
                <button key={k} aria-current={active === k ? "page" : undefined} onClick={() => chooseTab(k)}>
                  <Icon name={k} size={22} />
                  <span>{t(SHORT[k] || l)}</span>
                </button>
              ))}
            <button onClick={() => setMenuOpen(true)} aria-expanded={menuOpen} aria-controls="app-navigation" aria-current={!bottom.some(([k]) => k === active) ? "page" : undefined}>
              <Icon name="menu" size={22} />
              <span>{t("Menyu")}</span>
            </button>
          </nav>
        )}

        <FormDialog form={form} onClose={() => setForm(null)} />
        <PasswordDialog
          open={pwOpen || Boolean(user?.mustChangePassword)}
          forced={Boolean(user?.mustChangePassword)}
          onClose={() => setPwOpen(false)}
          onDone={(u) => {
            setUser(u);
            setPwOpen(false);
            notify("Parol o'zgartirildi");
            if (phase !== "ready") loadAll();
          }}
        />
        {toast && (
          <div className="toast" role="status">
            {toast}
          </div>
        )}
      </div>
    </UserContext.Provider>
  );
}
