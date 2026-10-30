import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';

// Integration test data lives only in a temporary schema. Telegram is always mocked.
const sourceUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!sourceUrl) throw new Error('DATABASE_URL is required for Telegram integration tests');
const schema = `telegram_test_${crypto.randomBytes(8).toString('hex')}`;
const management = new pg.Pool({ connectionString: sourceUrl });
await management.query(`CREATE SCHEMA ${schema}`);
const testUrl = new URL(sourceUrl);
testUrl.searchParams.set('options', `-c search_path=${schema},public`);
process.env.DATABASE_URL = testUrl.toString();
process.env.AUTH_SECRET = crypto.randomBytes(32).toString('hex');
process.env.TELEGRAM_BOT_TOKEN = 'test-only-token';
process.env.TELEGRAM_BOT_USERNAME = 'test_plan_bot';
process.env.TELEGRAM_WEBHOOK_SECRET = 'test_secret_1234567890123456789012';
process.env.APP_PUBLIC_URL = 'http://localhost:3002';
const nativeFetch = globalThis.fetch;
const sends = [];
let sendMode = 'ok';
let onSend = null;
globalThis.fetch = async (input, options = {}) => {
  const url = new URL(String(input));
  // Block any unintended external traffic instead of falling through to real Telegram.
  assert.equal(url.hostname, 'api.telegram.org', 'Only the fake Telegram endpoint may use the fetch stub');
  assert.ok(url.pathname.startsWith('/bottest-only-token/'));
  const method = url.pathname.split('/').at(-1);
  if (method === 'getMe') return Response.json({ ok: true, result: { username: 'test_plan_bot' } });
  assert.equal(method, 'sendMessage');
  const body = JSON.parse(options.body);
  sends.push(body);
  if (onSend) await onSend(body);
  if (sendMode === 'network') throw new Error('Sensitive URL https://api.telegram.org/bottest-only-token/sendMessage');
  if (sendMode === '429') return Response.json({ ok: false, error_code: 429, description: 'test-only-token must not leak', parameters: { retry_after: 120 } }, { status: 429 });
  if (sendMode === '403') return Response.json({ ok: false, error_code: 403, description: 'test-only-token must not leak' }, { status: 403 });
  return Response.json({ ok: true, result: { message_id: sends.length } });
};
const { q, one, getPool, migrate } = await import('../src/db.js');
const { issueToken, hashPassword } = await import('../src/auth.js');
const telegram = await import('../src/telegram.js');
const { default: app } = await import('../src/app.js');
const errors = [];
const originalConsoleError = console.error;
console.error = (...args) => errors.push(args.map(String).join(' '));
let server;
try {
  await migrate();
  const f1 = await one("INSERT INTO factories(code,name) VALUES ('test-a','Sinov zavodi A') RETURNING *");
  const f2 = await one("INSERT INTO factories(code,name) VALUES ('test-b','Sinov zavodi B') RETURNING *");
  const product = await one("INSERT INTO products(factory_id,code) VALUES ($1,'PB-01') RETURNING *", [f1.id]);
  const passwordHash = await hashPassword('Test-only123!');
  const makeUser = (username, role = 'kuzatuvchi', factory = null) => one(
    'INSERT INTO users(username,role,factory_id,password_hash) VALUES ($1,$2,$3,$4) RETURNING *',
    [username, role, factory, passwordHash],
  );
  const admin = await makeUser('telegramadmin', 'admin');
  const observer = await makeUser('telegramobserver');
  const observer2 = await makeUser('telegramobserver2');
  const scoped = await makeUser('telegramscoped', 'kuzatuvchi', f1.id);
  const outsider = await makeUser('telegramoutsider', 'kurator');
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (path, method = 'GET', body, user = observer, extraHeaders = {}) => {
    const response = await nativeFetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Factory': f1.id, ...(user ? { Authorization: `Bearer ${issueToken(user)}` } : {}), ...extraHeaders },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    assert.ok(!text.includes('test-only-token'), 'API must never reveal the bot credential');
    return { status: response.status, body: JSON.parse(text) };
  };
  let updateId = 0;
  const update = (token, chatId = 10001, overrides = {}) => ({
    update_id: ++updateId,
    message: { chat: { id: chatId, type: 'private' }, from: { id: chatId, username: 'test_human', is_bot: false }, text: `/start ${token}`, ...overrides },
  });
  const webhook = body => call('/telegram/webhook', 'POST', body, null, { 'X-Telegram-Bot-Api-Secret-Token': process.env.TELEGRAM_WEBHOOK_SECRET });
  const getLink = async (user = observer) => {
    const result = await call('/notifications/telegram/link', 'POST', {}, user);
    assert.equal(result.status, 200);
    assert.match(result.body.url, /^https:\/\/t\.me\/test_plan_bot\?start=/);
    return { ...result.body, token: new URL(result.body.url).searchParams.get('start') };
  };
  const link = async (user, chatId) => {
    const info = await getLink(user);
    assert.equal((await webhook(update(info.token, chatId))).status, 200);
    assert.equal((await one('SELECT chat_id FROM telegram_subscriptions WHERE user_id=$1', [user.id])).chatId, String(chatId));
    return info;
  };
  const emptyQueue = async () => {
    await q('DELETE FROM notifications');
    sends.length = 0;
    sendMode = 'ok';
    onSend = null;
  };
  const notice = async (user = observer, factory = f1.id) => {
    const notification = await one(
      'INSERT INTO notifications(factory_id,date,payload) VALUES ($1,$2,$3::jsonb) RETURNING *',
      [factory, '2026-10-12', JSON.stringify({ factoryName: 'Sinov zavodi A', authorName: 'Admin', action: 'created', total: 12, lines: [{ code: 'PB-01', plan: 12 }] })],
    );
    await q('INSERT INTO notification_recipients(notification_id,user_id) VALUES ($1,$2)', [notification.id, user.id]);
    return notification;
  };
  const recipient = id => one('SELECT * FROM notification_recipients WHERE notification_id=$1', [id]);

  assert.equal((await call('/telegram/webhook', 'POST', {}, null)).status, 403);
  assert.equal((await call('/telegram/webhook', 'POST', {}, null, { 'X-Telegram-Bot-Api-Secret-Token': 'incorrect_secret' })).status, 403);
  for (const user of [admin, outsider]) {
    assert.equal((await call('/notifications/telegram', 'GET', undefined, user)).status, 403);
    assert.equal((await call('/notifications/telegram/link', 'POST', {}, user)).status, 403);
    assert.equal((await call('/notifications/telegram', 'DELETE', undefined, user)).status, 403);
  }
  assert.equal((await call('/notifications/telegram', 'GET', undefined, null)).status, 401);
  console.log('PASS: public webhook secret validation, authenticated observer-only settings');

  const first = await getLink();
  const tokenRow = await one('SELECT * FROM telegram_link_tokens WHERE user_id=$1', [observer.id]);
  assert.equal(tokenRow.tokenHash, crypto.createHash('sha256').update(first.token).digest('hex'));
  assert.ok(!JSON.stringify(tokenRow).includes(first.token), 'The one-use token must be hash-only in storage');
  assert.equal((await webhook(update(first.token, 10001, { chat: { id: 10001, type: 'group' } }))).status, 200);
  assert.equal((await q('SELECT * FROM telegram_subscriptions')).rowCount, 0);
  assert.equal((await webhook(update(first.token, 10001, { from: { id: 10001, is_bot: true } }))).status, 200);
  assert.equal((await q('SELECT * FROM telegram_subscriptions')).rowCount, 0);
  assert.equal(await telegram.processTelegramUpdate(update(first.token, 10001, { forward_origin: { type: 'user' } })), false);
  assert.equal(await telegram.processTelegramUpdate(update(first.token, 10001, { from: { id: 99999, is_bot: false } })), false);
  assert.equal(await telegram.processTelegramUpdate(update(first.token, -10001)), false);
  await q("UPDATE users SET role='kurator' WHERE id=$1", [observer.id]);
  assert.equal(await telegram.processTelegramUpdate(update(first.token)), false);
  await q("UPDATE users SET role='kuzatuvchi' WHERE id=$1", [observer.id]);
  await q("UPDATE telegram_link_tokens SET expires_at=now()-interval '1 minute' WHERE user_id=$1", [observer.id]);
  assert.equal(await telegram.processTelegramUpdate(update(first.token)), false);
  const old = await getLink();
  const fresh = await getLink();
  assert.equal(await telegram.processTelegramUpdate(update(old.token)), false);
  assert.equal(await telegram.processTelegramUpdate(update(fresh.token)), true);
  assert.equal(await telegram.processTelegramUpdate(update(fresh.token)), false, 'Replay cannot relink a consumed token');
  assert.equal((await q('SELECT * FROM telegram_link_tokens WHERE user_id=$1', [observer.id])).rowCount, 0);
  assert.equal((await call('/notifications/telegram')).body.connected, true);
  assert.equal((await call('/notifications/telegram', 'GET', undefined, observer2)).body.connected, false);
  const collision = await getLink(observer2);
  assert.equal(await telegram.processTelegramUpdate(update(collision.token)), false);
  assert.equal((await one('SELECT user_id FROM telegram_subscriptions WHERE chat_id=$1', ['10001'])).userId, observer.id);
  assert.equal((await q('SELECT * FROM telegram_subscriptions WHERE user_id=$1', [observer2.id])).rowCount, 0);
  await link(observer2, 10002);
  const pendingDisconnect = await getLink(observer);
  assert.equal((await call('/notifications/telegram', 'DELETE')).status, 200);
  assert.equal((await call('/notifications/telegram')).body.connected, false);
  assert.equal((await call('/notifications/telegram', 'GET', undefined, observer2)).body.connected, true);
  assert.equal(await telegram.processTelegramUpdate(update(pendingDisconnect.token)), false);
  await link(observer, 10001);
  await link(scoped, 10003);
  console.log('PASS: private human chat, hash-only expiring one-use links, regeneration, replay, chat collision and own disconnect');

  await emptyQueue();
  const oldNotice = await notice(observer2);
  await telegram.disconnectTelegram(observer2);
  await link(observer2, 10002);
  sends.length = 0;
  assert.equal((await telegram.flushTelegramNotifications({ notificationId: oldNotice.id })).sent, 0);
  const noLinkNotice = await notice(outsider);
  await q("UPDATE users SET role='kuzatuvchi' WHERE id=$1", [outsider.id]);
  await link(outsider, 10004);
  sends.length = 0;
  assert.equal((await telegram.flushTelegramNotifications({ notificationId: noLinkNotice.id })).sent, 0);
  await q("UPDATE users SET role='kurator' WHERE id=$1", [outsider.id]);
  assert.equal(sends.length, 0);
  console.log('PASS: newly linked or relinked accounts receive no old notifications');

  await emptyQueue();
  const roleNotice = await notice(observer);
  const factoryNotice = await notice(scoped);
  await q("UPDATE users SET role='kurator' WHERE id=$1", [observer.id]);
  await q('UPDATE users SET factory_id=$2 WHERE id=$1', [scoped.id, f2.id]);
  assert.deepEqual(await telegram.flushTelegramNotifications(), { configured: true, sent: 0, failed: 0 });
  assert.equal(sends.length, 0);
  await q("UPDATE users SET role='kuzatuvchi' WHERE id=$1", [observer.id]);
  await q('UPDATE users SET factory_id=$2 WHERE id=$1', [scoped.id, f1.id]);
  await q('UPDATE users SET active=false WHERE id=$1', [observer.id]);
  await q('UPDATE factories SET archived=true WHERE id=$1', [f1.id]);
  assert.equal((await telegram.flushTelegramNotifications()).sent, 0);
  await q('UPDATE users SET active=true WHERE id=$1', [observer.id]);
  await q('UPDATE factories SET archived=false WHERE id=$1', [f1.id]);
  assert.equal((await recipient(roleNotice.id)).telegramSentAt, null);
  assert.equal((await recipient(factoryNotice.id)).telegramSentAt, null);
  console.log('PASS: delivery rechecks current active role, factory assignment and archived factory');

  await emptyQueue();
  const concurrent = await notice();
  let releaseSend;
  let enteredSend;
  const release = new Promise(resolve => { releaseSend = resolve; });
  const entered = new Promise(resolve => { enteredSend = resolve; });
  onSend = async () => { enteredSend(); await release; };
  const firstFlush = telegram.flushTelegramNotifications({ notificationId: concurrent.id });
  await entered;
  const secondFlush = await telegram.flushTelegramNotifications({ notificationId: concurrent.id });
  releaseSend();
  assert.equal((await firstFlush).sent, 1);
  assert.equal(secondFlush.sent, 0);
  assert.equal(sends.length, 1);
  assert.equal((await recipient(concurrent.id)).telegramAttempts, 1);
  console.log('PASS: concurrent workers lock deliveries and send exactly once');

  await emptyQueue();
  const retry = await notice();
  sendMode = '429';
  const retryStart = Date.now();
  assert.equal((await telegram.flushTelegramNotifications({ notificationId: retry.id })).failed, 1);
  const queued = await recipient(retry.id);
  assert.equal(queued.telegramAttempts, 1);
  assert.equal(queued.telegramSentAt, null);
  assert.ok(new Date(queued.telegramNextAttemptAt).getTime() >= retryStart + 119000);
  assert.ok(!queued.telegramError.includes('test-only-token'));
  assert.equal((await telegram.flushTelegramNotifications({ notificationId: retry.id })).failed, 0);
  assert.equal(sends.length, 1, 'Backoff survives independent flush calls');
  await q("UPDATE notification_recipients SET telegram_next_attempt_at=now()-interval '1 second' WHERE notification_id=$1", [retry.id]);
  sendMode = 'ok';
  assert.equal((await telegram.flushTelegramNotifications({ notificationId: retry.id })).sent, 1);
  assert.equal((await recipient(retry.id)).telegramAttempts, 2);
  assert.equal((await recipient(retry.id)).telegramError, null);
  console.log('PASS: Telegram 429 durable backoff and successful retry');

  await emptyQueue();
  // A single plan save must drain all immediate deliveries, including the second
  // batch; no inbox polling or another request may be needed to deliver them.
  const additionalObservers = [];
  for (let index = 0; index < 12; index++) {
    const user = await makeUser(`telegrambatch${index}`, 'kuzatuvchi', f1.id);
    await link(user, 11000 + index);
    additionalObservers.push(user);
  }
  await emptyQueue();
  const eligibleLinked = await one(`SELECT count(*)::int AS count FROM users u
    JOIN telegram_subscriptions s ON s.user_id=u.id
    WHERE u.active AND u.role='kuzatuvchi' AND (u.factory_id IS NULL OR u.factory_id=$1)`, [f1.id]);
  assert.ok(eligibleLinked.count >= 12);
  const batchSaved = await call('/days/2026-10-14', 'PUT', { production: [{ productId: product.id, plan: 30 }] }, admin);
  assert.equal(batchSaved.status, 200);
  assert.equal(sends.length, eligibleLinked.count, 'Every linked observer must receive the plan before PUT returns');
  const batchNotice = await one('SELECT * FROM notifications WHERE factory_id=$1 AND date=$2', [f1.id, '2026-10-14']);
  const batchRecipients = (await q('SELECT * FROM notification_recipients WHERE notification_id=$1', [batchNotice.id])).rows;
  assert.equal(batchRecipients.length, eligibleLinked.count);
  assert.ok(batchRecipients.every(row => row.telegram_sent_at && row.telegram_attempts === 1));
  assert.equal(new Set(sends.map(message => message.chat_id)).size, eligibleLinked.count);
  assert.equal((await telegram.flushTelegramNotifications({ notificationId: batchNotice.id })).sent, 0);
  assert.equal(sends.length, eligibleLinked.count, 'A later flush must not duplicate the first or second batch');
  for (const user of additionalObservers) await telegram.disconnectTelegram(user);
  console.log('PASS: a single daily plan save immediately delivers to 15 linked observers across multiple batches without polling or duplicates');
  await emptyQueue();
  await telegram.disconnectTelegram(observer2);
  await telegram.disconnectTelegram(scoped);
  sendMode = 'network';
  const saved = await call('/days/2026-10-13', 'PUT', { production: [{ productId: product.id, plan: 15 }] }, admin);
  assert.equal(saved.status, 200);
  assert.equal(saved.body.production[0].plan, 15);
  const committed = await one('SELECT * FROM days WHERE factory_id=$1 AND date=$2', [f1.id, '2026-10-13']);
  assert.equal(committed.production[0].plan, 15);
  const committedNotice = await one('SELECT * FROM notifications WHERE date=$1', ['2026-10-13']);
  const failed = await one('SELECT * FROM notification_recipients WHERE notification_id=$1 AND user_id=$2', [committedNotice.id, observer.id]);
  assert.equal(failed.telegramAttempts, 1);
  assert.equal(failed.telegramSentAt, null);
  assert.ok(failed.telegramNextAttemptAt);
  assert.ok(!failed.telegramError.includes('test-only-token'));
  const inbox = await call('/notifications');
  assert.equal(inbox.status, 200);
  assert.ok(inbox.body.items.some(item => item.id === committedNotice.id));
  assert.equal(sends.length, 1, 'Inbox request respects the saved retry deadline');
  assert.equal(errors.some(message => message.includes('test-only-token')), false);
  console.log('PASS: failed Telegram delivery preserves saved daily plan, in-app notification and masked retry error');

  await emptyQueue();
  const blocked = await notice();
  sendMode = '403';
  assert.equal((await telegram.flushTelegramNotifications({ notificationId: blocked.id })).failed, 1);
  assert.equal((await recipient(blocked.id)).telegramNextAttemptAt, null);
  assert.equal((await q('SELECT * FROM telegram_subscriptions WHERE user_id=$1', [observer.id])).rowCount, 0);
  assert.equal((await telegram.flushTelegramNotifications({ notificationId: blocked.id })).failed, 0);
  console.log('PASS: blocked bot stops retries and removes the stale subscription');

  const large = { factoryId: f1.id, date: '2026-10-12', payload: { factoryName: 'A'.repeat(2000), authorName: 'B'.repeat(2000), total: 500, lines: Array.from({ length: 1000 }, (_, i) => ({ code: 'Long product '.repeat(30), plan: i + 1 })) } };
  const formatted = telegram.formatTelegramNotification(large);
  assert.ok(formatted.length <= 4096);
  assert.match(formatted, /12\.10\.2026/);
  assert.ok(formatted.includes('http://localhost:3002/'));
  assert.ok(formatted.includes('day=2026-10-12'));
  assert.ok(formatted.includes(`factory=${f1.id}`));
  delete process.env.APP_PUBLIC_URL;
  assert.ok(!telegram.formatTelegramNotification(large).includes('Hisobotni ochish:'));
  delete process.env.TELEGRAM_BOT_USERNAME;
  assert.equal((await telegram.getTelegramStatus(observer)).botUsername, 'test_plan_bot');
  const absentToken = process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_BOT_TOKEN;
  assert.equal(telegram.telegramConfigured(), false);
  assert.equal(await telegram.createTelegramLink(observer), null);
  assert.equal((await telegram.flushTelegramNotifications()).configured, false);
  process.env.TELEGRAM_BOT_TOKEN = absentToken;
  console.log('PASS: 4096-character plain-text formatter, optional day/factory deep link, getMe fallback and unconfigured state');
} finally {
  globalThis.fetch = nativeFetch;
  console.error = originalConsoleError;
  if (server) await new Promise(resolve => server.close(resolve));
  await getPool().end();
  await management.query(`DROP SCHEMA ${schema} CASCADE`);
  await management.end();
}



