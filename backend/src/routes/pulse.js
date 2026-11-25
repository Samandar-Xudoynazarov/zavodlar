// Bosh panel: /api/pulse (bitta zavod — direktor ekrani), /api/pulse/all (4 zavod — kuzatuvchi markazi, pulsiz)
import { Router } from "express";
import { factoryPulse } from "../pulse.js";
import { FINANCE_ROLES } from "../dispatch.js";
import { noMoney } from "../no-money.js";
import { todayTashkent } from "../common.js";

const r = Router();

export function headline(list) {
  if (!list.length) return "Zavodlar yo'q";
  const withPlan = list.filter((p) => p.month.planPct !== null);
  const worst = [...withPlan].sort((a, b) => a.month.planPct - b.month.planPct)[0];
  const reds = list.filter((p) => p.status === "red").length;
  if (worst && worst.month.planPct < 95) return `${worst.factory.name} oylik rejadan ${Math.round(100 - worst.month.planPct)}% orqada${reds > 1 ? ` · yana ${reds - 1} ta zavodda qizil signal` : ""}`;
  if (reds) return `${reds} ta zavodda diqqat talab qiladigan holat bor`;
  return "Barcha zavodlar reja bo'yicha ketmoqda";
}

export async function allPulse(factories, today = todayTashkent()) {
  // kuzatuvchi uchun tasdiqlar — direktorning ishi, signal emas
  const list = (await Promise.all(factories.filter((f) => !f.archived).map((f) => factoryPulse(f, { today })))).map((p) => {
    const signals = p.signals.filter((s) => s.kind !== "approvals");
    return { ...p, signals, status: signals.some((s) => s.level === "red") ? "red" : signals.length ? "amber" : "ok" };
  });
  const sum = (fn) => list.reduce((s, p) => s + (fn(p) || 0), 0);
  const planToDate = sum((p) => p.month.planToDate), fact = sum((p) => p.month.fact), brak = sum((p) => p.month.brak);
  const ranking = [...list].sort((a, b) => (b.month.planPct ?? -1) - (a.month.planPct ?? -1)).map((p) => p.factory.id);
  return {
    today, headline: headline(list), ranking,
    total: {
      planToDate, fact, planPct: planToDate > 0 ? Math.round((fact / planToDate) * 1000) / 10 : null,
      brakPct: fact + brak > 0 ? Math.round((brak / (fact + brak)) * 1000) / 10 : null,
      yesterdayFact: sum((p) => p.yesterday.fact), yesterdayPlan: sum((p) => p.yesterday.plan),
      lateOrders: sum((p) => p.orders.late.length), reds: list.filter((p) => p.status === "red").length,
      notReported: list.filter((p) => p.signals.some((s) => s.kind === "report")).length,
    },
    factories: list,
  };
}

r.get("/pulse/all", async (req, res) => {
  if (req.user.factoryId) return res.status(403).json({ error: "Barcha zavodlar paneli faqat bosh ofis uchun" });
  res.set("Cache-Control", "no-store");
  res.json(await allPulse(req.factories));
});

r.get("/pulse", async (req, res) => {
  const money = FINANCE_ROLES.includes(req.user.role) && !noMoney(req.user);
  // bosh ofis foydalanuvchisi boshqa zavodni tanlamasdan ko'rishi mumkin: ?id=<zavod>
  const f = !req.user.factoryId && req.query.id ? req.factories.find((x) => x.id === req.query.id && !x.archived) : req.factory;
  if (!f) return res.status(404).json({ error: "Zavod topilmadi" });
  res.set("Cache-Control", "no-store");
  res.json({ ...(await factoryPulse(f, { money, detail: true })), canMoney: money });
});

export default r;
