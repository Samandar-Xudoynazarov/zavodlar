import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

// numeric ustunlar pg'da satr bo'lib keladi — son qilib olamiz (miqdor va narxlar uchun yetarli aniqlik)
pg.types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
pg.types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10))); // bigint (count(*))

let pool = null;
export function getPool() {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL muhit o'zgaruvchisi o'rnatilmagan");
    // Vercel'da har bir funksiya nusxasi o'z ulanishini ochadi — ulanishlar soni kichik bo'lsin
    pool = new pg.Pool({ connectionString: url, max: +process.env.DB_POOL || (process.env.VERCEL ? 3 : 10), idleTimeoutMillis: process.env.VERCEL ? 10000 : 30000 });
    pool.on("error", (err) => console.error("pg pool:", err.message));
  }
  return pool;
}

/* ---------- snake_case ↔ camelCase ---------- */
const camel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const COL_ALIAS = { grp: "group" }; // "group" SQL'da band so'z — ustun nomi grp
/** Bazadagi qatorni API obyektiga aylantiradi (factory_id ham qoladi — factoryId) */
export function toObj(row) {
  if (!row) return null;
  const o = {};
  for (const [k, v] of Object.entries(row)) o[COL_ALIAS[k] || camel(k)] = v;
  return o;
}

/** So'rov: `client` berilsa tranzaksiya ichida ishlaydi */
export async function q(sql, params = [], client = null) {
  return (client || getPool()).query(sql, params);
}
export const rows = async (sql, params, client) => (await q(sql, params, client)).rows.map(toObj);
export const one = async (sql, params, client) => toObj((await q(sql, params, client)).rows[0]);

/** Tranzaksiya: fn(client) xato bersa hammasi bekor qilinadi */
export async function tx(fn) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const r = await fn(client);
    await client.query("COMMIT");
    return r;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/* ---------- migratsiyalar: sql/NNN_*.sql fayllari tartib bilan, bir marta ---------- */
const sqlDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../sql");
let migrated = null;
export function migrate() {
  migrated ||= (async () => {
    await q("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
    const done = new Set((await q("SELECT name FROM schema_migrations")).rows.map((r) => r.name));
    const files = fs.readdirSync(sqlDir).filter((f) => /^\d+_.*\.sql$/.test(f)).sort();
    for (const f of files) {
      if (done.has(f)) continue;
      await tx(async (c) => {
        await c.query("SELECT pg_advisory_xact_lock(4242)"); // bir vaqtda ikki jarayon migratsiya qilmasin
        if ((await c.query("SELECT 1 FROM schema_migrations WHERE name=$1", [f])).rowCount) return;
        await c.query(fs.readFileSync(path.join(sqlDir, f), "utf8"));
        await c.query("INSERT INTO schema_migrations (name) VALUES ($1)", [f]);
        console.log(`migratsiya: ${f}`);
      });
    }
  })().catch((err) => {
    migrated = null;
    throw err;
  });
  return migrated;
}
