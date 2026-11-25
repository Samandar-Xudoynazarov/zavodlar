// Ishga tushirish: npm run dev (kompyuterda) yoki cPanel → Setup Node.js App (serverda, "Application startup file": server.js)
import app from "./src/app.js";
import { migrate } from "./src/db.js";
import { flushTelegramNotifications } from "./src/telegram.js";
import { sendDailyDigests, tashkentHour } from "./src/digest.js";

const port = process.env.PORT || 4000;
await migrate();
app.listen(port, () => console.log(`API ishga tushdi: http://localhost:${port}/api/health`));

// Doimiy Node.js serverida yuborilmagan Telegram xabarlarini qayta urinadi.
let telegramRetryBusy = false;
setInterval(async () => {
  if (telegramRetryBusy) return;
  telegramRetryBusy = true;
  try { await flushTelegramNotifications({ limit: 10 }); }
  catch { console.error("Telegram navbati keyingi urinishni kutmoqda"); }
  finally { telegramRetryBusy = false; }
}, 30000).unref();

// Telegram ertalabki hisobot: har kuni TELEGRAM_DIGEST_HOUR (standart 8) dan keyin, Toshkent vaqti bilan.
// Har foydalanuvchiga kuniga bir marta (telegram_digests jadvali); server qayta ishga tushsa ham takrorlanmaydi.
if (process.env.TELEGRAM_DIGEST !== "0") {
  const digestHour = Math.min(23, Math.max(0, Number.parseInt(process.env.TELEGRAM_DIGEST_HOUR ?? "8", 10) || 0));
  let digestBusy = false;
  setInterval(async () => {
    if (digestBusy || tashkentHour() < digestHour) return;
    digestBusy = true;
    try { await sendDailyDigests(); }
    catch { console.error("Telegram ertalabki hisobot keyingi urinishni kutmoqda"); }
    finally { digestBusy = false; }
  }, 5 * 60 * 1000).unref();
}

// Avtomatik kunlik zaxira: AUTO_BACKUP=1 bo'lsa, har kuni AUTO_BACKUP_HOUR soatda scripts/backup.js
// alohida jarayonda ishga tushadi (shifrlangan, oxirgi BACKUP_KEEP ta nusxa saqlanadi).
if (process.env.AUTO_BACKUP === "1" && !process.env.VERCEL) {
  const { spawn } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const script = fileURLToPath(new URL("./scripts/backup.js", import.meta.url));
  const hour = Math.min(23, Math.max(0, Number.parseInt(process.env.AUTO_BACKUP_HOUR ?? "2", 10) || 0));
  let lastBackupDay = "";
  let backupBusy = false;
  const runBackup = () => {
    backupBusy = true;
    const child = spawn(process.execPath, [script], { env: process.env, stdio: "inherit" });
    child.on("exit", (code) => { backupBusy = false; if (code) console.error(`Avtomatik zaxira xato bilan tugadi (kod ${code})`); });
    child.on("error", () => { backupBusy = false; console.error("Avtomatik zaxirani ishga tushirib bo'lmadi"); });
  };
  setInterval(() => {
    const now = new Date();
    const day = now.toLocaleDateString("sv-SE"); // mahalliy sana YYYY-MM-DD
    if (backupBusy || day === lastBackupDay || now.getHours() < hour) return;
    lastBackupDay = day;
    runBackup();
  }, 10 * 60 * 1000).unref();
  console.log(`Avtomatik zaxira yoqilgan: har kuni ${hour}:00 dan keyin`);
}
