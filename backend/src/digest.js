// Telegram ertalabki hisobot (standart 08:00, Toshkent vaqti). Kuzatuvchi/kurator — barcha (yoki o'z) zavodlari,
// faqat miqdorlar, pulsiz. Zavod direktori (rahbar) — o'z zavodi, pul bilan. Har foydalanuvchiga kuniga bir marta.
import { rows, q } from "./db.js";
import { todayTashkent } from "./common.js";
import { factoryPulse } from "./pulse.js";
import { allPulse } from "./routes/pulse.js";
import { telegramApi, telegramConfigured, TELEGRAM_ROLES } from "./telegram.js";
import { noMoney } from "./no-money.js";

const n0 = (x) => Math.round(+x || 0).toLocaleString("ru-RU").replace(/ /g, " ");
const mln = (x) => `${(Math.round((+x || 0) / 1e5) / 10).toLocaleString("ru-RU")} mln`;
const dmy = (d) => String(d || "").replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$3.$2.$1");
const dm = (d) => String(d || "").replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$3.$2");
const dot = (level) => (level === "red" ? "🔴" : level === "amber" ? "🟠" : "🟢");
const pctText = (p) => (p === null || p === undefined ? "reja yo'q" : `${String(p).replace(".", ",")}%`);

function appLink() {
  try {
    if (!process.env.APP_PUBLIC_URL) return "";
    const url = new URL(process.env.APP_PUBLIC_URL);
    return ["https:", "http:"].includes(url.protocol) ? `\n\nIlovani ochish: ${url.toString().slice(0, 500)}` : "";
  } catch { return ""; }
}

/** Kuzatuvchi uchun (pulsiz) */
export function observerText(all) {
  const t = all.total;
  const out = [`☀️ Ertalabki hisobot · ${dmy(all.today)}`, `${all.factories.length} ta zavod · oylik reja ${pctText(t.planPct)}`, "", `📌 ${all.headline}`, ""];
  const signals = all.factories.flatMap((p) => p.signals.filter((s) => s.level === "red").map((s) => `${dot(s.level)} ${p.factory.name}: ${s.text}`));
  if (signals.length) out.push(...signals.slice(0, 8), "");
  const byId = new Map(all.factories.map((p) => [p.factory.id, p]));
  all.ranking.forEach((id, i) => {
    const p = byId.get(id);
    const y = p.yesterday;
    out.push(`${i + 1}. ${p.factory.name} — ${pctText(p.month.planPct)} ${dot(p.status)}`);
    out.push(`   ${dm(y.date)}: reja ${n0(y.plan)}, fakt ${n0(y.fact)}${y.brakPct !== null ? `, brak ${String(y.brakPct).replace(".", ",")}%` : ""}${y.reported ? "" : " · hisobot yo'q"}`);
    const extra = [];
    if (p.orders.late.length) extra.push(`${p.orders.late.length} ta buyurtma kechikadi`);
    const low = p.stock.filter((m) => m.level === "red")[0];
    if (low) extra.push(`${low.name} ${low.daysLeft ?? 0} kunga`);
    if (extra.length) out.push(`   ${extra.join(" · ")}`);
  });
  return out.join("\n");
}

/** Zavod direktori uchun (pul bilan) */
export function directorText(p) {
  const y = p.yesterday, m = p.month;
  const out = [`☀️ ${p.factory.name} · ${dmy(p.today)}`, "", `Kecha (${dm(y.date)}): reja ${n0(y.plan)}, fakt ${n0(y.fact)} (${pctText(y.planPct)})${y.brakPct !== null ? `, brak ${String(y.brakPct).replace(".", ",")}%` : ""}`, `Oy: reja ${pctText(m.planPct)} · ishlab chiqarildi ${n0(m.fact)}`];
  if (p.money) {
    const mo = p.money;
    out.push("", `💰 Oy tushumi: ${mln(mo.month.revenue)} · foyda: ${mln(mo.month.profit)}${mo.month.complete ? "" : " (oylik hali kiritilmagan)"}`, `Mijozlar qarzi: ${mln(mo.receivable)} · kassa va bank: ${mln(mo.cash.total)}`);
  }
  if (p.signals.length) out.push("", "Diqqat:", ...p.signals.slice(0, 6).map((s) => `${dot(s.level)} ${s.text}`));
  if (p.approvals.total) out.push("", `✍️ Tasdiq kutmoqda: ${p.approvals.total} ta`);
  if (p.orders.late.length) out.push("", "Kechikadigan buyurtmalar:", ...p.orders.late.slice(0, 4).map((o) => `• №${o.no ?? "—"} ${o.customer} · ${o.product}: qoldi ${n0(o.remaining)}, muddat ${dm(o.deadline)}`));
  return out.join("\n");
}

