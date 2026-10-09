"use client";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { tr, useT } from "@/lib/i18n";
import { applyScheme, brakLabel, byId, concreteVolume, costCard, fmt, fmtDate, fmtN, priceOf, shiftDate, today } from "@/lib/calc";
import Chart from "./Chart";
import Icon from "./Icon";
import ExportButtons from "./ExportButtons";

const MON_FULL = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentyabr", "Oktyabr", "Noyabr", "Dekabr"];
const monthName = (m) => `${tr(MON_FULL[+m.slice(5, 7) - 1])} ${m.slice(0, 4)}`;
const shiftMonth = (ym, n) => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1)).toISOString().slice(0, 7);
const mln = (v) => fmtN((v || 0) / 1e6, 1);
const pct = (a, b) => (b ? (a / b) * 100 : null);
const KIND = { beton: "Temir-beton", metall: "Metall konstruksiya" };

/** Bitta oy qatori (dashAggregate) → pul va nisbatlar. Narxlar kalkulyatsiya bilan bir xil formulada */
function deriveMonth(m, ctx) {
  if (!m) return null;
  const { mats, prods, price, card } = ctx;
  let sarfCost = 0;
  for (const [id, q] of Object.entries(m.sarf || {})) sarfCost += q * price(id);
  let chiqimCost = 0;
  for (const [id, q] of Object.entries(m.chiqim || {})) chiqimCost += q * price(id);
  let m3 = 0;
  let prodCost = 0;
  for (const [id, q] of Object.entries(m.prod || {})) {
    m3 += q * concreteVolume(prods.get(id), mats);
    prodCost += q * (card(id)?.itogo || 0);
  }
  let sales = 0;
  for (const [id, q] of Object.entries(m.ship || {})) sales += q * (card(id)?.final || 0);
  const made = m.fact + m.brak;
  return {
    ...m,
    m3,
    sarfCost,
    costTotal: sarfCost + chiqimCost,
    prodCost,
    sales,
    perM3: m3 > 0 ? sarfCost / m3 : null,
    planPct: pct(m.fact, m.plan),
    brakPct: made ? (m.brak / made) * 100 : null,
    m3PerDay: m.activeDays ? m3 / m.activeDays : null,
  };
}

function deriveFactory(f, realToday) {
  const mats = byId(f.materials);
  const schemes = f.settings.costSchemes || [];
  const products = f.products.map((p) => applyScheme(p, schemes));
  const prods = byId(products);
  const cards = new Map();
  const card = (id) => {
    if (!cards.has(id)) cards.set(id, prods.get(id) ? costCard(prods.get(id), mats) : null);
    return cards.get(id);
  };
  const prices = new Map();
  const price = (id) => {
    if (!prices.has(id)) prices.set(id, priceOf(mats.get(id), mats) || 0);
    return prices.get(id);
  };
  const ctx = { mats, prods, price, card };

  const stocked = f.materials.filter((m) => m.stock && !m.archived);
  const qty = (id) => f.stock.materials[id] || 0;
  const low = stocked
    .map((m) => ({ m, q: qty(m.id), state: qty(m.id) <= 1e-9 ? "out" : m.minQty > 0 && qty(m.id) < m.minQty ? "low" : "" }))
    .filter((x) => x.state);
  const stockValue = stocked.reduce((s, m) => s + Math.max(0, qty(m.id)) * price(m.id), 0);
  const fgValue = Object.entries(f.stock.products).reduce((s, [id, q]) => s + Math.max(0, q) * (card(id)?.itogo || 0), 0);
  const orders = f.orders.map((o) => ({ ...o, product: prods.get(o.productId) }));
  const late = orders.filter((o) => o.plan === "late" || (o.deadline && o.deadline < realToday && o.remaining > 0));
  const risk = orders.filter((o) => o.plan === "risk" && !late.includes(o));
  const t = f.today;
  // tanlangan kunning mahsulotlar bo'yicha tafsiloti (reja, fakt, brak, jo'natish)
  const lines = new Map();
  const line = (id) => {
    if (!lines.has(id)) lines.set(id, { id, product: prods.get(id), plan: 0, fact: 0, brak: 0, shipped: 0, reasons: new Set(), customers: new Set() });
    return lines.get(id);
  };
  for (const l of f.day?.production || []) {
    const x = line(l.productId);
    x.plan += +l.plan || 0;
    x.fact += +l.fact || 0;
    x.brak += +l.brak || 0;
    if (+l.brak > 0) x.reasons.add(l.brakReason || "boshqa");
  }
  for (const l of f.day?.shipments || []) {
    const x = line(l.productId);
    x.shipped += +l.qty || 0;
    if (l.customer) x.customers.add(l.customer);
  }
  const dayLines = [...lines.values()].sort((a, b) => String(a.product?.code || "").localeCompare(String(b.product?.code || "")));
  const dayM3 = dayLines.reduce((s, x) => s + x.fact * concreteVolume(x.product, mats), 0);
  return {
    ...f,
    mats,
    prods,
    card,
    cur: deriveMonth(f.month, ctx),
    prev: deriveMonth(f.prevMonth, ctx),
    todayPct: pct(t.fact, t.plan),
    low,
    stockValue,
    fgValue,
    orders,
    late,
    risk,
    noReport: t.workDay && !t.reported,
    dayLines,
    dayM3,
  };
}

