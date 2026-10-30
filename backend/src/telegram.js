import crypto from "node:crypto";
import { one, tx } from "./db.js";
import { safeEqual } from "./auth.js";

const LINK_MINUTES = 10;
const REQUEST_TIMEOUT = 5000;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,64}$/;
const SECRET_PATTERN = /^[A-Za-z0-9_-]{16,256}$/;
const usernameOf = (value) => String(value || "").trim().replace(/^@/, "");
const observer = (user) => Boolean(user?.active && user.role === "kuzatuvchi");
const tokenHash = (token) => crypto.createHash("sha256").update(token).digest("hex");
let cachedBot = null;

export function telegramConfigured() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim() && SECRET_PATTERN.test(process.env.TELEGRAM_WEBHOOK_SECRET || ""));
}

export class TelegramApiError extends Error {
  constructor(code, retryAfter = 0) {
    super(code === 403 ? "Telegram bot bloklangan" : code === 429 ? "Telegram so'rov chegarasi" : "Telegram xabarni qabul qilmadi");
    this.name = "TelegramApiError";
    this.code = Number(code) || 0;
    this.retryAfter = Number(retryAfter) || 0;
  }
}

// Never expose a request URL, token, response body, or network exception in errors/logs.
export async function telegramApi(method, body = {}) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new TelegramApiError(0);
  let response;
  let data;
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });
    data = await response.json();
  } catch {
    throw new TelegramApiError(0);
  }
  if (!response.ok || !data?.ok) throw new TelegramApiError(data?.error_code || response.status, data?.parameters?.retry_after);
  return data.result;
}

async function botUsername() {
  const configured = usernameOf(process.env.TELEGRAM_BOT_USERNAME);
  if (/^[A-Za-z0-9_]{5,32}$/.test(configured)) return configured;
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return "";
  if (cachedBot?.token === token && cachedBot.expires > Date.now()) return cachedBot.username;
  const bot = await telegramApi("getMe");
  const username = usernameOf(bot?.username);
  if (!/^[A-Za-z0-9_]{5,32}$/.test(username)) throw new TelegramApiError(0);
  cachedBot = { token, username, expires: Date.now() + 3600000 };
  return username;
}

export async function getTelegramStatus(user) {
  const subscription = await one("SELECT username FROM telegram_subscriptions WHERE user_id=$1", [user.id]);
  const configured = telegramConfigured();
  let name = usernameOf(process.env.TELEGRAM_BOT_USERNAME);
  if (configured && !name) {
    try { name = await botUsername(); } catch { name = ""; }
  }
  return { configured, connected: Boolean(subscription), botUsername: name, username: subscription?.username || "" };
}

export async function createTelegramLink(user) {
  if (!telegramConfigured()) return null;
  const name = await botUsername();
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = await tx(async (client) => {
    const current = await one("SELECT * FROM users WHERE id=$1 FOR UPDATE", [user.id], client);
    if (!observer(current)) return null;
    await client.query("DELETE FROM telegram_link_tokens WHERE expires_at <= now()");
    const result = await one(
      "INSERT INTO telegram_link_tokens(token_hash,user_id,expires_at) VALUES ($1,$2,now()+interval '10 minutes') ON CONFLICT(user_id) DO UPDATE SET token_hash=excluded.token_hash,expires_at=excluded.expires_at RETURNING expires_at",
      [tokenHash(token), user.id], client,
    );
    return result.expiresAt;
  });
  if (!expiresAt) return null;
  return { url: `https://t.me/${name}?start=${token}`, expiresAt, expiresInMinutes: LINK_MINUTES };
}

export async function disconnectTelegram(user) {
  await tx(async (client) => {
    await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [user.id]);
    await client.query("DELETE FROM telegram_link_tokens WHERE user_id=$1", [user.id]);
    await client.query("DELETE FROM telegram_subscriptions WHERE user_id=$1", [user.id]);
  });
}

export function validTelegramSecret(value) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET || "";
  return telegramConfigured() && typeof value === "string" && safeEqual(value, secret);
}

