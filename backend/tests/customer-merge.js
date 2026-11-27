// Mijoz nomlari: ortiqcha tirnoqlarni tozalash, bitta mijozning turli yozilishi, eski yozuvlarni tozalash (038) va qo'lda birlashtirish
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import pg from 'pg';
const source = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!source) throw new Error('DATABASE_URL is required');
const schema = 'customer_test_' + crypto.randomBytes(8).toString('hex');
const management = new pg.Pool({ connectionString: source, connectionTimeoutMillis: 10000 });
await management.query('CREATE SCHEMA ' + schema);
const url = new URL(source); url.searchParams.set('options', '-c search_path=' + schema + ',public'); process.env.DATABASE_URL = url.toString(); process.env.AUTH_SECRET = crypto.randomBytes(32).toString('hex');
const { one, rows, q, getPool, migrate } = await import('../src/db.js');
const { issueToken, hashPassword } = await import('../src/auth.js');
const { default: app } = await import('../src/app.js');
const { cleanCustomerName, customerKey } = await import('../src/customer-name.js');
let server;
try {
  // 1) Sof funksiyalar
  const Q = 'O`ZQISHLOQELEKTRQURILISH';
  assert.equal(cleanCustomerName(`""${Q}" AJ"`), `"${Q}" AJ`);
  assert.equal(cleanCustomerName(`"""${Q}"" AJ"`), `"${Q}" AJ`);
  assert.equal(cleanCustomerName(`  «${Q}»   AJ `), `"${Q}" AJ`);
  assert.equal(cleanCustomerName('""AZALIS" MCHJ"'), '"AZALIS" MCHJ');
  assert.equal(cleanCustomerName('""NUR ELEKTRO TA`MINOT TA`MIR" MCHJ"'), '"NUR ELEKTRO TA`MINOT TA`MIR" MCHJ');
  assert.equal(cleanCustomerName('Узбек'), 'Узбек');
  assert.equal(cleanCustomerName('"AZALIS MCHJ'), 'AZALIS MCHJ');
  assert.equal(customerKey(`""${Q}" AJ"`), customerKey(`"${Q}" AJ`));
  assert.equal(customerKey('"O‘ZQISHLOQ" aj'), customerKey('"O`ZQISHLOQ"   AJ'));
  assert.equal(customerKey('O`ZQISHLOQ AJ'), customerKey('"O`ZQISHLOQ" AJ'));
  assert.notEqual(customerKey('AZALIS'), customerKey('AZALIS PLUS'));

  await migrate();
  const f = await one("INSERT INTO factories(code,name) VALUES('cust-a','Cust A') RETURNING *");
  const p1 = await one("INSERT INTO products(factory_id,code) VALUES($1,'C1') RETURNING *", [f.id]);
  const hash = await hashPassword('CustTest123!');
  const admin = await one("INSERT INTO users(username,role,factory_id,password_hash) VALUES('admin','admin',$1,$2) RETURNING *", [f.id, hash]);
  const items = JSON.stringify([{ productId: p1.id, qty: 10, price: 1000 }]);

  // 2) 038 migratsiyasi eski yozuvlarni tozalaydi (bazaga to'g'ridan-to'g'ri yozilgan «iflos» nomlar)
  const dirty = await one("INSERT INTO orders(factory_id,no,customer,date,status,items) VALUES($1,1,$2,'2026-09-01','jarayonda',$3) RETURNING *", [f.id, `""${Q}" AJ"`, items]);
  await q("INSERT INTO orders(factory_id,no,customer,date,status,items) VALUES($1,2,$2,'2026-09-02','jarayonda',$3)", [f.id, `""${Q}" AJ"`, items]);
  await q("INSERT INTO orders(factory_id,no,customer,date,status,items) VALUES($1,3,$2,'2026-09-03','jarayonda',$3)", [f.id, `"${Q}" AJ`, items]);
  await q("INSERT INTO orders(factory_id,no,customer,date,status,items) VALUES($1,4,'Узбек','2026-09-04','jarayonda',$2)", [f.id, items]);
  await q("INSERT INTO finance_customer_openings(factory_id,request_id,customer,date,kind,amount,created_by) VALUES($1,$2,$3,'2026-01-01','debt',500,'{}')", [f.id, crypto.randomUUID(), '""AZALIS" MCHJ"']);
  const sql = fs.readFileSync(new URL('../sql/038_customer_names.sql', import.meta.url), 'utf8');
  const client = await getPool().connect();
  try { await client.query(sql); } finally { client.release(); }
  assert.equal((await one('SELECT customer FROM orders WHERE id=$1', [dirty.id])).customer, `"${Q}" AJ`);
  assert.deepEqual((await rows('SELECT DISTINCT customer FROM orders WHERE factory_id=$1 ORDER BY 1', [f.id])).map((x) => x.customer).sort(), [`"${Q}" AJ`, 'Узбек'].sort());
  assert.equal((await one('SELECT customer FROM finance_customer_openings WHERE factory_id=$1', [f.id])).customer, '"AZALIS" MCHJ');
  // SQL va JS tozalash bir xil natija beradi
  for (const s of [`""${Q}" AJ"`, '"""AZALIS"" MCHJ"', ' «A»  B ', '"AZALIS MCHJ', 'MCHJ "AZALIS"', '"A" "B" C"']) {
    const c2 = await getPool().connect();
    try {
      await c2.query(sql.split('UPDATE orders')[0]);
      assert.equal((await c2.query('SELECT pg_temp.clean_customer($1) AS v', [s])).rows[0].v, cleanCustomerName(s), s);
    } finally { c2.release(true); }
  }

  server = app.listen(0, '127.0.0.1'); await new Promise((r) => server.once('listening', r)); const base = 'http://127.0.0.1:' + server.address().port + '/api';
  const call = async (path, method = 'GET', body) => { const r = await fetch(base + path, { method, headers: { Authorization: 'Bearer ' + issueToken(admin), 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
  const ledger = async () => (await call('/finance/customers')).body.customers;

  // 3) Ro'yxatda bitta mijoz — 3 buyurtma
  let list = await ledger();
  const oz = list.filter((c) => c.key === customerKey(`"${Q}" AJ`));
  assert.equal(oz.length, 1); assert.equal(oz[0].orders.length, 3); assert.equal(oz[0].name, `"${Q}" AJ`);

  // 4) Yangi buyurtma boshqacha yozilsa ham (ortiqcha tirnoq, «», boshqa apostrof) — eski mijozga qo'shiladi
  for (const [i, name] of [`""${Q}" AJ"`, `«O‘ZQISHLOQELEKTRQURILISH»  aj`].entries()) {
    const res = await call('/orders', 'POST', { customer: name, date: '2026-10-0' + (i + 1), items: [{ productId: p1.id, qty: 1, price: 100 }] });
    assert.equal(res.status, 201, JSON.stringify(res.body)); assert.equal(res.body.customer, `"${Q}" AJ`);
  }
  // Yangi mijoz — tozalangan holda saqlanadi
  const fresh = await call('/orders', 'POST', { customer: '""CHAQMOQ-QURUVCHI" XK"', items: [{ productId: p1.id, qty: 1, price: 100 }] });
  assert.equal(fresh.body.customer, '"CHAQMOQ-QURUVCHI" XK');
  // Tahrirda faqat yozilishi tuzatilsa — yozilgani qoladi
  const ed = await call('/orders/' + fresh.body.id, 'PUT', { customer: '"Chaqmoq-Quruvchi" XK' });
  assert.equal(ed.status, 200, JSON.stringify(ed.body)); assert.equal(ed.body.customer, '"Chaqmoq-Quruvchi" XK');

  // 5) Boshlang'ich qoldiq: boshqacha yozilgan nom bilan ikkinchisi kiritilmaydi
  assert.equal((await call('/finance/customers/openings', 'POST', { requestId: crypto.randomUUID(), customer: '«AZALIS» MCHJ', date: '2026-01-01', kind: 'debt', amount: 10 })).status, 409);

  // 6) Qo'lda birlashtirish: «Узбек» → «"O`Z..." AJ»
  await call('/finance/customers/openings', 'POST', { requestId: crypto.randomUUID(), customer: 'Узбек', inn: '200714671', date: '2026-01-01', kind: 'debt', amount: 1000 });
  assert.equal((await call('/finance/customers/merge', 'POST', { from: 'Узбек', to: 'Узбек' })).status, 400);
  assert.equal((await call('/finance/customers/merge', 'POST', { from: 'Yo‘q mijoz', to: `"${Q}" AJ` })).status, 400);
  const m = await call('/finance/customers/merge', 'POST', { from: 'Узбек', to: `""${Q}" AJ"` });
  assert.equal(m.status, 200, JSON.stringify(m.body));
  assert.equal(m.body.to, `"${Q}" AJ`); assert.equal(m.body.moved.orders, 1); assert.equal(m.body.moved.openings, 1);
  list = await ledger();
  assert.ok(!list.some((c) => c.name === 'Узбек'));
  const merged = list.find((c) => c.key === customerKey(`"${Q}" AJ`));
  assert.equal(merged.orders.length, 6); assert.equal(merged.opening, 1000); assert.equal(merged.inn, '200714671');
  // Ikkalasida boshlang'ich qoldiq bo'lsa — rad etiladi
  const r2 = await call('/finance/customers/merge', 'POST', { from: '"AZALIS" MCHJ', to: `"${Q}" AJ` });
  assert.equal(r2.status, 409, JSON.stringify(r2.body));
  // Audit yozildi
  assert.ok(await one("SELECT 1 AS x FROM audit_log WHERE factory_id=$1 AND label LIKE 'Mijozlar birlashtirildi%'", [f.id]));
  console.log('PASS: mijoz nomini tozalash, bitta mijozning turli yozilishi, 038 migratsiyasi, boshlang‘ich qoldiq takrori, qo‘lda birlashtirish');
} finally {
  if (server) await new Promise((r) => server.close(r));
  await getPool().end().catch(() => {});
  await management.query('DROP SCHEMA ' + schema + ' CASCADE').catch(() => {});
  await management.end();
}
