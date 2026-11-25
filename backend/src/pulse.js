// Rahbar va kuzatuvchi uchun zavod «puls»i: bitta zavod bo'yicha bugungi holat, oy rejasi, ombor zaxirasi,
// buyurtmalar xavfi, tasdiq kutayotganlar va qizil signallar. Ekran (bosh panel) va Telegram ertalabki hisoboti
// shu bitta hisobdan foydalanadi. Pul qismi (money) faqat ruxsat berilganda qo'shiladi.
import { rows, one } from "./db.js";
import { getSettings, loadDays, loadMoves, loadPmoves, todayTashkent } from "./common.js";
import { stockReport } from "./stock.js";
import { planOrders, isWorkDay, planConfig } from "./plan.js";
import { planInput } from "./routes/production.js";
import { factoryProfit } from "./routes/finance-profit.js";
import { money as round2 } from "./payroll.js";

const OPEN0 = "0000-00-00";
export const addDays = (d, n) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
const r1 = (x) => Math.round(x * 10) / 10;
const sumLines = (list, k) => (list || []).reduce((s, l) => s + (+l?.[k] || 0), 0);

// Signal chegaralari
export const LIMITS = { planRed: 80, planAmber: 95, brakAmber: 2, brakRed: 4, stockRed: 3, stockAmber: 7 };

/** Oxirgi ish kuni (bugundan oldin) — ertalabki hisobot va «kecha topshirilmadi» uchun */
function lastWorkDay(today, cfg) {
  for (let i = 1; i <= 7; i++) { const d = addDays(today, -i); if (isWorkDay(d, cfg)) return d; }
  return addDays(today, -1);
}

function dayStat(doc) {
  const production = doc?.production || [];
  const plan = sumLines(production, "plan"), fact = sumLines(production, "fact"), brak = sumLines(production, "brak");
  return {
    date: doc?.date || null, plan, fact, brak, shipped: sumLines(doc?.shipments, "qty"),
    reported: production.some((l) => +l.fact > 0 || +l.brak > 0) || (doc?.shipments || []).length > 0,
    review: doc?.reviewStatus || null, planPct: pct(fact, plan), brakPct: fact + brak > 0 ? r1((brak / (fact + brak)) * 100) : null,
  };
}

/**
 * f: factories qatori. opts.money — moliya (tushum, foyda, qarz, kassa) qo'shilsinmi.
 * Natijada narx/summa faqat `money` ichida bo'ladi.
 */
