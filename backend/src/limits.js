import { q } from "./db.js";

/*
 * Kirish urinishlarini cheklash.
 *
 * Bloklash «login + IP» juftligiga qo'yiladi: begona odam boshqa joydan `admin` ga 5 marta xato parol
 * yozsa, faqat o'zi bloklanadi — zavoddagi administrator odatdagidek kiraveradi. Bundan tashqari,
 * bitta IP'dan barcha loginlarga jami urinishlar ham cheklanadi.
 */
export const USER_LIMIT = 5; // login + IP: shuncha xato urinishdan keyin
export const USER_LOCK_MIN = 10; //          shuncha daqiqaga bloklanadi
export const IP_LIMIT = 30; // bitta IP'dan jami urinishlar
export const IP_LOCK_MIN = 15;
const WINDOW_MIN = 15; // shuncha vaqt urinish bo'lmasa, hisob nolga tushadi

/**
 * Mijoz IP manzili. Proksi (Apache / cPanel) ortida ishlaganda TRUST_PROXY=1 qo'yiladi —
 * shunda X-Forwarded-For'ning oxirgi (proksi yozgan) qiymati olinadi, birinchisi emas:
 * birinchisini foydalanuvchi o'zi soxtalashtirishi mumkin.
 */
export function clientIp(req) {
  // Vercel: mijoz IP'sini Vercel o'zi x-real-ip ga yozadi (foydalanuvchi soxtalashtira olmaydi)
  if (process.env.VERCEL) {
    const ip = req.get("x-real-ip");
    if (ip) return ip;
  }
  if (process.env.TRUST_PROXY) {
    const list = String(req.get("x-forwarded-for") || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (list.length) return list[list.length - 1];
  }
  return req.socket?.remoteAddress || "?";
}

export const userKey = (username, ip) => `u:${username}|${ip}`;
export const ipKey = (ip) => `ip:${ip}`;

/**
 * Parol tekshirilishidan OLDIN urinishni atomik band qiladi. Natija: { locked: Date } yoki { count }.
 * Muddati o'tgan hisob (expires_at) nolga tushiriladi.
 */
export async function takeAttempt(key, limit, lockMin) {
  const { rows } = await q(
    `INSERT INTO login_attempts (key, count, expires_at) VALUES ($1, 1, now() + make_interval(mins => $2))
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN login_attempts.lock_until > now() THEN login_attempts.count
                    WHEN login_attempts.expires_at < now() THEN 1
                    ELSE login_attempts.count + 1 END,
       expires_at = CASE WHEN login_attempts.lock_until > now() THEN login_attempts.expires_at
                         ELSE now() + make_interval(mins => $2) END
     RETURNING count, lock_until`,
    [key, WINDOW_MIN]
  );
  const r = rows[0];
  if (r.lock_until && r.lock_until > new Date()) return { locked: r.lock_until };
  if (r.count > limit) return { locked: await lock(key, lockMin) };
  return { count: r.count };
}

export async function lock(key, lockMin) {
  const { rows } = await q(
    `UPDATE login_attempts SET lock_until = now() + make_interval(mins => $2), count = 0,
       expires_at = now() + make_interval(mins => $2) WHERE key = $1 RETURNING lock_until`,
    [key, lockMin]
  );
  return rows[0]?.lock_until || new Date(Date.now() + lockMin * 60000);
}

/** Muvaffaqiyatli kirish: login+IP hisobi o'chadi, IP hisobidan shu urinish qaytariladi */
export async function loginSucceeded(username, ip) {
  await q("DELETE FROM login_attempts WHERE key = $1", [userKey(username, ip)]);
  await q("UPDATE login_attempts SET count = count - 1 WHERE key = $1 AND count > 0", [ipKey(ip)]);
  // eskirgan yozuvlarni vaqti-vaqti bilan tozalaymiz
  if (Math.random() < 0.05) await q("DELETE FROM login_attempts WHERE expires_at < now() AND (lock_until IS NULL OR lock_until < now())");
}

/** Admin parolni tiklaganda — shu loginning barcha IP'lardagi bloklari olib tashlanadi */
export async function clearUserLocks(username) {
  await q("DELETE FROM login_attempts WHERE starts_with(key, $1)", [`u:${username}|`]);
}