// A /start token is one-use, hash-only in storage, and valid in a private human chat.
// Taking the user lock before deleting the token serializes linking and disconnects.
export async function processTelegramUpdate(update) {
  const message = update?.message;
  if (!Number.isSafeInteger(update?.update_id) || !message || message.chat?.type !== "private" || message.from?.is_bot || message.forward_origin) return false;
  const chatId = message.chat?.id;
  if (!Number.isSafeInteger(chatId) || chatId <= 0 || message.from?.id !== chatId) return false;
  const match = typeof message.text === "string" && message.text.trim().match(/^\/start(?:@[A-Za-z0-9_]+)?\s+([A-Za-z0-9_-]{32,64})$/);
  if (!match || !TOKEN_PATTERN.test(match[1])) return false;
  const hash = tokenHash(match[1]);
  const pending = await one("SELECT user_id FROM telegram_link_tokens WHERE token_hash=$1 AND expires_at > now()", [hash]);
  if (!pending) return false;
  try {
    return await tx(async (client) => {
      const user = await one("SELECT * FROM users WHERE id=$1 FOR UPDATE", [pending.userId], client);
      if (!observer(user)) return false;
      const consumed = await client.query("DELETE FROM telegram_link_tokens WHERE token_hash=$1 AND user_id=$2 AND expires_at > now() RETURNING user_id", [hash, user.id]);
      if (!consumed.rowCount) return false;
      const existing = await one("SELECT user_id FROM telegram_subscriptions WHERE chat_id=$1", [String(chatId)], client);
      if (existing && existing.userId !== user.id) return false;
      await client.query(
        "INSERT INTO telegram_subscriptions(user_id,chat_id,username,linked_at) VALUES ($1,$2,$3,now()) ON CONFLICT(user_id) DO UPDATE SET chat_id=excluded.chat_id,username=excluded.username,linked_at=excluded.linked_at",
        [user.id, String(chatId), usernameOf(message.from?.username).slice(0, 64)],
      );
      return true;
    });
  } catch (error) {
    if (error?.code === "23505") return false;
    throw error;
  }
}

const cleanText = (value, max = 160) => String(value ?? "").replace(/[\r\n\t]/g, " ").slice(0, max);
const quantity = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString("uz-UZ", { maximumFractionDigits: 3 }) : "0";
};

export function formatTelegramNotification(notification) {
  const payload = notification.payload || {};
  const action = payload.action === "cleared" ? "Kunlik reja bekor qilindi" : payload.action === "updated" ? "Kunlik reja yangilandi" : "Kunlik reja qo'yildi";
  const date = String(notification.date || "").replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$3.$2.$1");
  const header = [
    action,
    `Zavod: ${cleanText(payload.factoryName)}`,
    `Sana: ${cleanText(date, 20)}`,
    `Mas'ul: ${cleanText(payload.authorName)}`,
    `Jami reja: ${quantity(payload.total)} dona`,
  ];
  const lines = Array.isArray(payload.lines) ? payload.lines : [];
  const products = lines.slice(0, 20).map((line) => `• ${cleanText(line.code || line.name, 100)}: ${quantity(line.plan)} dona`);
  if (lines.length > products.length) products.push(`… yana ${lines.length - products.length} ta mahsulot`);
  let link = "";
  try {
    if (process.env.APP_PUBLIC_URL) {
      const url = new URL(process.env.APP_PUBLIC_URL);
      if (["https:", "http:"].includes(url.protocol)) {
        url.searchParams.set("factory", notification.factoryId || "");
        url.searchParams.set("day", String(notification.date || ""));
        link = `\n\nHisobotni ochish: ${url.toString().slice(0, 1000)}`;
      }
    }
  } catch {}
  return [...header, "", ...products].join("\n").slice(0, 4096 - link.length) + link;
}

