import { Router } from "express";
import { createTelegramLink, disconnectTelegram, getTelegramStatus, processTelegramUpdate, TelegramApiError, validTelegramSecret } from "../telegram.js";

const r = Router();
const observerOnly = (req, res, next) =>
  req.user?.active && req.user.role === "kuzatuvchi" ? next() : res.status(403).json({ error: "Telegram xabarlari faqat kuzatuvchi uchun" });

r.get("/notifications/telegram", observerOnly, async (req, res) => {
  res.json(await getTelegramStatus(req.user));
});

r.post("/notifications/telegram/link", observerOnly, async (req, res) => {
  try {
    const link = await createTelegramLink(req.user);
    if (!link) return res.status(503).json({ error: "Telegram bot hali sozlanmagan. Administrator bot va webhook sozlamalarini kiritsin" });
    res.json(link);
  } catch (error) {
    if (!(error instanceof TelegramApiError)) throw error;
    res.status(503).json({ error: "Telegram botga ulanib bo'lmadi. Administrator bot sozlamalarini tekshirsin" });
  }
});

r.delete("/notifications/telegram", observerOnly, async (req, res) => {
  await disconnectTelegram(req.user);
  res.json({ ok: true });
});

export const telegramWebhook = Router();
telegramWebhook.post("/", async (req, res) => {
  if (!validTelegramSecret(req.get("X-Telegram-Bot-Api-Secret-Token"))) {
    return res.status(403).json({ error: "Webhook tasdiqlanmadi" });
  }
  const linked = await processTelegramUpdate(req.body);
  // Unsupported updates and a replay receive 200, without repeating state changes.
  if (linked) {
    return res.json({
      method: "sendMessage",
      chat_id: req.body.message.chat.id,
      text: "Telegram ulandi. Endi sizga kunlik reja qo'yilganda va o'zgartirilganda xabar keladi.",
    });
  }
  res.json({ ok: true });
});

export default r;