export async function factoryPulse(f, { today = todayTashkent(), money = false, detail = false } = {}) {
  const fid = f.id, month = today.slice(0, 7), monthStart = `${month}-01`;
  const trendFrom = addDays(today, -24), windowFrom = addDays(today, -14);
  const from = trendFrom < monthStart ? trendFrom : monthStart;
  const settings = await getSettings(fid);
  const cfg = planConfig(settings.plan);
  const opening = settings.opening?.date ? settings.opening : { date: "", materials: {}, products: {} };
  const [materials, products, days, mplan, stockDays, moves, pmoves, winMoves, submitted, invDraft, wfDraft, input] = await Promise.all([
    rows("SELECT id, name, unit, min_qty FROM materials WHERE factory_id = $1 AND NOT archived ORDER BY sort, name", [fid]),
    rows("SELECT id, code, name FROM products WHERE factory_id = $1", [fid]),
    rows("SELECT date, production, shipments, review_status FROM days WHERE factory_id = $1 AND date >= $2 AND date <= $3 ORDER BY date", [fid, from, today]),
    one("SELECT rows FROM month_plans WHERE factory_id = $1 AND month = $2", [fid, month]),
    loadDays(fid, opening.date || OPEN0, today),
    loadMoves(fid, opening.date || OPEN0, today),
    loadPmoves(fid, opening.date || OPEN0, today),
    loadMoves(fid, windowFrom, addDays(today, -1), null, "AND reason <> 'inventar'"),
    rows("SELECT date FROM days WHERE factory_id = $1 AND review_status = 'submitted' ORDER BY date DESC LIMIT 20", [fid]),
    rows("SELECT count(*)::int AS n FROM inventories WHERE factory_id = $1 AND status = 'draft'", [fid]),
    rows("SELECT count(*)::int AS n FROM hr_records WHERE factory_id = $1 AND status = 'draft'", [fid]).catch(() => [{ n: 0 }]),
    planInput(fid),
  ]);
  const byDate = new Map(days.map((d) => [d.date, d]));
  const prodName = new Map(products.map((p) => [p.id, p.code || p.name]));

  // kun va kecha
  const todayStat = dayStat(byDate.get(today) || { date: today });
  const prevDay = lastWorkDay(today, cfg);
  const yesterday = dayStat(byDate.get(prevDay) || { date: prevDay });

  // oy: fakt va reja (tasdiqlangan oylik reja bo'lsa — o'sha, bo'lmasa kunlik rejalar yig'indisi)
  const cutoff = todayStat.reported ? today : addDays(today, -1);
  const monthDays = days.filter((d) => d.date >= monthStart && d.date <= today);
  const fact = monthDays.reduce((s, d) => s + sumLines(d.production, "fact"), 0);
  const brak = monthDays.reduce((s, d) => s + sumLines(d.production, "brak"), 0);
  const dailyPlanToDate = monthDays.filter((d) => d.date <= cutoff).reduce((s, d) => s + sumLines(d.production, "plan"), 0);
  let planTotal = null, planToDate = dailyPlanToDate, planSource = "kunlik";
  if (mplan?.rows?.length) {
    const upto = cutoff < monthStart ? 0 : Number(cutoff.slice(8, 10));
    planTotal = 0; let toDate = 0;
    for (const row of mplan.rows) (row.days || []).forEach((q, i) => { planTotal += +q || 0; if (i < upto) toDate += +q || 0; });
    if (planTotal > 0) { planToDate = toDate; planSource = "oylik"; } else planTotal = null;
  }
  const factToDate = monthDays.filter((d) => d.date <= cutoff).reduce((s, d) => s + sumLines(d.production, "fact"), 0);
  const monthStat = { month, fact, brak, planToDate, planTotal, planSource, planPct: pct(factToDate, planToDate), brakPct: fact + brak > 0 ? r1((brak / (fact + brak)) * 100) : null };

  // so'nggi 25 kun
  const trend = [];
  for (let d = trendFrom; d <= today; d = addDays(d, 1)) { const s = dayStat(byDate.get(d) || { date: d }); trend.push({ date: d, plan: s.plan, fact: s.fact, brak: s.brak }); }

  // ombor: qoldiq va necha kunga yetadi (so'nggi 14 kunlik o'rtacha sarf + chiqim)
  const stockNow = stockReport(opening, stockDays, today, today, moves, pmoves).materials;
  const win = stockReport({ date: windowFrom, materials: {}, products: {} }, stockDays.filter((d) => d.date >= windowFrom && d.date < today), windowFrom, addDays(today, -1), winMoves, []).materials;
  const stock = materials.map((m) => {
    const qty = r1(stockNow[m.id]?.end || 0);
    const used = (win[m.id]?.sarf || 0) + (win[m.id]?.chiqim || 0);
    const perDay = used / 14;
    const daysLeft = perDay > 0 ? Math.max(0, Math.floor(qty / perDay)) : null;
    const min = +m.minQty || 0;
    const level = (daysLeft !== null && daysLeft <= LIMITS.stockRed) || (min > 0 && qty < min / 2) ? "red" : (daysLeft !== null && daysLeft <= LIMITS.stockAmber) || (min > 0 && qty < min) ? "amber" : "ok";
    return { id: m.id, name: m.name, unit: m.unit, qty, perDay: r1(perDay), daysLeft, min, level };
  }).filter((m) => m.perDay > 0 || m.min > 0);
  stock.sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999));

  // buyurtmalar: reja bo'yicha kechikish xavfi
  const plan = planOrders(input);
  const lines = plan.orders.filter((o) => !o.extra);
  const orderLine = (o) => ({ no: o.no, customer: o.customer, product: prodName.get(o.productId) || "", remaining: o.remaining, deadline: o.deadline, finish: o.finish, lateDays: o.lateDays, status: o.status, needPerDay: o.needPerDay });
  const late = lines.filter((o) => o.status === "late" || o.status === "nocap" || (o.deadline && o.deadline < today && o.remaining > 0)).map(orderLine);
  const risk = lines.filter((o) => o.status === "risk").map(orderLine);
  const orders = { active: new Set(lines.map((o) => o.orderId || o.id)).size, lines: lines.length, late, risk };

  // tasdiq kutayotganlar
  const approvals = { days: submitted.map((d) => d.date), inventories: invDraft[0]?.n || 0, workforce: wfDraft[0]?.n || 0 };
  approvals.total = approvals.days.length + approvals.inventories + approvals.workforce;

  // signallar
  const signals = [];
  const add = (level, kind, text) => signals.push({ level, kind, text });
  if (isWorkDay(prevDay, cfg) && !yesterday.reported) add("red", "report", `${fmtDay(prevDay)} hisobot topshirilmagan`);
  if (monthStat.planPct !== null && monthStat.planPct < LIMITS.planAmber) add(monthStat.planPct < LIMITS.planRed ? "red" : "amber", "plan", `Oylik reja ${c(monthStat.planPct)}% — rejadan ${c(r1(100 - monthStat.planPct))}% orqada`);
  if (yesterday.brakPct !== null && yesterday.brakPct >= LIMITS.brakAmber) add(yesterday.brakPct >= LIMITS.brakRed ? "red" : "amber", "brak", `Brak ${c(yesterday.brakPct)}% (${fmtDay(prevDay)})`);
  else if (monthStat.brakPct !== null && monthStat.brakPct >= LIMITS.brakAmber) add(monthStat.brakPct >= LIMITS.brakRed ? "red" : "amber", "brak", `Oy bo'yicha brak ${c(monthStat.brakPct)}%`);
  if (late.length) add("red", "orders", `${late.length} ta buyurtma qatori muddatdan kechikadi`);
  else if (risk.length) add("amber", "orders", `${risk.length} ta buyurtma qatori muddatga xavfli`);
  for (const m of stock.filter((x) => x.level !== "ok").slice(0, 3)) add(m.level, "stock", m.daysLeft !== null ? `${m.name}: ${m.daysLeft} kunga yetadi` : `${m.name}: minimal qoldiqdan kam`);
  if (approvals.days.length) add("amber", "approvals", `${approvals.days.length} ta kunlik hisobot tasdiq kutmoqda`);
  signals.sort((a, b) => (a.level === b.level ? 0 : a.level === "red" ? -1 : 1));

  const out = {
    factory: { id: f.id, code: f.code, name: f.name, kind: f.kind },
    today, prevDay, day: todayStat, yesterday, month: monthStat, trend,
    stock: detail ? stock : stock.filter((m) => m.level !== "ok").slice(0, 5),
    orders: detail ? orders : { ...orders, late: late.slice(0, 5), risk: risk.slice(0, 5) },
    approvals, signals,
    status: signals.some((s) => s.level === "red") ? "red" : signals.length ? "amber" : "ok",
  };
  if (money) out.money = await moneyPulse(fid, today);
  return out;
}

