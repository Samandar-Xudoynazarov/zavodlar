// Jadvallarni yaratish / yangilash: npm run migrate  (server ham birinchi so'rovda o'zi bajaradi)
import { migrate, getPool } from "../src/db.js";

await migrate();
console.log("✓ Baza tayyor");
await getPool().end();