/** Bosh ofis uchun: barcha zavodlar bir ekranda */
export default function OverviewTab({ notify, onOpenFactory }) {
  const t = useT();
  const thisMonth = today().slice(0, 7);
  const thisDay = today();
  const [month, setMonth] = useState(thisMonth);
  const [day, setDay] = useState(thisDay);
  const [raw, setRaw] = useState(null);
  const [busy, setBusy] = useState(false);
  const [allCodes, setAllCodes] = useState(false);
  useEffect(() => {
    let live = true;
    setBusy(true); // oldingi ma'lumot ko'rinib turadi, yangisi kelguncha xiralashadi
    api(`/overview?month=${month}&day=${day}`)
      .then((r) => live && setRaw(r))
      .catch((e) => live && notify(e.message))
      .finally(() => live && setBusy(false));
    return () => {
      live = false;
    };
  }, [month, day, notify]);
  const isToday = raw ? raw.day === raw.today : true;

  const list = useMemo(() => (raw ? raw.factories.map((f) => deriveFactory(f, raw.today)) : null), [raw]);
  const total = useMemo(() => {
    if (!list) return null;
    const sum = (k, w = "cur") => list.reduce((s, f) => s + (f[w]?.[k] || 0), 0);
    const T = (w) => {
      const plan = sum("plan", w);
      const fact = sum("fact", w);
      const brak = sum("brak", w);
      return { plan, fact, brak, m3: sum("m3", w), shipped: sum("shipped", w), sales: sum("sales", w), costTotal: sum("costTotal", w), prodCost: sum("prodCost", w), planPct: pct(fact, plan), brakPct: fact + brak ? (brak / (fact + brak)) * 100 : null };
    };
    return { cur: T("cur"), prev: T("prev") };
  }, [list]);

  // bir xil markadagi mahsulot bir nechta zavodda bo'lsa — tannarxni solishtiramiz
  const common = useMemo(() => {
    if (!list || list.length < 2) return [];
    const byCode = new Map();
    for (const f of list)
      for (const p of f.products) {
        const key = p.code.trim().toLowerCase();
        const c = f.card(p.id);
        if (!c?.itogo) continue;
        if (!byCode.has(key)) byCode.set(key, { code: p.code, name: p.name, by: new Map() });
        byCode.get(key).by.set(f.factory.id, c.itogo);
      }
    return [...byCode.values()]
      .filter((x) => x.by.size >= 2)
      .map((x) => {
        const v = [...x.by.values()];
        const min = Math.min(...v);
        const max = Math.max(...v);
        return { ...x, min, max, spread: min ? ((max - min) / min) * 100 : 0 };
      })
      .sort((a, b) => b.spread - a.spread);
  }, [list]);

  const names = list?.map((f) => f.factory.name) || [];
  const delta = (a, b) => {
    if (a == null || !b) return null;
    const d = ((a - b) / b) * 100;
    return <span className={`delta ${d >= 0 ? "up" : "down"}`}>{d >= 0 ? "▲" : "▼"} {fmtN(Math.abs(d), 0)} %</span>;
  };

  return (
    <section className={`sheet ov${busy && raw ? " ov-busy" : ""}`}>
      <div className="bar">
        <span className="month-pick">
          <button type="button" className="btn sm" aria-label={t("Oldingi oy")} onClick={() => setMonth((m) => shiftMonth(m, -1))}>
            ‹
          </button>
          <input type="month" value={month} max={thisMonth} onChange={(e) => e.target.value && e.target.value <= thisMonth && setMonth(e.target.value)} aria-label={t("Oy")} />
          <button type="button" className="btn sm" aria-label={t("Keyingi oy")} disabled={month >= thisMonth} onClick={() => setMonth((m) => shiftMonth(m, 1))}>
            ›
          </button>
        </span>
        <ExportButtons notify={notify} disabled={!list?.length} build={() => overviewExcel(list, total, common, month, raw.day)} />
      </div>

      {!list ? (
        <div className="loading">{t("Yuklanmoqda…")}</div>
      ) : !list.length ? (
        <div className="empty">{t("Faol zavod yo'q")}</div>
      ) : (
        <>
          {/* ---------- Tanlangan kun (standart — bugun) ---------- */}
          <div>
            <div className="bar" style={{ marginBottom: 10 }}>
              <h3 style={{ margin: 0 }}>{isToday ? t("Bugun — {d}", { d: fmtDate(raw.day) }) : t("Kun — {d}", { d: fmtDate(raw.day) })}</h3>
              <span className="month-pick">
                <button type="button" className="btn sm" aria-label={t("Oldingi kun")} onClick={() => setDay((d) => shiftDate(d, -1))}>
                  ‹
                </button>
                <input type="date" value={day} max={thisDay} onChange={(e) => e.target.value && e.target.value <= thisDay && setDay(e.target.value)} aria-label={t("Kun")} />
                <button type="button" className="btn sm" aria-label={t("Keyingi kun")} disabled={day >= thisDay} onClick={() => setDay((d) => shiftDate(d, 1))}>
                  ›
                </button>
                {day !== thisDay && (
                  <button type="button" className="btn sm" onClick={() => setDay(thisDay)}>
                    {t("Bugun")}
                  </button>
                )}
              </span>
            </div>
            <p className="hint" style={{ margin: "0 0 10px" }}>{t("Zavod kartasini bosing — o'sha zavodning bo'limlari ochiladi")}</p>
            <div className="ov-cards">
              {list.map((f) => {
                const issues = [];
                if (f.noReport) issues.push(["st-jarayonda", isToday ? t("Bugungi hisobot kiritilmagan") : t("Kunlik hisobot kiritilmagan")]);
                if (!f.today.workDay && !f.today.reported) issues.push(["st-topshirildi", t("Dam olish kuni")]);
                // buyurtma va ombor holati — hozirgi holat, faqat bugun ko'rilganda
                const out = f.low.filter((x) => x.state === "out").length;
                if (isToday) {
                  if (f.late.length) issues.push(["st-bad", t("{n} ta buyurtma kechikmoqda", { n: f.late.length })]);
                  if (f.risk.length) issues.push(["st-jarayonda", t("{n} ta buyurtma xavf ostida", { n: f.risk.length })]);
                  if (out) issues.push(["st-bad", t("{n} ta material tugagan", { n: out })]);
                  if (f.low.length - out) issues.push(["st-jarayonda", t("{n} ta material kam qoldi", { n: f.low.length - out })]);
                }
                return (
                  <button key={f.factory.id} className="ov-card" onClick={() => onOpenFactory(f.factory.id)}>
                    <div className="ov-card-h">
                      <span className="strong">{f.factory.name}</span>
                      <span className="sub">{t(KIND[f.factory.kind] || f.factory.kind)}</span>
                    </div>
                    <div className="ov-today">
                      <div>
                        <div className="k">{t("Fakt / reja")}</div>
                        <div className="v">
                          {fmt(f.today.fact)} <small>/ {fmt(f.today.plan)}</small>
                        </div>
                      </div>
                      <div>
                        <div className="k">{t("Bajarilishi")}</div>
                        <div className="v">{f.todayPct == null ? "—" : `${fmtN(f.todayPct, 0)} %`}</div>
                      </div>
                      <div>
                        <div className="k">{t("Jo'natildi")}</div>
                        <div className="v">{fmt(f.today.shipped)}</div>
                      </div>
                    </div>
                    <div className="meter" aria-hidden="true">
                      <span style={{ width: `${Math.min(100, f.todayPct || 0)}%` }} />
                    </div>
                    <div className="ov-issues">
                      {issues.length ? (
                        issues.map(([c, l]) => (
                          <span key={l} className={`pill ${c}`}>
                            {l}
                          </span>
                        ))
                      ) : (
                        <span className="pill st-tayyor">✓ {t("Muammo yo'q")}</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ---------- Tanlangan kun: mahsulotlar bo'yicha ---------- */}
          <div>
            <h3>{t("Kunlik tafsilot — {d}", { d: fmtDate(raw.day) })}</h3>
            <div className="ov-days">
              {list.map((f) => (
                <details key={f.factory.id} className="ov-day" open={list.length <= 2 || undefined}>
                  <summary>
                    <span className="strong">{f.factory.name}</span>
                    <span className="sub">
                      {f.dayLines.length
                        ? t("fakt {f} / reja {p} dona · {m} m³ · jo'natildi {s}", { f: fmt(f.today.fact), p: fmt(f.today.plan), m: fmtN(f.dayM3, 1), s: fmt(f.today.shipped) })
                        : t("hisobot yo'q")}
                    </span>
                  </summary>
                  {f.dayLines.length > 0 && (
                    <div className="tbl-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>{t("Mahsulot")}</th>
                            <th className="num">{t("Reja")}</th>
                            <th className="num">{t("Fakt")}</th>
                            <th className="num">{t("Bajarilishi")}</th>
                            <th className="num">{t("Brak")}</th>
                            <th className="num">{t("Jo'natildi")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {f.dayLines.map((x) => {
                            const p = pct(x.fact, x.plan);
                            return (
                              <tr key={x.id}>
                                <td>
                                  <span className="strong">{x.product?.code || t("o'chirilgan")}</span>
                                  {x.product?.name && <span className="sub">{x.product.name}</span>}
                                </td>
                                <td className="num">{fmt(x.plan)}</td>
                                <td className="num">{fmt(x.fact)}</td>
                                <td className={`num ${p != null && p < 90 ? "bad-text" : ""}`}>{p == null ? "—" : `${fmtN(p, 0)} %`}</td>
                                <td className="num">
                                  {x.brak ? fmt(x.brak) : "—"}
                                  {x.brak > 0 && <span className="sub">{[...x.reasons].map((k) => t(brakLabel(k))).join(", ")}</span>}
                                </td>
                                <td className="num">
                                  {x.shipped ? fmt(x.shipped) : "—"}
                                  {x.customers.size > 0 && <span className="sub">{[...x.customers].join(", ")}</span>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {f.day?.note && <p className="hint">{t("Izoh")}: {f.day.note}</p>}
                </details>
              ))}
            </div>
          </div>

          {/* ---------- Oylik natija ---------- */}
          <div>
            <h3>{t("Oylik natija — {m}", { m: monthName(month) })}</h3>
            <div className="kpis">
              <Kpi k={t("Quyilgan beton")} v={fmtN(total.cur.m3, 0)} u="m³" d={delta(total.cur.m3, total.prev.m3)} />
              <Kpi k={t("Jo'natish (sotuv narxida)")} v={mln(total.cur.sales)} u={t("mln so'm")} d={delta(total.cur.sales, total.prev.sales)} />
              <Kpi k={t("Material xarajati")} v={mln(total.cur.costTotal)} u={t("mln so'm")} d={delta(total.cur.costTotal, total.prev.costTotal)} />
              <Kpi k={t("Brak ulushi")} v={total.cur.brakPct == null ? "—" : fmtN(total.cur.brakPct, 1)} u="%" warn={total.cur.brakPct > 2} />
            </div>
            <div className="tbl-wrap" style={{ marginTop: 12 }}>
              <table>
                <thead>
                  <tr>
                    <th>{t("Zavod")}</th>
                    <th className="num">{t("Ishlab chiqarildi, dona")}</th>
                    <th className="num">{t("Beton, m³")}</th>
                    <th className="num">{t("Reja bajarilishi")}</th>
                    <th className="num">{t("Jo'natildi, dona")}</th>
                    <th className="num">{t("Jo'natish, mln so'm")}</th>
                    <th className="num">{t("Material xarajati, mln so'm")}</th>
                    <th className="num">{t("Brak")}</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((f) => (
                    <tr key={f.factory.id}>
                      <td className="strong">{f.factory.name}</td>
                      <td className="num">{fmt(f.cur.fact)}</td>
                      <td className="num">{fmtN(f.cur.m3, 1)}</td>
                      <td className="num">{f.cur.planPct == null ? "—" : `${fmtN(f.cur.planPct, 0)} %`}</td>
                      <td className="num">{fmt(f.cur.shipped)}</td>
                      <td className="num">
                        {mln(f.cur.sales)} {delta(f.cur.sales, f.prev?.sales)}
                      </td>
                      <td className="num">{mln(f.cur.costTotal)}</td>
                      <td className={`num ${f.cur.brakPct > 2 ? "bad-text" : ""}`}>{f.cur.brakPct == null ? "—" : `${fmtN(f.cur.brakPct, 1)} %`}</td>
                    </tr>
                  ))}
                  <tr className="sum">
                    <td>{t("Jami")}</td>
                    <td className="num">{fmt(total.cur.fact)}</td>
                    <td className="num">{fmtN(total.cur.m3, 1)}</td>
                    <td className="num">{total.cur.planPct == null ? "—" : `${fmtN(total.cur.planPct, 0)} %`}</td>
                    <td className="num">{fmt(total.cur.shipped)}</td>
                    <td className="num">{mln(total.cur.sales)}</td>
                    <td className="num">{mln(total.cur.costTotal)}</td>
                    <td className="num">{total.cur.brakPct == null ? "—" : `${fmtN(total.cur.brakPct, 1)} %`}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="hint">{t(
              "Jo'natish — jo'natilgan mahsulot × kalkulyatsiyadagi sotuv narxi (QQS bilan). Material xarajati — ishlab chiqarish sarfi va ombor chiqimi, joriy narxlarda. ▲▼ — o'tgan oyga nisbatan."
            )}</p>
          </div>

          {/* ---------- Solishtirish ---------- */}
          {list.length > 1 && (
            <div>
              <h3>{t("Zavodlarni solishtirish — {m}", { m: monthName(month) })}</h3>
              <div className="chart-grid">
                <Chart
                  title={t("1 m³ betonga material xarajati, ming so'm")}
                  sub={t("Ishlab chiqarish sarfi ÷ quyilgan beton. Kam — yaxshi")}
                  labels={names}
                  fmt={(v) => fmt(v)}
                  series={[{ key: "m3c", label: t("1 m³ uchun"), color: "var(--s1)", values: list.map((f) => (f.cur.perM3 == null ? null : Math.round(f.cur.perM3 / 1000))) }]}
                />
                <Chart
                  title={t("Reja bajarilishi, %")}
                  labels={names}
                  fmt={(v) => `${fmtN(v, 0)} %`}
                  series={[{ key: "plan", label: t("Bajarilishi"), color: "var(--s1)", values: list.map((f) => f.cur.planPct) }]}
                />
                <Chart
                  title={t("Brak ulushi, %")}
                  sub={t("Brak ÷ (sifatli + brak). Kam — yaxshi")}
                  labels={names}
                  fmt={(v) => `${fmtN(v, 1)} %`}
                  series={[{ key: "brak", label: t("Brak"), color: "var(--s1)", values: list.map((f) => f.cur.brakPct) }]}
                />
                <Chart
                  title={t("Kuniga o'rtacha beton, m³")}
                  sub={t("Ishlab chiqarish bo'lgan kunlar bo'yicha")}
                  labels={names}
                  fmt={(v) => fmtN(v, 1)}
                  series={[{ key: "m3d", label: t("m³ / kun"), color: "var(--s1)", values: list.map((f) => f.cur.m3PerDay) }]}
                />
              </div>

              {common.length > 0 && (
                <>
                  <h3 style={{ marginTop: 18 }}>{t("Bir xil mahsulot tannarxi (kalkulyatsiya bo'yicha, QQS va marjasiz)")}</h3>
                  <div className="tbl-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>{t("Mahsulot")}</th>
                          {list.map((f) => (
                            <th key={f.factory.id} className="num">
                              {f.factory.name}
                            </th>
                          ))}
                          <th className="num">{t("Farq")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {common.slice(0, allCodes ? common.length : 8).map((x) => (
                          <tr key={x.code}>
                            <td>
                              <span className="strong">{x.code}</span>
                              {x.name && <span className="sub">{x.name}</span>}
                            </td>
                            {list.map((f) => {
                              const v = x.by.get(f.factory.id);
                              const cls = v == null || x.min === x.max ? "" : v === x.min ? "ok-text" : v === x.max ? "bad-text" : "";
                              return (
                                <td key={f.factory.id} className={`num ${cls}`}>
                                  {v == null ? "—" : fmt(v)}
                                </td>
                              );
                            })}
                            <td className="num">{x.spread ? `${fmtN(x.spread, 1)} %` : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {common.length > 8 && (
                    <button className="btn sm" style={{ marginTop: 8 }} onClick={() => setAllCodes((v) => !v)}>
                      {allCodes ? t("Qisqartirish") : t("Hammasini ko'rsatish ({n})", { n: common.length })}
                    </button>
                  )}
                  <p className="hint">{t("Yashil — eng arzon, qizil — eng qimmat tannarx. Farq — eng qimmati eng arzonidan necha foiz ortiq. Katta farq sarf normasi yoki narxlarni tekshirishga sabab.")}</p>
                </>
              )}
            </div>
          )}

          {/* ---------- Ombor va buyurtmalar ---------- */}
          <div>
            <h3>{t("Ombor va buyurtmalar — bugun")}</h3>
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t("Zavod")}</th>
                    <th className="num">{t("Materiallar, mln so'm")}</th>
                    <th className="num">{t("Tayyor mahsulot, mln so'm")}</th>
                    <th>{t("Kam qolgan / tugagan")}</th>
                    <th className="num">{t("Faol buyurtmalar")}</th>
                    <th className="num">{t("Kechikayotgan")}</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((f) => (
                    <tr key={f.factory.id}>
                      <td className="strong">{f.factory.name}</td>
                      <td className="num">{mln(f.stockValue)}</td>
                      <td className="num">{mln(f.fgValue)}</td>
                      <td>
                        {f.low.length ? (
                          <span className="sub" style={{ display: "inline" }}>
                            {f.low
                              .slice(0, 3)
                              .map((x) => x.m.name)
                              .join(", ")}
                            {f.low.length > 3 && ` +${f.low.length - 3}`}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="num">{f.orderCount}</td>
                      <td className={`num ${f.late.length ? "bad-text" : ""}`}>{f.late.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {list.some((f) => f.late.length || f.risk.length) && (
              <div className="tbl-wrap" style={{ marginTop: 12 }}>
                <table>
                  <thead>
                    <tr>
                      <th>{t("Zavod")}</th>
                      <th>{t("Buyurtma")}</th>
                      <th>{t("Mahsulot")}</th>
                      <th className="num">{t("Qoldi, dona")}</th>
                      <th>{t("Muddat")}</th>
                      <th>{t("Holat")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.flatMap((f) =>
                      [...f.late, ...f.risk].map((o) => (
                        <tr key={o.id}>
                          <td>{f.factory.name}</td>
                          <td>
                            №{o.no} {o.customer}
                          </td>
                          <td>{o.product?.code || "—"}</td>
                          <td className="num">{fmt(o.remaining)}</td>
                          <td>{fmtDate(o.deadline)}</td>
                          <td>
                            {f.late.includes(o) ? (
                              <span className="pill st-bad">
                                <Icon name="alert" size={12} /> {o.lateDays ? t("Kechikadi: {n} kun", { n: o.lateDays }) : t("Kechikmoqda")}
                              </span>
                            ) : (
                              <span className="pill st-jarayonda">{t("Xavfli")}</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function Kpi({ k, v, u, d, warn }) {
  return (
    <div className={`kpi ${warn ? "kpi-warn" : ""}`}>
      <div className="k">{k}</div>
      <div className="v">
        {v}
        <small>{u}</small>
      </div>
      {d && <div className="k kpi-prev">{tr("o'tgan oyga nisbatan")} {d}</div>}
    </div>
  );
}

/* ---------- Excel: umumiy panel (4 varaq) ---------- */
function overviewExcel(list, total, common, month, day) {
  const n1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
  const m = (v) => Math.round(v || 0);
  return {
    filename: `Umumiy_panel_${day}.xlsx`,
    sheets: [
      {
        name: tr("Kun"),
        title: tr("Kun — {d}", { d: fmtDate(day) }),
        columns: [
          { header: tr("Zavod"), key: "f", width: 24 },
          { header: tr("Reja, dona"), key: "plan", type: "int", total: "sum", width: 11 },
          { header: tr("Fakt, dona"), key: "fact", type: "int", total: "sum", width: 11 },
          { header: tr("Bajarilishi, %"), key: "pp", type: "num", width: 12 },
          { header: tr("Jo'natildi, dona"), key: "ship", type: "int", total: "sum", width: 12 },
          { header: tr("Muammolar"), key: "iss", width: 48 },
        ],
        rows: list.map((f) => {
          const iss = [];
          if (f.noReport) iss.push(tr("Kunlik hisobot kiritilmagan"));
          if (day === f.today.date && day === today()) {
            if (f.late.length) iss.push(tr("{n} ta buyurtma kechikmoqda", { n: f.late.length }));
            if (f.low.length) iss.push(tr("{n} ta material kam qoldi", { n: f.low.length }));
          }
          return { f: f.factory.name, plan: f.today.plan, fact: f.today.fact, pp: n1(f.todayPct), ship: f.today.shipped, iss: iss.join("; ") || "—", _style: iss.length ? "warn" : undefined };
        }),
        totalLabel: tr("Jami"),
      },
      {
        name: tr("Kunlik tafsilot"),
        title: tr("Kunlik tafsilot — {d}", { d: fmtDate(day) }),
        columns: [
          { header: tr("Zavod"), key: "f", width: 20 },
          { header: tr("Mahsulot"), key: "code", width: 18 },
          { header: tr("Nomi"), key: "name", width: 22 },
          { header: tr("Reja"), key: "plan", type: "int", total: "sum", width: 9 },
          { header: tr("Fakt"), key: "fact", type: "int", total: "sum", width: 9 },
          { header: tr("Bajarilishi, %"), key: "pp", type: "num", width: 11 },
          { header: tr("Brak"), key: "brak", type: "int", total: "sum", width: 8 },
          { header: tr("Jo'natildi"), key: "ship", type: "int", total: "sum", width: 10 },
          { header: tr("Buyurtmachi"), key: "cust", width: 24 },
        ],
        rows: list.flatMap((f) =>
          f.dayLines.map((x) => ({ f: f.factory.name, code: x.product?.code || "—", name: x.product?.name || "", plan: x.plan, fact: x.fact, pp: n1(pct(x.fact, x.plan)), brak: x.brak, ship: x.shipped, cust: [...x.customers].join(", ") }))
        ),
        totalLabel: tr("Jami"),
      },
      {
        name: tr("Oylik natija"),
        title: tr("Oylik natija — {m}", { m: monthName(month) }),
        columns: [
          { header: tr("Zavod"), key: "f", width: 24 },
          { header: tr("Ishlab chiqarildi, dona"), key: "fact", type: "int", total: "sum", width: 13 },
          { header: tr("Beton, m³"), key: "m3", type: "num", total: "sum", width: 11 },
          { header: tr("Reja bajarilishi"), key: "pp", type: "num", width: 12 },
          { header: tr("Jo'natildi, dona"), key: "ship", type: "int", total: "sum", width: 12 },
          { header: tr("Jo'natish, so'm"), key: "sales", type: "money", total: "sum", width: 16 },
          { header: tr("Material xarajati, so'm"), key: "cost", type: "money", total: "sum", width: 16 },
          { header: tr("Brak, dona"), key: "brak", type: "int", total: "sum", width: 10 },
          { header: tr("Brak ulushi, %"), key: "bp", type: "num", width: 11 },
          { header: tr("1 m³ betonga material, so'm"), key: "pm3", type: "money", width: 16 },
        ],
        rows: list.map((f) => ({ f: f.factory.name, fact: f.cur.fact, m3: n1(f.cur.m3), pp: n1(f.cur.planPct), ship: f.cur.shipped, sales: m(f.cur.sales), cost: m(f.cur.costTotal), brak: f.cur.brak, bp: n1(f.cur.brakPct), pm3: f.cur.perM3 == null ? null : m(f.cur.perM3) })),
        totalLabel: tr("Jami"),
        notes: [tr("Jo'natish — jo'natilgan mahsulot × kalkulyatsiyadagi sotuv narxi (QQS bilan). Material xarajati — ishlab chiqarish sarfi va ombor chiqimi, joriy narxlarda. ▲▼ — o'tgan oyga nisbatan.")],
      },
      ...(common.length
        ? [
            {
              name: tr("Tannarx solishtirish"),
              title: tr("Bir xil mahsulot tannarxi (kalkulyatsiya bo'yicha, QQS va marjasiz)"),
              columns: [
                { header: tr("Mahsulot"), key: "code", width: 18 },
                { header: tr("Nomi"), key: "name", width: 22 },
                ...list.map((f, i) => ({ header: f.factory.name, key: `f${i}`, type: "money", width: 15 })),
                { header: tr("Farq, %"), key: "spread", type: "num", width: 10 },
              ],
              rows: common.map((x) => ({ code: x.code, name: x.name, ...Object.fromEntries(list.map((f, i) => [`f${i}`, x.by.has(f.factory.id) ? m(x.by.get(f.factory.id)) : null])), spread: n1(x.spread), _style: x.spread >= 10 ? "bad" : undefined })),
            },
          ]
        : []),
      {
        name: tr("Ombor va buyurtmalar"),
        title: tr("Ombor va buyurtmalar — bugun"),
        columns: [
          { header: tr("Zavod"), key: "f", width: 24 },
          { header: tr("Materiallar, so'm"), key: "sv", type: "money", total: "sum", width: 16 },
          { header: tr("Tayyor mahsulot, so'm"), key: "fg", type: "money", total: "sum", width: 16 },
          { header: tr("Kam qolgan / tugagan"), key: "low", width: 50 },
          { header: tr("Faol buyurtmalar"), key: "ord", type: "int", total: "sum", width: 11 },
          { header: tr("Kechikayotgan"), key: "late", type: "int", total: "sum", width: 12 },
        ],
        rows: list.map((f) => ({ f: f.factory.name, sv: m(f.stockValue), fg: m(f.fgValue), low: f.low.map((x) => x.m.name).join(", ") || "—", ord: f.orderCount, late: f.late.length, _style: f.late.length ? "bad" : undefined })),
        totalLabel: tr("Jami"),
      },
    ],
  };
}