const c = (x) => String(x).replace(".", ","); // o'zbekcha o'nlik vergul
const fmtDay = (d) => d.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$3.$2");

/** Faqat zavod direktori (rahbar), buxgalter va admin uchun */
async function moneyPulse(fid, today) {
  const month = today.slice(0, 7);
  const prev = addDays(`${month}-01`, -1).slice(0, 7);
  const [profit, [debt], cash] = await Promise.all([
    factoryProfit(undefined, fid, [prev, month]),
    rows(`SELECT COALESCE(sum(greatest(COALESCE(i.amount,0)-COALESCE(r.amount,0),0)),0) AS receivable
      FROM orders o
      LEFT JOIN (SELECT order_id,sum(amount) AS amount FROM finance_invoices WHERE factory_id=$1 AND voided_at IS NULL GROUP BY order_id) i ON i.order_id=o.id
      LEFT JOIN (SELECT order_id,sum(amount) AS amount FROM finance_receipts WHERE factory_id=$1 AND voided_at IS NULL GROUP BY order_id) r ON r.order_id=o.id
      WHERE o.factory_id=$1`, [fid]),
    rows(`SELECT a.kind, a.opening_balance + COALESCE(sum(CASE WHEN e.direction='in' THEN e.amount ELSE -e.amount END) FILTER (WHERE e.id IS NOT NULL),0) AS bal
      FROM finance_cash_accounts a
      LEFT JOIN finance_cash_entries e ON e.account_id=a.id AND e.voided_at IS NULL AND e.date >= a.opening_date AND e.date <= $2
      WHERE a.factory_id=$1 AND NOT a.archived GROUP BY a.id`, [fid, today]).catch(() => []),
  ]);
  const [p0, p1] = profit;
  const cashTotal = cash.reduce((s, a) => s + (+a.bal || 0), 0);
  return {
    month: { revenue: p1.revenue, costs: p1.costs, profit: p1.profit, margin: p1.margin, complete: p1.complete },
    prevMonth: { month: prev, revenue: p0.revenue, profit: p0.profit, complete: p0.complete },
    receivable: round2(+debt?.receivable || 0),
    cash: { total: round2(cashTotal), accounts: cash.length },
  };
}
