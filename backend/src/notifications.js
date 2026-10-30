import { one, rows } from "./db.js";

/** Reja faqat mahsulot va miqdordan iborat: fakt, brak, izoh va qator tartibi ta'sir qilmaydi. */
export function normalizedPlan(production = []) {
  const quantities = new Map();
  for (const line of production || []) {
    const productId = String(line?.productId || "").toLowerCase();
    const plan = Number(line?.plan || 0);
    if (!productId || !Number.isFinite(plan) || plan <= 0) continue;
    const list = quantities.get(productId) || [];
    list.push(plan);
    quantities.set(productId, list);
  }
  return [...quantities].sort(([a], [b]) => a.localeCompare(b)).map(([productId, plans]) => ({
    productId,
    // Bir mahsulot takroriy qatorlarda ham bo'lishi mumkin; summani tartibdan mustaqil hisoblaymiz.
    plan: plans.sort((a, b) => a - b).reduce((sum, qty) => sum + qty, 0),
  }));
}

/** Kunlik yozuv bilan bir xil tranzaksiya va kun qulfi ichida chaqiriladi. */
export async function createDailyPlanNotification(req, before, doc, client) {
  const oldPlan = normalizedPlan(before?.production);
  const plan = normalizedPlan(doc?.production);
  if (JSON.stringify(oldPlan) === JSON.stringify(plan)) return null;

  const catalog = plan.length
    ? await rows("SELECT id, code, name FROM products WHERE factory_id = $1 AND id = ANY($2::uuid[])", [req.factoryId, plan.map((line) => line.productId)], client)
    : [];
  const products = new Map(catalog.map((product) => [product.id, product]));
  const factory = await one("SELECT name FROM factories WHERE id = $1", [req.factoryId], client);
  const payload = {
    factoryName: factory?.name || req.factory?.name || "Zavod",
    authorName: req.user.name || req.user.username,
    lines: plan.map((line) => ({ ...line, code: products.get(line.productId)?.code || "", name: products.get(line.productId)?.name || "" })),
    total: plan.reduce((sum, line) => sum + line.plan, 0),
    action: plan.length ? (oldPlan.length ? "updated" : "created") : "cleared",
  };
  const notification = await one(
    "INSERT INTO notifications (factory_id, date, payload) VALUES ($1, $2, $3::jsonb) RETURNING id",
    [req.factoryId, doc.date, JSON.stringify(payload)],
    client
  );
  await client.query(
    `INSERT INTO notification_recipients (notification_id, user_id)
     SELECT $1, id FROM users
     WHERE active AND role = 'kuzatuvchi' AND (factory_id IS NULL OR factory_id = $2)`,
    [notification.id, req.factoryId]
  );
  return notification.id;
}