// Delivery records share the daily-plan transaction. A separate post-commit
// transaction locks each due recipient so concurrent workers cannot send it twice.
// No subscription / a later link / changed factory or role excludes old delivery.
export async function flushTelegramNotifications({ notificationId, limit = 10 } = {}) {
  if (!telegramConfigured()) return { configured: false, sent: 0, failed: 0 };
  const batchLimit = Math.max(1, Math.min(10, Math.floor(Number(limit) || 10)));
  return tx(async (client) => {
    const pending = (await client.query(
      `SELECT r.notification_id, r.user_id, r.telegram_attempts, n.factory_id, n.date, n.payload, s.chat_id
       FROM notification_recipients r
       JOIN notifications n ON n.id=r.notification_id
       JOIN users u ON u.id=r.user_id
       JOIN factories f ON f.id=n.factory_id
       JOIN telegram_subscriptions s ON s.user_id=u.id
       WHERE r.telegram_sent_at IS NULL AND r.telegram_next_attempt_at <= now()
         AND u.active AND u.role='kuzatuvchi' AND (u.factory_id IS NULL OR u.factory_id=n.factory_id)
         AND NOT f.archived AND n.created_at >= s.linked_at
         AND s.chat_id ~ '^[1-9][0-9]*$'
         AND ($1::uuid IS NULL OR n.id=$1::uuid)
       ORDER BY n.created_at, r.user_id LIMIT $2 FOR UPDATE OF r SKIP LOCKED`,
      [notificationId || null, batchLimit],
    )).rows;
    const deliveries = await Promise.all(pending.map(async (item) => {
      try {
        await telegramApi("sendMessage", {
          chat_id: item.chat_id,
          text: formatTelegramNotification({ date: item.date, factoryId: item.factory_id, payload: item.payload }),
          link_preview_options: { is_disabled: true },
        });
        return { item, error: null };
      } catch (error) {
        return { item, error };
      }
    }));
    let sent = 0;
    let failed = 0;
    for (const { item, error } of deliveries) {
      if (!error) {
        await client.query(
          "UPDATE notification_recipients SET telegram_sent_at=now(),telegram_attempts=telegram_attempts+1,telegram_error=NULL,telegram_next_attempt_at=NULL WHERE notification_id=$1 AND user_id=$2",
          [item.notification_id, item.user_id],
        );
        sent++;
      } else {
        const attempts = item.telegram_attempts + 1;
        const permanent = [400, 401, 403].includes(error.code) || attempts >= 10;
        const delay = Math.min(86400, Math.max(30 * 2 ** Math.min(attempts - 1, 10), error.retryAfter || 0));
        await client.query(
          "UPDATE notification_recipients SET telegram_attempts=$3,telegram_error=$4,telegram_next_attempt_at=CASE WHEN $5 THEN NULL ELSE now()+$6*interval '1 second' END WHERE notification_id=$1 AND user_id=$2",
          [item.notification_id, item.user_id, attempts, String(error.message || "Telegram yuborish xatosi").slice(0, 160), permanent, delay],
        );
        if (error.code === 403) await client.query("DELETE FROM telegram_subscriptions WHERE user_id=$1 AND chat_id=$2", [item.user_id, item.chat_id]);
        failed++;
      }
    }
    return { configured: true, sent, failed };
  });
}
// Send every currently due recipient of the newly saved plan in bounded batches.
// Polling and the local worker still use a single flush; immediate delivery needs
// to drain more than the first ten observers even when nobody opens the inbox.
// Stop starting new batches after 20 seconds, leaving leftovers durably queued.
export async function deliverTelegramNotification(notificationId) {
  const result = { configured: telegramConfigured(), sent: 0, failed: 0 };
  if (!notificationId || !result.configured) return result;
  const deadline = Date.now() + 20000;
  do {
    const batch = await flushTelegramNotifications({ notificationId, limit: 10 });
    result.configured = batch.configured;
    result.sent += batch.sent;
    result.failed += batch.failed;
    if (!batch.configured || batch.sent + batch.failed === 0) break;
  } while (Date.now() < deadline);
  return result;
}