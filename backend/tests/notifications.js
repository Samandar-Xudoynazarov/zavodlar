import assert from "node:assert/strict";
import crypto from "node:crypto";
import pg from "pg";

// Temporary schema: existing application tables are never changed; no Telegram is sent.
delete process.env.TELEGRAM_BOT_TOKEN;
const nativeFetch = globalThis.fetch.bind(globalThis);
const sourceUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!sourceUrl) throw new Error("DATABASE_URL is required for notification integration tests");
const schema = `notifications_test_${crypto.randomBytes(8).toString("hex")}`;
const management = new pg.Pool({ connectionString: sourceUrl });
let server, getPool, schemaCreated = false;
try {
  await management.query(`CREATE SCHEMA ${schema}`);
  schemaCreated = true;
  const testUrl = new URL(sourceUrl);
  testUrl.searchParams.set("options", `-c search_path=${schema},public`);
  process.env.DATABASE_URL = testUrl.toString();
  process.env.AUTH_SECRET = crypto.randomBytes(32).toString("hex");
  const db = await import("../src/db.js");
  const { q, one, rows, migrate } = db;
  getPool = db.getPool;
  const { issueToken, hashPassword } = await import("../src/auth.js");
  const { ValidationError } = await import("../src/valid.js");
  const { default: app } = await import("../src/app.js");
  await migrate();
  const factoryA = await one("INSERT INTO factories(code,name) VALUES ('notify-a','Sinov zavodi A') RETURNING *");
  const factoryB = await one("INSERT INTO factories(code,name) VALUES ('notify-b','Sinov zavodi B') RETURNING *");
  const productA = await one("INSERT INTO products(factory_id,code,name) VALUES ($1,'PB-01','Plita') RETURNING *", [factoryA.id]);
  const productA2 = await one("INSERT INTO products(factory_id,code,name) VALUES ($1,'PB-02','Rigel') RETURNING *", [factoryA.id]);
  const productB = await one("INSERT INTO products(factory_id,code,name) VALUES ($1,'PB-03','Boshqa plita') RETURNING *", [factoryB.id]);
  const hash = await hashPassword("TestOnly123!");
  const addUser = (username, role, factoryId = null, active = true) => one(
    "INSERT INTO users(username,name,role,factory_id,active,password_hash) VALUES ($1,$1,$2,$3,$4,$5) RETURNING *", [username, role, factoryId, active, hash]
  );
  const writer = await addUser("notify-writer", "pto", factoryA.id);
  const hq = await addUser("notify-hq", "kuzatuvchi");
  const sameFactory = await addUser("notify-same", "kuzatuvchi", factoryA.id);
  const otherFactory = await addUser("notify-other", "kuzatuvchi", factoryB.id);
  const inactive = await addUser("notify-inactive", "kuzatuvchi", null, false);
  const curator = await addUser("notify-curator", "kurator");
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (path, { method = "GET", body, user = writer, factory = factoryA.id } = {}) => {
    const response = await nativeFetch(base + path, {
      method, headers: { Authorization: `Bearer ${issueToken(user)}`, "Content-Type": "application/json", "X-Factory": factory },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  const save = (date, body) => call(`/days/${date}`, { method: "PUT", body });
  const eventCount = async () => (await one("SELECT count(*) AS n FROM notifications")).n;
  const recipientCount = async () => (await one("SELECT count(*) AS n FROM notification_recipients")).n;
  const inbox = (user, factory) => call("/notifications", { user, factory });
  const date = "2026-10-12";
  const initialPlan = [{ productId: productA.id.toUpperCase(), plan: 10, fact: 0 }, { productId: productA2.id, plan: 5, fact: 0 }];
  assert.equal((await save(date, { production: initialPlan })).status, 200);
  assert.equal(await eventCount(), 1);
  const first = await one("SELECT * FROM notifications");
  assert.equal(first.factoryId, factoryA.id);
  assert.equal(first.date, date);
  assert.equal(first.kind, "daily_plan");
  assert.equal(first.payload.factoryName, factoryA.name);
  assert.equal(first.payload.authorName, writer.name);
  assert.equal(first.payload.action, "created");
  assert.equal(first.payload.total, 15);
  assert.deepEqual(first.payload.lines.map((line) => line.productId).sort(), [productA.id, productA2.id].sort());
  assert.equal(first.payload.lines.find((line) => line.productId === productA.id).code, "PB-01");
  assert.equal(first.payload.lines.find((line) => line.productId === productA.id).name, "Plita");
  assert.deepEqual((await rows("SELECT user_id FROM notification_recipients WHERE notification_id=$1", [first.id])).map((item) => item.userId).sort(), [hq.id, sameFactory.id].sort());
  assert.equal(await recipientCount(), 2);
  assert.equal((await inbox(hq, factoryB.id)).body.unreadCount, 1);
  assert.equal((await inbox(sameFactory)).body.items[0].id, first.id);
  assert.equal((await inbox(otherFactory)).body.unreadCount, 0);
  assert.equal((await inbox(inactive)).status, 401);
  assert.equal((await inbox(curator)).status, 403);
  assert.equal((await inbox(writer)).status, 403);
  console.log("PASS: plan creation, payload, active observer recipients and factory/HQ inbox scope");

  for (const body of [
    { production: initialPlan }, { production: [...initialPlan].reverse() },
    { production: initialPlan.map((line) => ({ ...line, fact: 3, brak: 1, brakReason: "boshqa", note: "Fakt izohi" })) },
    { note: "Kunlik izoh" },
    { production: [{ productId: productA.id, plan: 4 }, { productId: productA.id, plan: 6 }, { productId: productA2.id, plan: 5 }] },
  ]) {
    assert.equal((await save(date, body)).status, 200);
    assert.equal(await eventCount(), 1);
  }
  assert.equal((await save("2026-10-11", { production: [{ productId: productA.id, fact: 2 }], note: "Rejasiz fakt" })).status, 200);
  assert.equal(await eventCount(), 1);
  console.log("PASS: identical/reordered/aggregated plan, fact/brak/note-only and plan-free saves create no duplicate alerts");
  assert.equal((await save(date, { production: [{ productId: productA.id, plan: 12 }] })).status, 200);
  assert.equal(await eventCount(), 2);
  const updated = await one("SELECT * FROM notifications ORDER BY created_at DESC,id DESC LIMIT 1");
  assert.equal(updated.payload.action, "updated");
  assert.equal(updated.payload.total, 12);
  assert.equal((await save(date, { production: [] })).status, 200);
  assert.equal(await eventCount(), 3);
  const clearEvent = await one("SELECT * FROM notifications ORDER BY created_at DESC,id DESC LIMIT 1");
  assert.equal(clearEvent.payload.action, "cleared");
  assert.equal(clearEvent.payload.total, 0);
  assert.deepEqual(clearEvent.payload.lines, []);
  assert.equal((await save(date, { production: [], note: "Qayta bo'sh" })).status, 200);
  assert.equal(await eventCount(), 3);
  console.log("PASS: plan changes and clear produce distinct alerts; repeated clear is silent");

  const baseline = await one("SELECT * FROM days WHERE factory_id=$1 AND date=$2", [factoryA.id, date]);
  for (const productId of [productB.id, crypto.randomUUID()]) {
    assert.equal((await save(date, { production: [{ productId, plan: 99 }] })).status, 400);
    assert.deepEqual(await one("SELECT * FROM days WHERE factory_id=$1 AND date=$2", [factoryA.id, date]), baseline);
    assert.equal(await eventCount(), 3);
    assert.equal(await recipientCount(), 6);
  }
  assert.equal((await save(date, { production: [{ productId: productA.id, plan: 99 }], baseUpdatedAt: "2000-01-01T00:00:00.000Z" })).status, 409);
  assert.deepEqual(await one("SELECT * FROM days WHERE factory_id=$1 AND date=$2", [factoryA.id, date]), baseline);
  assert.equal(await eventCount(), 3);
  assert.equal(await recipientCount(), 6);
  console.log("PASS: missing/wrong-factory product rejection and stale-save 409 leave day and notifications unchanged");

  // Fail after actual recipient insertion: proves all three staged writes roll back together.
  const pool = getPool();
  const originalConnect = pool.connect.bind(pool);
  let failureInjected = false;
  pool.connect = async function (...args) {
    if (args.length) return originalConnect(...args);
    const client = await originalConnect();
    const originalQuery = client.query.bind(client);
    client.query = async function (sql, ...params) {
      const result = await originalQuery(sql, ...params);
      if (!failureInjected && typeof sql === "string" && /^\s*INSERT INTO notification_recipients\b/.test(sql)) {
        failureInjected = true;
        assert.equal(result.rowCount, 2);
        throw new ValidationError("Sinov: xabar qabul qiluvchilari yozilgandan keyin rollback");
      }
      return result;
    };
    const originalRelease = client.release.bind(client);
    client.release = (...releaseArgs) => { client.query = originalQuery; client.release = originalRelease; return originalRelease(...releaseArgs); };
    return client;
  };
  try { assert.equal((await save("2026-10-14", { production: [{ productId: productA.id, plan: 7 }] })).status, 400); }
  finally { pool.connect = originalConnect; }
  assert.equal(failureInjected, true);
  assert.equal(await one("SELECT * FROM days WHERE factory_id=$1 AND date='2026-10-14'", [factoryA.id]), null);
  assert.equal(await eventCount(), 3);
  assert.equal(await recipientCount(), 6);
  console.log("PASS: post-recipient failure rolls back daily save, event and recipient rows atomically");
  const parallel = await Promise.all([
    save("2026-10-13", { production: [{ productId: productA.id, plan: 8 }] }),
    save("2026-10-13", { production: [{ productId: productA.id, plan: 8 }] }),
  ]);
  assert.deepEqual(parallel.map((item) => item.status), [200, 200]);
  assert.equal(await eventCount(), 4);
  assert.equal(await recipientCount(), 8);
  console.log("PASS: simultaneous identical daily saves produce one notification under the day lock");

  assert.equal((await call(`/notifications/${first.id}/read`, { method: "PUT", user: otherFactory })).status, 404);
  assert.equal((await call(`/notifications/${crypto.randomUUID()}/read`, { method: "PUT", user: hq })).status, 404);
  assert.equal((await call("/notifications/not-a-uuid/read", { method: "PUT", user: hq })).status, 404);
  const readOnce = await call(`/notifications/${first.id}/read`, { method: "PUT", user: hq });
  const readTwice = await call(`/notifications/${first.id}/read`, { method: "PUT", user: hq });
  assert.equal(readOnce.status, 200);
  assert.equal(readTwice.status, 200);
  assert.ok(readOnce.body.readAt);
  assert.equal(readTwice.body.readAt, readOnce.body.readAt);
  assert.equal((await inbox(hq)).body.unreadCount, 3);
  assert.equal((await inbox(sameFactory)).body.unreadCount, 4);
  assert.equal((await call("/notifications/read-all", { method: "PUT", user: hq })).status, 200);
  assert.equal((await call("/notifications/read-all", { method: "PUT", user: hq })).status, 200);
  assert.equal((await inbox(hq)).body.unreadCount, 0);
  assert.equal((await inbox(sameFactory)).body.unreadCount, 4);
  console.log("PASS: own read/read-all are idempotent and never change another recipient's unread state");
  await q("UPDATE users SET role='kurator' WHERE id=$1", [sameFactory.id]);
  assert.equal((await inbox(sameFactory)).status, 403);
  assert.equal((await call(`/notifications/${first.id}/read`, { method: "PUT", user: sameFactory })).status, 403);
  await q("UPDATE users SET role='kuzatuvchi',factory_id=$2 WHERE id=$1", [sameFactory.id, factoryB.id]);
  const reassignedInbox = await inbox(sameFactory);
  assert.equal(reassignedInbox.status, 200);
  assert.deepEqual(reassignedInbox.body.items, []);
  assert.equal(reassignedInbox.body.unreadCount, 0);
  assert.equal((await call(`/notifications/${first.id}/read`, { method: "PUT", user: sameFactory })).status, 404);
  assert.equal((await call("/notifications/read-all", { method: "PUT", user: sameFactory })).status, 200);
  assert.equal((await one("SELECT count(*) AS n FROM notification_recipients WHERE user_id=$1 AND read_at IS NULL", [sameFactory.id])).n, 4);
  await q("UPDATE users SET active=false WHERE id=$1", [hq.id]);
  assert.equal((await inbox(hq)).status, 401);
  console.log("PASS: current role, active state and reassigned factory prevent access to stale notifications");
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (getPool) await getPool().end();
  if (schemaCreated) await management.query(`DROP SCHEMA ${schema} CASCADE`);
  await management.end();
}