/** Foydalanuvchi uchun hisobot matni (null — roli to'g'ri kelmasa) */
export async function digestFor(user, factories, today = todayTashkent()) {
  if (!user?.active || !TELEGRAM_ROLES.includes(user.role)) return null;
  const active = factories.filter((f) => !f.archived);
  let text;
  if (noMoney(user)) {
    const list = user.factoryId ? active.filter((f) => f.id === user.factoryId) : active;
    if (!list.length) return null;
    text = observerText(await allPulse(list, today));
  } else {
    const f = active.find((x) => x.id === user.factoryId);
    if (!f) return null;
    text = directorText(await factoryPulse(f, { today, money: true }));
  }
  const link = appLink();
  return text.slice(0, 4096 - link.length) + link;
}

/** Bugun hali hisobot olmaganlarga yuboradi. Qayta chaqirish xavfsiz. */
export async function sendDailyDigests({ today = todayTashkent() } = {}) {
  if (!telegramConfigured()) return { configured: false, sent: 0, failed: 0 };
  const [users, factories] = await Promise.all([
    rows(`SELECT u.*, s.chat_id FROM users u JOIN telegram_subscriptions s ON s.user_id=u.id
      WHERE u.active AND u.role = ANY($1) AND s.chat_id ~ '^[1-9][0-9]*$'
        AND NOT EXISTS (SELECT 1 FROM telegram_digests d WHERE d.user_id=u.id AND d.date=$2)`, [TELEGRAM_ROLES, today]),
    rows("SELECT * FROM factories ORDER BY sort, name"),
  ]);
  let sent = 0, failed = 0;
  for (const u of users) {
    const claimed = await q("INSERT INTO telegram_digests(user_id,date) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING user_id", [u.id, today]);
    if (!claimed.rowCount) continue;
    try {
      const text = await digestFor(u, factories, today);
      if (text) { await telegramApi("sendMessage", { chat_id: u.chatId, text, link_preview_options: { is_disabled: true } }); sent++; }
    } catch (error) {
      failed++;
      if (error?.code === 403) await q("DELETE FROM telegram_subscriptions WHERE user_id=$1", [u.id]);
      else await q("DELETE FROM telegram_digests WHERE user_id=$1 AND date=$2", [u.id, today]); // keyingi urinishda qayta
    }
  }
  return { configured: true, sent, failed };
}

/** Toshkent vaqti bo'yicha soat (0-23) */
export const tashkentHour = () => new Date(Date.now() + 5 * 36e5).getUTCHours();

/** Bot buyrug'i: /hisobot (yoki «hisobot») — ulangan foydalanuvchiga hozirgi hisobotni qaytaradi */
export async function telegramCommandReply(update) {
  const m = update?.message;
  if (!m || m.chat?.type !== "private" || m.from?.is_bot || !Number.isSafeInteger(m.chat?.id) || m.from?.id !== m.chat.id) return null;
  const text = typeof m.text === "string" ? m.text.trim().toLowerCase() : "";
  if (!/^\/?(hisobot|report|отчет|отчёт|ҳисобот)(@[a-z0-9_]+)?$/.test(text) && !/^\/start$/.test(text)) return null;
  const [user] = await rows("SELECT u.* FROM telegram_subscriptions s JOIN users u ON u.id=s.user_id WHERE s.chat_id=$1", [String(m.chat.id)]);
  if (!user) return "Avval ilovada «Telegramga ulash» tugmasini bosing — u sizga maxsus havola beradi.";
  if (/^\/start$/.test(text)) return "Siz ulangansiz. Har kuni ertalab hisobot keladi. Hozirgi holatni ko'rish uchun /hisobot yozing.";
  const factories = await rows("SELECT * FROM factories ORDER BY sort, name");
  return (await digestFor(user, factories)) || "Sizning rolingiz uchun hisobot yo'q.";
}
