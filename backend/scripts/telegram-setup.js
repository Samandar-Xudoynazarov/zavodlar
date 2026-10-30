import { telegramApi } from "../src/telegram.js";

const rawUrl = process.env.TELEGRAM_WEBHOOK_URL || "";
const secret = process.env.TELEGRAM_WEBHOOK_SECRET || "";
let url;
try { url = new URL(rawUrl); } catch {}
if (!url || url.protocol !== "https:" || url.username || url.password || !url.pathname.endsWith("/api/telegram/webhook")) {
  console.error("TELEGRAM_WEBHOOK_URL ni HTTPS backend manzili + /api/telegram/webhook qilib kiriting.");
  process.exitCode = 1;
} else if (!/^[A-Za-z0-9_-]{16,256}$/.test(secret) || !process.env.TELEGRAM_BOT_TOKEN?.trim()) {
  console.error("TELEGRAM_BOT_TOKEN va TELEGRAM_WEBHOOK_SECRET (16–256 ta A-Z, a-z, 0-9, _ yoki -) kerak.");
  process.exitCode = 1;
} else {
  try {
    const bot = await telegramApi("getMe");
    await telegramApi("setWebhook", {
      url: url.toString(),
      secret_token: secret,
      allowed_updates: ["message"],
    });
    console.log(`@${bot.username}: webhook ulandi. Har bir kuzatuvchi ilovada Telegramni o'z hisobiga ulasin.`);
  } catch {
    console.error("Webhook o'rnatilmadi. Bot tokeni, HTTPS backend manzili va tarmoqni tekshiring.");
    process.exitCode = 1;
  }
}