// Ishga tushirish: npm run dev (kompyuterda) yoki cPanel → Setup Node.js App (serverda, "Application startup file": server.js)
import app from "./src/app.js";
import { migrate } from "./src/db.js";
import { flushTelegramNotifications } from "./src/telegram.js";

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
