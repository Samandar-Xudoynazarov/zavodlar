// Umumiy panel: barcha zavodlar bir ekranda (faqat bosh ofis foydalanuvchilari)
import { Router } from "express";
import { rows } from "../db.js";
import { validDate } from "../valid.js";
import { getSettings, openingOf, loadDays, loadMoves, loadPmoves, todayTashkent } from "../common.js";
import { stockReport } from "../stock.js";
import { planOrders, isWorkDay, planConfig } from "../plan.js";
import { dashAggregate, monthShift, planInput } from "./production.js";

const r = Router();
const OPEN0 = "0000-00-00";

/** Bitta zavod bo'yicha: tanlangan kun, oy, o'tgan oy, qoldiq, buyurtmalar. Pul hisobi (narx, tannarx) brauzerda — kalkulyatsiya bilan bir xil formulada. */
async function factorySummary(f, month, today, day) {
  const fid = f.id;
  const last = month === today.slice(0, 7) ? today : `${month}-31`;
  const prev = monthShift(month, -1);
  const [settings, materials, products, [cur], [prv], [dayAgg], dayDoc, stock, plan, orders] = await Promise.all([
    getSettings(fid),
    rows("SELECT id, name, unit, grp, price, stock, min_qty, archived, recipe, writeoff, is_electrode, electrode_base FROM materials WHERE factory_id = $1 ORDER BY sort, name", [fid]),
    rows("SELECT id, code, name, grp, norms, calc FROM products WHERE factory_id = $1 ORDER BY sort, code", [fid]),
    dashAggregate(fid, [month], (d) => d.slice(0, 7), `${month}-01`, last),
    dashAggregate(fid, [prev], (d) => d.slice(0, 7), `${prev}-01`, `${prev}-31`),
    dashAggregate(fid, [day], (d) => d, day, day),
    rows("SELECT production, shipments, note FROM days WHERE factory_id = $1 AND date = $2", [fid, day]).then((x) => x[0] || null),
    (async () => {
      const opening = await openingOf(fid);
      const start = opening.date || OPEN0;
      const [days, moves, pmoves] = await Promise.all([loadDays(fid, start, today), loadMoves(fid, start, today), loadPmoves(fid, start, today)]);
      const s = stockReport(opening, days, today, today, moves, pmoves);
      const pick = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.end]));
      return { materials: pick(s.materials), products: pick(s.products) };
    })(),
    planInput(fid).then(planOrders),
    rows("SELECT count(*) AS n FROM orders WHERE factory_id = $1 AND status <> 'topshirildi'", [fid]),
  ]);
  const reported = (dayDoc?.production || []).length > 0;
  return {
    factory: { id: f.id, code: f.code, name: f.name, kind: f.kind },
    settings: { costSchemes: settings.costSchemes || [], electrodePct: settings.electrodePct },
    materials,
    products,
    // tanlangan kun (standart — bugun): jami va kunlik hisobotning o'zi (mahsulotlar bo'yicha)
    today: { date: day, workDay: isWorkDay(day, planConfig(settings.plan)), reported, ...dayAgg },
    day: { production: dayDoc?.production || [], shipments: dayDoc?.shipments || [], note: dayDoc?.note || "" },
    month: cur,
    prevMonth: prv,
    stock,
    orderCount: orders[0]?.n || 0, // faol buyurtmalar soni
    // faol buyurtmalarning har bir mahsuloti (reja bo'yicha holati bilan)
    orders: plan.orders.map((p) => ({ id: p.id, orderId: p.orderId, no: p.no, customer: p.customer, contractNo: p.contractNo || "", productId: p.productId, qty: p.qty, deadline: p.deadline, shipped: p.shipped, remaining: p.remaining, plan: p.status, finish: p.finish, lateDays: p.lateDays })),
  };
}

// ?month=YYYY-MM (bo'lmasa — joriy oy) · ?day=YYYY-MM-DD (bo'lmasa — bugun)
r.get("/overview", async (req, res) => {
  if (req.user.factoryId) return res.status(403).json({ error: "Umumiy panel faqat bosh ofis foydalanuvchilari uchun" });
  const today = todayTashkent();
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(req.query.month || "")) && req.query.month <= today.slice(0, 7) ? req.query.month : today.slice(0, 7);
  const day = validDate(req.query.day) && req.query.day <= today ? req.query.day : today;
  const list = req.factories.filter((f) => !f.archived);
  const factories = await Promise.all(list.map((f) => factorySummary(f, month, today, day)));
  res.json({ today, day, month, prevMonth: monthShift(month, -1), factories });
});

export default r;
