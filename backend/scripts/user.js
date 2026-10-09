// Foydalanuvchi yaratish yoki parolini tiklash (masalan, administrator parolini unutsa).
//
//   npm run user -- admin YangiParol123                    — "admin" parolini tiklaydi (yo'q bo'lsa, bosh administrator yaratadi)
//   npm run user -- aziz Parol123 pto zavod-1 "Aziz Karimov" — rol va zavod kodi bilan
//   Rollar: admin | rahbar | pto | usta | omborchi | kuzatuvchi | kurator. Zavod kodi "-" — bosh ofis (barcha zavodlar).
import { migrate, getPool, one, q } from "../src/db.js";
import { clearUserLocks } from "../src/limits.js";
import { ROLES, HQ_ROLES, hashPassword, passwordProblem } from "../src/auth.js";

const [username, password, role = "admin", factoryCode = "-", ...nameParts] = process.argv.slice(2);
const stop = (msg) => {
  console.log(msg);
  process.exit(1);
};
if (!username || !password) stop('Foydalanish: npm run user -- <login> <parol> [rol] [zavod-kodi | -] ["Ism Familiya"]');
if (!ROLES.includes(role)) stop(`Rol noto'g'ri: ${role}. Mumkin: ${ROLES.join(", ")}`);
const problem = passwordProblem(password);
if (problem) stop(problem);

await migrate();
const login = username.trim().toLowerCase();
let factoryId = null;
if (factoryCode !== "-") {
  const f = await one("SELECT id FROM factories WHERE code = $1", [factoryCode]);
  if (!f) stop(`Zavod topilmadi: ${factoryCode}`);
  factoryId = f.id;
} else if (!HQ_ROLES.includes(role)) stop(`«${role}» roli uchun zavod kodini kiriting`);

const passwordHash = await hashPassword(password);
const existing = await one("SELECT * FROM users WHERE username = $1", [login]);
if (existing) {
  await q("UPDATE users SET password_hash = $2, active = true, must_change_password = true, token_version = token_version + 1, updated_at = now() WHERE id = $1", [existing.id, passwordHash]);
  await clearUserLocks(login);
  console.log(`✓ ${login}: parol yangilandi (rol: ${existing.role})`);
} else {
  await q("INSERT INTO users (username, name, role, factory_id, password_hash, must_change_password) VALUES ($1, $2, $3, $4, $5, true)", [login, nameParts.join(" ") || login, role, factoryId, passwordHash]);
  console.log(`✓ ${login} yaratildi (rol: ${role}${factoryId ? `, zavod: ${factoryCode}` : ", bosh ofis"})`);
}
await getPool().end();
