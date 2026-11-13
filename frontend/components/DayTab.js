"use client";
import { tr } from "@/lib/i18n";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUser } from "@/lib/role";
import { api } from "@/lib/api";
import Icon from "./Icon";
import ExportMenu from "./ExportMenu";
import NakladnoyDialog from "./NakladnoyDialog";
import DayReview from "./DayReview";
import ReportSigners from "./ReportSigners";
import Reconciliation from "./Reconciliation";
import { addDaySheet, deliver, newWorkbook, pickRows } from "@/lib/excel";
import { BRAK_REASONS, consumption, fmtDate, fmtN, lsGet, lsSet, productOptions, round, shiftDate, today } from "@/lib/calc";

const num = (v) => (v === "" || v === null || v === undefined ? 0 : +v || 0);
const emptyProd = () => ({ productId: "", plan: "", fact: "", brak: "", brakReason: "", note: "" });
const emptyShip = () => ({ productId: "", qty: "", customer: "", vehicle: "", orderId: "" });

export default function DayTab({ data, notify, onSaved, onDirtyChange, version }) {
  const { canEdit:mayEdit, canDay:mayEditDay,user } = useUser();
  const [review,setReview]=useState({status:'draft',version:0});
  const canDay=mayEditDay&&review.status==='draft',canEdit=mayEdit&&review.status==='draft';
  const [quickEntry,setQuickEntry]=useState(false);
  useEffect(()=>{setQuickEntry(window.matchMedia('(max-width:700px)').matches);},[]); // canDay: ПТО, admin va sex boshlig'i (usta — jo'natish va kunni o'chirishsiz)
  const { materials, products, mats, prods, settings, orders } = data;
  const [date, setDate] = useState(() => lsGet("pto.day", today()));
  const [loading, setLoading] = useState(true);
  const [prod, setProd] = useState([]);
  const [matIn, setMatIn] = useState({}); // materialId → { sarf, kirim } (matn ko'rinishida)
  const [ships, setShips] = useState([]);
  const [note, setNote] = useState("");
  const [stock, setStock] = useState(null);
  const [exists, setExists] = useState(false);
  // qaysi sana muvaffaqiyatli yuklangani va o'sha paytdagi versiyasi (updatedAt) — boshqa sanaga
  // yoki boshqa xodim saqlagan eski holatga yozib yubormaslik uchun
  const [loaded, setLoaded] = useState(null); // { date, ver } | null
  const [loadError, setLoadError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [nkOpen, setNkOpen] = useState(false); // накладная oynasi

  // Sana tez almashtirilsa, eski so'rov javobi kechikib kelib, yangi sanadagi jadvalni
  // boshqa kunning ma'lumoti bilan to'ldirib yubormasligi uchun faqat oxirgi so'rov hisobga olinadi.
  const loadSeq = useRef(0);
  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    const stale = () => seq !== loadSeq.current;
    setLoading(true);
    setLoaded(null);
    setLoadError("");
    setConflict(false);
    try {
      const [d, s] = await Promise.all([api(`/days/${date}`), api(`/stock?from=${date}&to=${date}`)]);
      if (stale()) return;
      setProd(d.production.length ? d.production.map((l) => ({ ...l, plan: l.plan || "", fact: l.fact || "", brak: l.brak || "", brakReason: l.brakReason || "" })) : [emptyProd()]);
      setMatIn(Object.fromEntries(d.materials.map((l) => [l.materialId, { sarf: l.sarf || "", kirim: l.kirim || "" }])));
      setShips(d.shipments.map((l) => ({ ...l, orderId: l.orderId || "" })));
      setNote(d.note || "");
      setExists(!d.isNew);
      setReview({status:d.reviewStatus||'draft',version:d.version||0});
      setStock(s);
      setDirty(false);
      setLoaded({ date, ver: d.isNew ? null : d.updatedAt || null });
    } catch (e) {
      if (stale()) return;
      // eski kunning jadvali yangi sana ostida qolmasin: tozalaymiz, saqlash va eksport yopiladi
      setProd([emptyProd()]);
      setMatIn({});
      setShips([]);
      setNote("");
      setStock(null);
      setExists(false);
      setDirty(false);
      setLoadError(e.message || "Yuklab bo'lmadi");
      notify(e.message);
    } finally {
      if (!stale()) setLoading(false);
    }
  }, [date, notify]);
  useEffect(() => {
    load();
  }, [load]);
  // ombor harakati saqlanganda faqat qoldiqni yangilaymiz (kiritilgan, saqlanmagan qiymatlar joyida qoladi)
  useEffect(() => {
    if (!version) return;
    api(`/stock?from=${date}&to=${date}`).then(setStock).catch(() => {});
  }, [version]); // eslint-disable-line react-hooks/exhaustive-deps

  // Saqlanmagan o'zgarish bo'lsa: ota komponentga xabar beramiz (bo'lim almashtirish/chiqishda so'raladi)
  // va sahifani yopish/yangilashda brauzer ogohlantiradi
  useEffect(() => {
    onDirtyChange?.(dirty);
    if (!dirty) return;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  function go(next) {
    if (!next) return;
    if (dirty && !window.confirm(tr("Saqlanmagan o'zgarishlar bor. Ularni tashlab, boshqa kunga o'tasizmi?"))) return;
    setDate(next);
    lsSet("pto.day", next);
  }
  const touch = (fn) => (...a) => {
    fn(...a);
    setDirty(true);
  };

  const setProdRow = touch((i, patch) => setProd((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r))));
  const setShipRow = touch((i, patch) => setShips((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch, dispatchId: null, dispatchNo: "" } : r))));
  const setMat = touch((id, k, v) => setMatIn((m) => ({ ...m, [id]: { ...m[id], [k]: v } })));

  // «Buyurtmalar rejasi»dagi taklifdan shu kunning rejasini to'ldirish (faktga tegmaydi)
  async function fillFromPlan() {
    try {
      const p = await api("/plan");
      const day = p.days.find((x) => x.date === date);
      if (!day?.items.length) return notify("Bu kun uchun taklif yo'q — buyurtmalar rejasida bu kunga ish chiqmagan");
      const need = new Map();
      for (const it of day.items) need.set(it.productId, (need.get(it.productId) || 0) + it.qty);
      setProd((rows) => {
        const out = rows.filter((r) => r.productId || r.fact || r.plan).map((r) => (need.has(r.productId) ? { ...r, plan: String(need.get(r.productId)) } : r));
        for (const [id, q] of need) if (!out.some((r) => r.productId === id)) out.push({ ...emptyProd(), productId: id, plan: String(q) });
        return out.length ? out : [emptyProd()];
      });
      setDirty(true);
      notify(tr("Reja taklifdan to'ldirildi ({n} ta mahsulot) — tekshirib, saqlang", { n: need.size }));
    } catch (e) {
      notify(e.message);
    }
  }

  // «Tasdiqlangan reja» (oylik reja)dagi shu kun ustunidan rejani to'ldirish (faktga tegmaydi)
  async function fillFromBoss() {
    try {
      const { plan } = await api(`/month-plans/${date.slice(0, 7)}`);
      if (!plan) return notify("Bu oy uchun tasdiqlangan reja kiritilmagan");
      const di = +date.slice(8, 10) - 1;
      const need = new Map();
      let skipped = 0;
      for (const r of plan.rows) {
        const q = +r.days?.[di] || 0;
        if (!q) continue;
        if (!r.productId) {
          skipped++;
          continue;
        }
        need.set(String(r.productId), (need.get(String(r.productId)) || 0) + q);
      }
      if (!need.size) return notify(skipped ? "Tasdiqlangan rejadagi bu kun qatorlari katalog bilan bog'lanmagan" : "Tasdiqlangan rejada bu kunga ish yo'q");
      setProd((rows) => {
        const out = rows.filter((r) => r.productId || r.fact || r.plan).map((r) => (need.has(r.productId) ? { ...r, plan: String(need.get(r.productId)) } : r));
        for (const [id, q] of need) if (!out.some((r) => r.productId === id)) out.push({ ...emptyProd(), productId: id, plan: String(q) });
        return out.length ? out : [emptyProd()];
      });
      setDirty(true);
      notify(
        skipped
          ? tr("Reja tasdiqlangan rejadan to'ldirildi ({n} ta mahsulot, {s} ta bog'lanmagan qator o'tkazib yuborildi) — tekshirib, saqlang", { n: need.size, s: skipped })
          : tr("Reja tasdiqlangan rejadan to'ldirildi ({n} ta mahsulot) — tekshirib, saqlang", { n: need.size })
      );
    } catch (e) {
      notify(e.message);
    }
  }

  // norma bo'yicha sarf: fakt va reja
  const normFact = useMemo(
    // brak ham material sarflagan — norma bo'yicha sarf sifatli + brak donadan
    () => consumption(prod.map((r) => ({ productId: r.productId, qty: num(r.fact) + num(r.brak) })), prods, mats, settings),
    [prod, prods, mats, settings]
  );
  const normPlan = useMemo(
    () => consumption(prod.map((r) => ({ productId: r.productId, qty: num(r.plan) })), prods, mats, settings),
    [prod, prods, mats, settings]
  );

  const fillFromNorm = touch(() => {
    const next = { ...matIn };
    for (const m of materials) {
      if (!m.stock) continue;
      const q = normFact.get(m.id);
      next[m.id] = { ...next[m.id], sarf: q ? String(round(q, 4)) : "" };
    }
    setMatIn(next);
    notify("Sarf normadan to'ldirildi — tekshirib, saqlang");
  });

  // jadval aynan shu sana uchun yuklangan bo'lsagina saqlash, eksport va o'chirish mumkin
  const ready = !loading && loaded?.date === date;

  async function save(shipRows, dispatchDocument) {
    if (!ready) return notify("Kun ma'lumoti yuklanmagan — avval qayta yuklang");
    if(!canDay)return notify('Hisobot tahrirdan yopilgan. Avval qayta oching');
    if (!Array.isArray(shipRows)) shipRows = ships;
    setSaving(true);
    try {
      const body = {
        note,
        production: prod
          .filter((r) => r.productId)
          .map((r) => ({ productId: r.productId, plan: num(r.plan), fact: num(r.fact), brak: num(r.brak), brakReason: num(r.brak) > 0 ? r.brakReason || "boshqa" : "", note: r.note || "" })),
        materials: Object.entries(matIn).map(([materialId, v]) => ({ materialId, sarf: num(v?.sarf), kirim: num(v?.kirim) })),
        shipments: shipRows
          .filter((r) => r.productId && num(r.qty) > 0)
          .map((r) => ({ productId: r.productId, qty: num(r.qty), customer: r.customer || "", vehicle: r.vehicle || "", orderId: r.orderId || null, dispatchId: r.dispatchId || null, dispatchNo: r.dispatchNo || "" })),
      };
      if (dispatchDocument) body.dispatchDocument = dispatchDocument;
      body.baseVersion=review.version;
      body.baseUpdatedAt = loaded.ver; // server boshqa xodim keyin saqlaganini shu bilan aniqlaydi
      const doc = await api(`/days/${date}`, { method: "PUT", body });
      notify(tr("{d} saqlandi", { d: fmtDate(date) }));
      setDirty(false);
      setExists(true);
      setConflict(false);
      setLoaded({ date, ver: doc?.updatedAt || null });
      setReview({status:doc.reviewStatus||'draft',version:doc.version||0});
      onSaved();
      return doc;
    } catch (e) {
      if (e.status === 409) setConflict(true);
      notify(e.message);
    } finally {
      setSaving(false);
    }
  }

  // Накладнаяdagi mahsulotlar → shu kunning jo'natishi. replaceIdx — накладная qaysi jo'natish qatorlaridan
  // to'ldirilgan bo'lsa, o'shalar yangilanadi (ikki marta qo'shilmaydi), qolganlari joyida qoladi. Kun saqlanadi.
  async function applyNakladnoy(rows, replaceIdx = [], dispatchDocument) {
    const drop = new Set(replaceIdx);
    const next = [...ships.filter((_, i) => !drop.has(i)), ...rows];
    setShips(next);
    setDirty(true);
    const saved = await save(next, dispatchDocument);
    if (!saved) throw new Error("Накладная bazaga saqlanmadi. Xatoni tuzatib qayta urinib ko‘ring.");
  }

  // ekrandagi (hali saqlanmagan bo'lsa ham) holat bo'yicha Excel
  async function exportExcel(share) {
    if (!ready) return notify("Kun ma'lumoti yuklanmagan — avval qayta yuklang");
    if (stock?.beforeOpening) return notify("Bu sana boshlang'ich qoldiqdan oldin — qoldiqlar noma'lum, fayl tayyorlanmaydi");
    setExporting(true);
    try {
      const day = {
        date,
        production: prod.filter((r) => r.productId).map((r) => ({ productId: r.productId, plan: num(r.plan), fact: num(r.fact) })),
        materials: Object.entries(matIn).map(([materialId, v]) => ({ materialId, sarf: num(v?.sarf), kirim: num(v?.kirim) })),
        shipments: ships.filter((r) => r.productId && num(r.qty) > 0).map((r) => ({ ...r, qty: num(r.qty) })),
      };
      const matStart = new Map(Object.entries(stock?.materials || {}).map(([id, v]) => [id, v.start]));
      const prodStart = new Map(Object.entries(stock?.products || {}).map(([id, v]) => [id, v.start]));
      // Excel shaklida: Расход = ishlab chiqarish sarfi + ombor chiqimi, Приход = ombor kirimi (+ eski qo'lda kiritilgan kirim)
      const mv = stock?.materials || {};
      const ids = new Set([...day.materials.map((l) => l.materialId), ...Object.keys(mv)]);
      day.materials = [...ids].map((id) => {
        const l = day.materials.find((x) => x.materialId === id) || { sarf: 0, kirim: 0 };
        return { materialId: id, sarf: l.sarf + (mv[id]?.chiqim || 0), kirim: l.kirim + (mv[id]?.moveIn || 0) };
      });
      const sarf = new Map(day.materials.map((l) => [l.materialId, l.sarf + l.kirim]));
      // shu kuni ombordan brakka chiqarilgan va marka tuzatishlari (server hisobidan)
      day.prodAdj = Object.fromEntries(
        Object.entries(stock?.products || {})
          .filter(([, v]) => v.writeoff || v.corr)
          .map(([id, v]) => [id, { writeoff: v.writeoff || 0, corr: v.corr || 0 }])
      );
      const adjMap = new Map(Object.entries(day.prodAdj).map(([id, a]) => [id, a.corr - a.writeoff]));
      const moved = new Map([...day.production.map((l) => [l.productId, l.fact]), ...day.shipments.map((l) => [l.productId, l.qty]), ...adjMap]);
      const { matList, prodList } = pickRows(materials, products, [matStart, sarf], [prodStart, moved]);
      const wb = await newWorkbook();
      addDaySheet(wb, { date, company: settings.company, signers: settings.signers, matList, prodList, prods, day, matStart, prodStart });
      const r = await deliver(wb, `Ostatki_${date.split("-").reverse().join(".")}.xlsx`, { share });
      if (r === "downloaded-fallback") notify("Bu qurilmada ulashish yo'q — fayl yuklab olindi");
      if (dirty) notify("Diqqat: fayl saqlanmagan o'zgarishlar bilan tayyorlandi");
    } catch (e) {
      notify(e.message || "Excel faylni tayyorlab bo'lmadi");
    } finally {
      setExporting(false);
    }
  }

  async function removeDay() {
    if (!ready) return;
    if (!window.confirm(tr("{d} kunidagi barcha yozuvlar o'chirilsinmi?", { d: fmtDate(date) }))) return;
    try {
      await api(`/days/${date}`, { method: "DELETE" });
      notify("O'chirildi");
      await load();
      onSaved();
    } catch (e) {
      notify(e.message);
    }
  }

  const stockMats = materials.filter((m) => m.stock);
  const matRows = stockMats
    .map((m) => {
      const st = stock?.materials?.[m.id] || {};
      const start = st.start || 0;
      const v = matIn[m.id] || {};
      const sarf = num(v.sarf);
      const kirim = num(v.kirim) + (st.moveIn || 0); // omborchi kirimi (+ eski hisobotlarda qo'lda yozilgan kirim)
      const chiqim = st.chiqim || 0; // omborchi chiqimi: sex, texnika, shaxsga
      return {
        m, start, kirim, chiqim, plan: normPlan.get(m.id) || 0, norm: normFact.get(m.id) || 0, v,
        end: start - sarf + kirim - chiqim,
        active: start || sarf || kirim || chiqim || normFact.get(m.id) || normPlan.get(m.id),
      };
    })
    .filter((r) => showAll || r.active);

  const factBy = new Map();
  for (const r of prod) if (r.productId) factBy.set(r.productId, (factBy.get(r.productId) || 0) + num(r.fact));
  const shipBy = new Map();
  for (const r of ships) if (r.productId) shipBy.set(r.productId, (shipBy.get(r.productId) || 0) + num(r.qty));
  const prodStock = products
    .map((p) => {
      const start = stock?.products?.[p.id]?.start || 0;
      const fact = factBy.get(p.id) || 0;
      const shipped = shipBy.get(p.id) || 0;
      const writeoff = stock?.products?.[p.id]?.writeoff || 0; // shu kuni ombordan brakka chiqarilgan
      const corr = stock?.products?.[p.id]?.corr || 0; // shu kuni marka tuzatishi (±)
      return { p, start, fact, shipped, writeoff, corr, end: start + fact - shipped - writeoff + corr };
    })
    .filter((r) => r.start || r.fact || r.shipped || r.writeoff || r.corr);

  const planSum = prod.reduce((s, r) => s + num(r.plan), 0);
  const factSum = prod.reduce((s, r) => s + num(r.fact), 0);
  const brakSum = prod.reduce((s, r) => s + num(r.brak), 0);
  const shippedSum = [...shipBy.values()].reduce((s, qty) => s + qty, 0);
  const completion = planSum ? (factSum / planSum) * 100 : null;
  const saveState = saving
    ? tr("Saqlanmoqda…")
    : loading
      ? tr("Yuklanmoqda…")
      : !ready
        ? tr("Hisobot yuklanmadi")
        : dirty
          ? tr("Saqlanmagan o'zgarishlar")
          : exists
            ? tr("Barcha o'zgarishlar saqlangan")
            : tr("Yangi hisobot");
  const popts = productOptions(products);
  const activeOrders = orders.filter((o) => o.status !== "topshirildi");

  return (
    <section className={`sheet day${canDay ? " has-savebar" : ""}${quickEntry?' day-quick':''}`}>
      <div className="print-only print-head">
        <div>{settings.company}</div>
        <strong>Ежедневная информация о выпуске ЖБИ и об остатках основных материалов на {fmtDate(date)}</strong>
      </div>

      <div className="bar day-header no-print">
        <div className="day-heading">
          <h2>{tr(canDay ? "Hisobotni to'ldirish" : "Hisobot tafsilotlari")}</h2>
          <p className="hint">{tr("Kunlik reja, ishlab chiqarish va ombor harakatlari.")}</p>
        </div>
        <div className="r">
          <ExportMenu disabled={exporting || !ready}>
            <button className="btn" onClick={() => exportExcel(false)} disabled={exporting || !ready}>
              <Icon name="download" /> {tr("Excel yuklab olish")}
            </button>
            <button className="btn" onClick={() => exportExcel(true)} disabled={exporting || !ready}>
              <Icon name="share" /> {tr("Ulashish")}
            </button>
            <button className="btn" onClick={() => window.print()} disabled={!ready}>
              <Icon name="print" /> {tr("Chop etish")}
            </button>
          </ExportMenu>
          {canEdit && exists && ready && (
            <button className="btn danger" onClick={removeDay}>
              <Icon name="trash" /> {tr("Kunni o'chirish")}
            </button>
          )}
        </div>
      </div>

      <div className='day-controls no-print'><label className='check'><input type='checkbox' checked={quickEntry} onChange={e=>setQuickEntry(e.target.checked)}/>{tr('Telefonda tez kiritish')}</label>
        <div className="day-date-group">
          <label className="day-date-label" htmlFor="day-date">{tr("Hisobot sanasi")}</label>
          <div className="daynav">
            <button className="btn sm" onClick={() => go(shiftDate(date, -1))} aria-label={tr("Oldingi kun")}>
              <Icon name="chevL" />
            </button>
            <input id="day-date" type="date" value={date} onChange={(e) => go(e.target.value)} aria-label={tr("Hisobot sanasi")} />
            <button className="btn sm" onClick={() => go(shiftDate(date, 1))} aria-label={tr("Keyingi kun")}>
              <Icon name="chevR" />
            </button>
            <button className="btn sm" onClick={() => go(today())}>{tr("Bugun")}</button>
          </div>
        </div>
        {!canDay && <span className="pill st-topshirildi">{tr("Ko'rish rejimi")}</span>}
      </div>

      <ReportSigners settings={settings} canEdit={mayEdit} notify={notify} onSaved={onSaved}/>
      <DayReview date={date} report={review} dirty={dirty} exists={exists} ready={ready} onChanged={async()=>{await load();onSaved();}} notify={notify}/>
      {['admin','rahbar','pto','buxgalter'].includes(user?.role)&&<Reconciliation date={date} version={review.version}/>}
      {canDay && (
        <div className={`day-savebar no-print ${saving ? "is-saving" : dirty ? "is-dirty" : exists ? "is-saved" : ""}`}>
          <div className="day-save-state" role="status" aria-live="polite" aria-atomic="true">
            <Icon name={dirty ? "edit" : exists ? "inv" : "day"} size={20} />
            <div className="day-save-copy">
              <strong>{saveState}</strong>
              <span>{fmtDate(date)}</span>
            </div>
          </div>
          <button className="btn primary day-save-button" onClick={() => save()} disabled={saving || !ready} aria-busy={saving}>
            <Icon name="save" /> {saving ? tr("Saqlanmoqda…") : tr("Saqlash")}
          </button>
        </div>
      )}
      {stock?.beforeOpening && (
        <div className="notice">{tr("Bu sana boshlang'ich qoldiq sanasidan ({d}) oldin — qoldiqlar hisoblanmaydi.", { d: fmtDate(stock.openingDate) })}</div>
      )}

      {conflict && (
        <div className="notice warn">
          {tr("Bu kunni siz ochgandan keyin boshqa xodim saqlagan. Uning o'zgarishlari o'chib ketmasligi uchun saqlanmadi. Qayta yuklang va o'zgarishlaringizni qaytadan kiriting.")}{" "}
          <button className="btn sm" onClick={() => (!dirty || window.confirm(tr("Saqlanmagan o'zgarishlar bor. Ularni tashlab ketasizmi?"))) && load()}>
            {tr("Qayta yuklash")}
          </button>
        </div>
      )}
      {loading ? (
        <div className="loading">{tr("Yuklanmoqda…")}</div>
      ) : loadError ? (
        <div className="empty">
          <p>{tr("{d} kuni ma'lumotini yuklab bo'lmadi: {e}", { d: fmtDate(date), e: tr(loadError) })}</p>
          <button className="btn" onClick={load}>{tr("Qayta yuklash")}</button>
        </div>
      ) : (
        <>
          <div className="kpis day-kpis no-print" aria-label={tr("Kun ko'rsatkichlari")}>
            <div className="kpi">
              <div className="k">{tr("Reja")}</div>
              <div className="v">{fmtN(planSum)} <small>{tr("dona")}</small></div>
              <p className="hint day-kpi-meta">{tr("Belgilangan ishlab chiqarish")}</p>
            </div>
            <div className="kpi">
              <div className="k">{tr("Fakt")}</div>
              <div className="v">{fmtN(factSum)} <small>{tr("dona")}</small></div>
              <p className="hint day-kpi-meta">{tr("Bajarilishi")}: {completion === null ? "—" : `${fmtN(completion, 0)} %`}</p>
            </div>
            <div className={`kpi${brakSum ? " kpi-risk" : ""}`}>
              <div className="k">{tr("Brak")}</div>
              <div className="v">{fmtN(brakSum)} <small>{tr("dona")}</small></div>
              <p className="hint day-kpi-meta">{tr("Sifatli faktga kirmaydi")}</p>
            </div>
            <div className="kpi">
              <div className="k">{tr("Jo'natildi")}</div>
              <div className="v">{fmtN(shippedSum)} <small>{tr("dona")}</small></div>
              <p className="hint day-kpi-meta">{tr("Shu kundagi jo'natishlar")}</p>
            </div>
          </div>

          {/* ---- reja / fakt ---- */}
          <div className="day-section">
            <div className="day-section-head">
              <span className="day-step no-print" aria-hidden="true">01</span>
              <div className="day-section-copy">
                <h3>{tr("Mahsulotlar: reja / fakt")}</h3>
                <p className="hint no-print">{tr("Reja va sifatli faktni kiriting. Brakni alohida yozing.")}</p>
              </div>
            </div>
            {quickEntry&&<fieldset className='plain day-quick-cards no-print' disabled={!canDay}>{prod.map((r,i)=><div className='hr-card' key={i}><label>{tr('Mahsulot')}<select value={r.productId} onChange={e=>setProdRow(i,{productId:e.target.value})}><option value=''>{tr('Mahsulot tanlang')}</option>{popts.map(([k,n])=><option key={k} value={k}>{n}</option>)}</select></label><div className='day-quick-numbers'>{[['plan','Reja'],['fact','Sifatli fakt'],['brak','Brak']].map(([key,label])=><label key={key}>{tr(label)}<input type='number' inputMode='numeric' min='0' step='1' value={r[key]} onChange={e=>setProdRow(i,{[key]:e.target.value})}/></label>)}</div>{num(r.brak)>0&&<label>{tr('Brak sababi')}<select value={r.brakReason||'boshqa'} onChange={e=>setProdRow(i,{brakReason:e.target.value})}>{BRAK_REASONS.map(([k,n])=><option key={k} value={k}>{tr(n)}</option>)}</select></label>}<label>{tr('Izoh')}<input value={r.note||''} onChange={e=>setProdRow(i,{note:e.target.value})}/></label><button className='btn sm danger' onClick={touch(()=>setProd(rows=>rows.filter((_,j)=>j!==i)))}>{tr('Qatorni o‘chirish')}</button></div>)}</fieldset>}
            <div className={quickEntry?'tbl-wrap quick-table':'tbl-wrap'}>
              <fieldset className="plain" disabled={!canDay}><table className="edit day-production-table">
                <thead>
                  <tr>
                    <th>{tr("Mahsulot")}</th>
                    <th className="n">{tr("Reja, dona")}</th>
                    <th className="n">{tr("Fakt, dona")}</th>
                    <th className="n">{tr("Brak, dona")}</th>
                    <th className="n">{tr("Bajarilishi")}</th>
                    <th>{tr("Izoh")}</th>
                    <th className="no-print"></th>
                  </tr>
                </thead>
                <tbody>
                  {prod.map((r, i) => {
                    const pct = num(r.plan) ? (num(r.fact) / num(r.plan)) * 100 : null;
                    return (
                      <tr key={i}>
                        <td className="wide day-prod-product">
                          <select id={`dp-p-${i}`} value={r.productId} onChange={(e) => setProdRow(i, { productId: e.target.value })} aria-label={tr("Mahsulot")}>
                            <option value="">{tr("— mahsulot tanlang —")}</option>
                            {popts.map(([k, l]) => (
                              <option key={k} value={k}>
                                {l}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="n day-prod-plan">
                          <input id={`dp-plan-${i}`} type="number" min="0" step="1" value={r.plan} onChange={(e) => setProdRow(i, { plan: e.target.value })} aria-label={tr("Reja")} />
                        </td>
                        <td className="n day-prod-fact">
                          <input id={`dp-fact-${i}`} type="number" min="0" step="1" value={r.fact} onChange={(e) => setProdRow(i, { fact: e.target.value })} aria-label={tr("Fakt")} />
                        </td>
                        <td className="n brak-cell day-prod-brak">
                          <input id={`dp-brak-${i}`} type="number" min="0" step="1" value={r.brak} placeholder="0" onChange={(e) => setProdRow(i, { brak: e.target.value })} aria-label={tr("Brak")} />
                          {num(r.brak) > 0 && (
                            <select id={`dp-brr-${i}`} value={r.brakReason || "boshqa"} onChange={(e) => setProdRow(i, { brakReason: e.target.value })} aria-label={tr("Brak sababi")}>
                              {BRAK_REASONS.map(([k, l]) => (
                                <option key={k} value={k}>
                                  {tr(l)}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td className={`n day-prod-percent ${pct === null ? "" : pct >= 100 ? "ok" : "warn"}`}>{pct === null ? "—" : `${fmtN(pct, 0)} %`}</td>
                        <td className="day-prod-note">
                          <input id={`dp-note-${i}`} value={r.note || ""} onChange={(e) => setProdRow(i, { note: e.target.value })} aria-label={tr("Izoh")} />
                        </td>
                        <td className="no-print day-prod-remove">
                          <button className="btn sm danger" aria-label={tr("Qatorni o'chirish")} onClick={touch(() => setProd((rows) => rows.filter((_, j) => j !== i)))}>
                            ×
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="day-production-total">
                    <td className="day-prod-product">{tr("Jami")}</td>
                    <td className="n day-prod-plan">{fmtN(planSum)}</td>
                    <td className="n day-prod-fact">{fmtN(factSum)}</td>
                    <td className={`n day-prod-brak${brakSum ? " late" : ""}`}>{brakSum ? fmtN(brakSum) : "—"}</td>
                    <td className="n day-prod-percent">{completion === null ? "—" : `${fmtN(completion, 0)} %`}</td>
                    <td className="day-total-empty" colSpan={2}></td>
                  </tr>
                </tfoot>
              </table></fieldset>
            </div>
            {canDay && (
              <div className="day-section-actions no-print">
                <button className="btn sm" onClick={touch(() => setProd((rows) => [...rows, emptyProd()]))}>{tr("+ Mahsulot qo'shish")}</button>
                {date >= today() && (
                  <button className="btn sm" onClick={fillFromPlan} title={tr("Buyurtmalar rejasidagi taklif bo'yicha")}>{tr("Rejani buyurtmalardan to'ldirish")}</button>
                )}
                <button className="btn sm" onClick={fillFromBoss} title={tr("«Buyurtmalar rejasi» → «Tasdiqlangan reja»dagi shu kun bo'yicha")}>{tr("Tasdiqlangan rejadan to'ldirish")}</button>
              </div>
            )}
          </div>

          {/* ---- materiallar ---- */}
          <div className="day-section">
            <div className="bar day-section-head">
              <span className="day-step no-print" aria-hidden="true">02</span>
              <div className="day-section-copy">
                <h3>{tr("Xomashyo va materiallar")}</h3>
                <p className="hint no-print">{tr("Ishlab chiqarish sarfini kiriting yoki normadan to'ldiring.")}</p>
              </div>
              <div className="r day-section-actions no-print">
                <label className="check">
                  <input id="day-showall" type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> {tr("Barcha materiallar")}</label>
                {canDay && (
                  <button className="btn sm" onClick={fillFromNorm}>{tr("Sarfni normadan to'ldirish")}</button>
                )}
              </div>
            </div>
            {quickEntry&&<fieldset className='plain day-quick-cards no-print' disabled={!canDay}>{matRows.map(({m,norm,v,end})=><div className='hr-card' key={m.id}><strong>{m.name}</strong><p className='hint'>{tr('Norma bo‘yicha')}: {fmtN(norm,3)} {m.unit}</p><label>{tr('Amaldagi sarf')}<input type='number' inputMode='decimal' min='0' step='0.001' value={v.sarf||''} onChange={e=>setMat(m.id,'sarf',e.target.value)}/></label><p className={end<0?'err':'hint'}>{tr('Qoldiq')}: {fmtN(end,3)} {m.unit}</p></div>)}</fieldset>}
            <div className={quickEntry?'tbl-wrap quick-table':'tbl-wrap'} style={{ marginTop: 8 }}>
              <fieldset className="plain" disabled={!canDay}><table className="edit">
                <thead>
                  <tr>
                    <th>{tr("Material")}</th>
                    <th>{tr("Birlik")}</th>
                    <th className="n">{tr("Kun boshida")}</th>
                    <th className="n no-print">{tr("Kerak (reja)")}</th>
                    <th className="n no-print">{tr("Norma (fakt)")}</th>
                    <th className="n">{tr("Sarf")}</th>
                    <th className="n">{tr("Kirim")}</th>
                    <th className="n">{tr("Chiqim")}</th>
                    <th className="n">{tr("Qoldiq")}</th>
                  </tr>
                </thead>
                <tbody>
                  {!matRows.length && (
                    <tr>
                      <td colSpan={9} className="empty">{tr("Harakat yo'q. «Barcha materiallar»ni yoqing.")}</td>
                    </tr>
                  )}
                  {matRows.map(({ m, start, plan, norm, v, end, kirim, chiqim }) => {
                    const sarf = num(v.sarf);
                    const diff = norm ? ((sarf - norm) / norm) * 100 : 0;
                    return (
                      <tr key={m.id}>
                        <td>
                          {m.name} <span className="unit-s">{m.unit}</span>
                        </td>
                        <td className="hide-s">{m.unit}</td>
                        <td className="n">{fmtN(start, 3)}</td>
                        <td className="n no-print muted">{plan ? fmtN(plan, 3) : ""}</td>
                        <td className="n no-print muted">{norm ? fmtN(norm, 3) : ""}</td>
                        <td className={`n ${sarf && norm && Math.abs(diff) > 10 ? "warn" : ""}`} title={norm ? tr("Normadan farq: {p} %", { p: fmtN(diff, 1) }) : undefined}>
                          <input id={`dm-s-${m.id}`} type="number" min="0" step="any" value={v.sarf ?? ""} onChange={(e) => setMat(m.id, "sarf", e.target.value)} aria-label={tr("{m} — sarf", { m: m.name })} />
                        </td>
                        <td className="n ro in-text">{kirim ? `+${fmtN(kirim, 3)}` : ""}</td>
                        <td className="n ro out-text">{chiqim ? `−${fmtN(chiqim, 3)}` : ""}</td>
                        <td className={`n strong ${end < -1e-9 ? "late" : ""}`}>{fmtN(end, 3)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table></fieldset>
            </div>
            <details className="day-help no-print">
              <summary>{tr("Sarf va qoldiq qanday hisoblanadi?")}</summary>
              <p className="hint">{tr("Metall kg da. «Norma (fakt)» — fakt × Норма (beton → qum/sement/sheben, elektrod = metallning {p} %). Sarf normadan 10 % dan ko'p farq qilsa sariq bilan belgilanadi. Kirim va chiqim — omborchi kiritgan harakatlar («Ombor» bo'limi).", { p: fmtN(settings.electrodePct, 2) })}</p>
            </details>
          </div>

          {/* ---- tayyor mahsulot ---- */}
          <div className="grid2">
            <div className="day-section">
              <div className="day-section-head">
                <span className="day-step no-print" aria-hidden="true">03</span>
                <div className="day-section-copy">
                  <h3>{tr("Tayyor mahsulot qoldig'i")}</h3>
                  <p className="hint no-print">{tr("Ishlab chiqarish va jo'natishdan keyingi qoldiq.")}</p>
                </div>
              </div>
              <div className="tbl-wrap">
                {!prodStock.length ? (
                  <div className="empty">{tr("Qoldiq yo'q.")}</div>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>{tr("Mahsulot")}</th>
                        <th className="n">{tr("Boshida")}</th>
                        <th className="n">{tr("Ishlandi")}</th>
                        <th className="n">{tr("Jo'natildi")}</th>
                        <th className="n">{tr("Qoldiq")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prodStock.map((r) => (
                        <tr key={r.p.id}>
                          <td>
                            <span className="code">{r.p.code}</span>
                          </td>
                          <td className="n">{fmtN(r.start)}</td>
                          <td className="n">{r.fact || ""}</td>
                          <td className="n">
                            {r.shipped || ""}
                            {r.writeoff > 0 && <span className="sub late">{tr("brak −{n}", { n: r.writeoff })}</span>}
                            {r.corr !== 0 && (
                              <span className="sub">{tr("marka tuzatish {n}", { n: `${r.corr > 0 ? "+" : "−"}${Math.abs(r.corr)}` })}</span>
                            )}
                          </td>
                          <td className={`n strong ${r.end < 0 ? "late" : ""}`}>{fmtN(r.end)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* ---- jo'natish ---- */}
            <div className="day-section">
              <div className="day-section-head">
                <span className="day-step no-print" aria-hidden="true">04</span>
                <div className="day-section-copy">
                  <h3>{tr("Jo'natish (отгрузка)")}</h3>
                  <p className="hint no-print">{tr("Yuk xati tayyorlang yoki jo'natishni qo'lda kiriting.")}</p>
                </div>
              </div>
              <div className="tbl-wrap">
                <fieldset className="plain" disabled={!canEdit}><table className="edit">
                  <thead>
                    <tr>
                      <th>{tr("Qayerga")}</th>
                      <th>{tr("Mahsulot")}</th>
                      <th className="n">{tr("Soni")}</th>
                      <th>{tr("Mashina")}</th>
                      <th className="no-print">{tr("Buyurtma")}</th>
                      <th className="no-print"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {!ships.length && (
                      <tr>
                        <td colSpan={6} className="empty">{tr("Jo'natish yo'q.")}</td>
                      </tr>
                    )}
                    {ships.map((r, i) => (
                      <tr key={i}>
                        <td>
                          <input id={`ds-c-${i}`} value={r.customer} onChange={(e) => setShipRow(i, { customer: e.target.value })} aria-label={tr("Qayerga")} placeholder={tr("Samarqand")} />
                        </td>
                        <td>
                          <select id={`ds-p-${i}`} value={r.productId} onChange={(e) => {
                              const pid = e.target.value;
                              const o = orders.find((x) => x.id === r.orderId);
                              setShipRow(i, { productId: pid, ...(o && !o.items.some((it) => it.productId === pid) && { orderId: "" }) });
                            }} aria-label={tr("Mahsulot")}>
                            <option value="">—</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.code}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="n">
                          <input id={`ds-q-${i}`} type="number" min="1" step="1" value={r.qty} onChange={(e) => setShipRow(i, { qty: e.target.value })} aria-label={tr("Soni")} />
                        </td>
                        <td>
                          <input id={`ds-v-${i}`} value={r.vehicle} onChange={(e) => setShipRow(i, { vehicle: e.target.value })} aria-label={tr("Mashina raqami")} placeholder="75 X 023 RA" />
                        </td>
                        <td className="no-print">
                          <select id={`ds-o-${i}`} value={r.orderId || ""} onChange={(e) => setShipRow(i, { orderId: e.target.value })} aria-label={tr("Buyurtma")}>
                            <option value="">—</option>
                            {activeOrders
                              .filter((o) => o.id === r.orderId || !r.productId || o.items.some((it) => it.productId === r.productId))
                              .map((o) => {
                                const it = o.items.find((x) => x.productId === r.productId);
                                return (
                                  <option key={o.id} value={o.id}>
                                    №{o.no} {o.customer}
                                    {o.contractNo ? ` (${o.contractNo})` : ""}
                                    {it ? ` — ${tr("qoldi {n}", { n: fmtN(it.left) })}` : ""}
                                  </option>
                                );
                              })}
                          </select>
                        </td>
                        <td className="no-print">
                          <button className="btn sm danger" aria-label={tr("Qatorni o'chirish")} onClick={touch(() => setShips((rows) => rows.filter((_, j) => j !== i)))}>
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table></fieldset>
              </div>
              <div className="day-section-actions no-print">
                {/* asosiy yo'l: накладная yoziladi — undagi mahsulotlar PDF bilan birga shu kunning jo'natishiga avtomatik tushadi */}
                <button className={`btn sm${canEdit ? " primary" : ""}`} onClick={async () => { await Promise.resolve(onSaved()).catch(() => {}); setNkOpen(true); }} disabled={!ready} title={tr("Yuk xati (PDF) — undagi mahsulotlar jo'natishga avtomatik yoziladi")}>
                  <Icon name="print" size={14} /> {tr("Накладная (PDF)")}
                </button>
                {canEdit && (
                  <button className="btn sm" onClick={touch(() => setShips((rows) => [...rows, emptyShip()]))}>{tr("+ Jo'natish qo'lda")}</button>
                )}
              </div>
              {canEdit && <p className="hint no-print">{tr("Накладная tayyorlanganda undagi mahsulotlar shu jadvalga o'zi qo'shiladi va kun saqlanadi — alohida yozish shart emas.")}</p>}
              {nkOpen && <NakladnoyDialog ships={ships} date={date} data={data} notify={notify} onClose={() => setNkOpen(false)} onApply={canEdit ? applyNakladnoy : null} />}
            </div>
          </div>

          <div className="field day-note no-print">
            <label htmlFor="day-note">{tr("Kun bo'yicha izoh")}</label>
            <textarea id="day-note" rows={2} readOnly={!canDay} value={note} onChange={touch((e) => setNote(e.target.value))} />
          </div>

          <div className="print-only signers">
            {(settings.signers || []).map((s) => (
              <div key={s}>{s} ____________</div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
