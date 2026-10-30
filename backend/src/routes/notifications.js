import { Router } from "express";
import { q, one, rows } from "../db.js";
import { isId } from "../valid.js";
import { notFound } from "../common.js";
import { flushTelegramNotifications } from "../telegram.js";

const r = Router();
const observerOnly = (req, res, next) => req.user.role === "kuzatuvchi"
  ? next()
  : res.status(403).json({ error: "Xabarnomalar kuzatuvchi roli uchun" });

// Qabul qiluvchi ro'yxatida turish yetarli emas: joriy rol va zavod ham mos bo'lishi shart.
const visible = `recipient.user_id = $1 AND current_user_row.active AND current_user_row.role = 'kuzatuvchi'
  AND (current_user_row.factory_id IS NULL OR current_user_row.factory_id = notification.factory_id)`;
const joins = `FROM notification_recipients recipient
  JOIN notifications notification ON notification.id = recipient.notification_id
  JOIN users current_user_row ON current_user_row.id = recipient.user_id`;

r.get("/notifications", observerOnly, async (req, res) => {
  try { await flushTelegramNotifications({ limit: 10 }); } catch { /* Navbat keyingi urinishgacha bazada qoladi. */ }
  const [items, count] = await Promise.all([
    rows(`SELECT notification.id, notification.factory_id, notification.date, notification.payload,
          notification.created_at, recipient.read_at ${joins} WHERE ${visible}
          ORDER BY notification.created_at DESC, notification.id DESC LIMIT 50`, [req.user.id]),
    one(`SELECT count(*) AS unread_count ${joins} WHERE ${visible} AND recipient.read_at IS NULL`, [req.user.id]),
  ]);
  res.json({ items, unreadCount: count.unreadCount });
});

r.put("/notifications/read-all", observerOnly, async (req, res) => {
  await q(`UPDATE notification_recipients target SET read_at = now()
    WHERE target.user_id = $1 AND target.read_at IS NULL AND EXISTS (
      SELECT 1 ${joins} WHERE ${visible} AND recipient.notification_id = target.notification_id
    )`, [req.user.id]);
  res.json({ ok: true });
});

r.put("/notifications/:id/read", observerOnly, async (req, res) => {
  if (!isId(req.params.id)) return notFound(res);
  const item = await one(`UPDATE notification_recipients target SET read_at = COALESCE(target.read_at, now())
    WHERE target.user_id = $1 AND target.notification_id = $2 AND EXISTS (
      SELECT 1 ${joins} WHERE ${visible} AND recipient.notification_id = target.notification_id
    ) RETURNING target.notification_id AS id, target.read_at`, [req.user.id, req.params.id]);
  if (!item) return notFound(res);
  res.json({ ok: true, ...item });
});

export default r;
