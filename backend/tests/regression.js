import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';

// Uses an isolated temporary schema; never changes existing application tables.
const sourceUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!sourceUrl) throw new Error('DATABASE_URL is required for integration tests');
const schema = `regression_${crypto.randomBytes(8).toString('hex')}`;
const management = new pg.Pool({ connectionString: sourceUrl });
await management.query(`CREATE SCHEMA ${schema}`);
const testUrl = new URL(sourceUrl);
testUrl.searchParams.set('options', `-c search_path=${schema},public`);
process.env.DATABASE_URL = testUrl.toString();
process.env.AUTH_SECRET = crypto.randomBytes(32).toString('hex');
const { q, one, getPool, migrate } = await import('../src/db.js');
const { issueToken, hashPassword } = await import('../src/auth.js');
const { default: app } = await import('../src/app.js');
let server;
async function cleanup() {
  if (server) await new Promise((resolve) => server.close(resolve));
  await getPool().end();
  await management.query(`DROP SCHEMA ${schema} CASCADE`);
  await management.end();
}
try {
  await migrate();
  const f1 = await one("INSERT INTO factories(code,name) VALUES ('test-a','Sinov zavodi A') RETURNING *");
  const f2 = await one("INSERT INTO factories(code,name) VALUES ('test-b','Sinov zavodi B') RETURNING *");
  const material = await one("INSERT INTO materials(factory_id,name) VALUES ($1,'Sement') RETURNING *", [f1.id]);
  const otherMaterial = await one("INSERT INTO materials(factory_id,name) VALUES ($1,'Boshqa material') RETURNING *", [f2.id]);
  const product = await one("INSERT INTO products(factory_id,code) VALUES ($1,'PB-01') RETURNING *", [f1.id]);
  const otherProduct = await one("INSERT INTO products(factory_id,code) VALUES ($1,'PB-02') RETURNING *", [f2.id]);
  const password = 'Preview123!';
  const hash = await hashPassword(password);
  const admin1 = await one("INSERT INTO users(username,role,password_hash) VALUES ('testadmin','admin',$1) RETURNING *", [hash]);
  const admin2 = await one("INSERT INTO users(username,role,password_hash) VALUES ('testadmin2','admin',$1) RETURNING *", [hash]);
  const factoryAdmin = await one("INSERT INTO users(username,role,factory_id,password_hash) VALUES ('factoryadmin','admin',$1,$2) RETURNING *", [f1.id,hash]);
  const usta = await one("INSERT INTO users(username,role,factory_id,password_hash) VALUES ('testusta','usta',$1,$2) RETURNING *", [f1.id,hash]);
  server = app.listen(process.argv.includes('--preview') ? 4000 : 0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening',resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (path, method='GET', body, user=admin1) => {
    const response = await fetch(base+path,{method,headers:{Authorization:`Bearer ${issueToken(user)}`,'Content-Type':'application/json','X-Factory':f1.id},body:body === undefined ? undefined : JSON.stringify(body)});
    return {status:response.status,body:await response.json()};
  };
  const date = '2026-10-12';
  assert.equal((await call(`/days/${date}`,'PUT',{production:[{productId:product.id.toUpperCase(),fact:10}],materials:[{materialId:material.id,kirim:100}],shipments:[{productId:product.id,qty:1}]})).status,200);
  const saved = (await q('SELECT * FROM days WHERE factory_id=$1',[f1.id])).rows[0];
  assert.equal(saved.production[0].productId,product.id);
  for (const body of [
    {production:[{productId:otherProduct.id,fact:1}]},
    {materials:[{materialId:otherMaterial.id,sarf:1}]},
    {shipments:[{productId:otherProduct.id,qty:1}]},
    {production:[{productId:crypto.randomUUID(),fact:1}]},
    {materials:[{materialId:crypto.randomUUID(),sarf:1}]},
  ]) {
    assert.equal((await call(`/days/${date}`,'PUT',body)).status,400);
    assert.deepEqual((await q('SELECT * FROM days WHERE factory_id=$1',[f1.id])).rows[0],saved);
  }
  assert.equal((await call(`/days/${date}`,'PUT',{materials:[{materialId:material.id,sarf:5,kirim:999}],shipments:[{productId:otherProduct.id,qty:999}]},usta)).status,200);
  const ustaDay = (await call(`/days/${date}`)).body;
  assert.equal(ustaDay.materials[0].kirim,100);
  assert.equal(ustaDay.shipments[0].qty,1);
  console.log('PASS: factory-scoped day IDs, rollback, uppercase UUID and usta permissions');

  // Commit a concurrent cross-table change after products have been read.
  const pool = getPool();
  const originalConnect = pool.connect.bind(pool);
  let injected = false;
  pool.connect = async function (...args) {
    // pg also uses callback-style connect internally for pool.query.
    if (args.length) return originalConnect(...args);
    const client = await originalConnect();
    const originalQuery = client.query.bind(client);
    client.query = async function (sql,...params) {
      const result = await originalQuery(sql,...params);
      if (!injected && typeof sql === 'string' && /^SELECT \* FROM products\b/.test(sql)) {
        injected = true;
        const writer = await management.connect();
        try {
          await writer.query('BEGIN');
          await writer.query(`UPDATE ${schema}.products SET name='after' WHERE id=$1`,[product.id]);
          await writer.query(`UPDATE ${schema}.days SET note='after' WHERE factory_id=$1`,[f1.id]);
          await writer.query('COMMIT');
        } finally { writer.release(); }
      }
      return result;
    };
    const originalRelease = client.release.bind(client);
    client.release = (...releaseArgs) => { client.query = originalQuery; client.release = originalRelease; return originalRelease(...releaseArgs); };
    return client;
  };
  try {
    const backup = await call('/backup');
    assert.equal(backup.status,200);
    assert.equal(injected,true);
    assert.equal(backup.body.data.products.find(p=>p.id===product.id).name,'');
    assert.equal(backup.body.data.days[0].note,'');
    assert.equal((await one('SELECT note FROM days WHERE factory_id=$1',[f1.id])).note,'after');
    assert.ok(backup.body.data.users.every(u=>!('password_hash' in u)));
  } finally { pool.connect = originalConnect; }
  const scoped = await call('/backup','GET',undefined,factoryAdmin);
  assert.equal(scoped.status,200);
  assert.equal(scoped.body.data.factories.length,1);
  assert.equal(scoped.body.data.factories[0].id,f1.id);
  console.log('PASS: backup consistent snapshot during concurrent writes and factory scope');

  for (const change of [{active:false},{role:'kuzatuvchi'},{factoryId:f1.id}]) {
    await q("UPDATE users SET role='admin',active=true,factory_id=NULL,token_version=0 WHERE id=ANY($1::uuid[])",[[admin1.id,admin2.id]]);
    const results = await Promise.all([call(`/users/${admin1.id}`,'PUT',change,admin1),call(`/users/${admin2.id}`,'PUT',change,admin2)]);
    assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);
    assert.equal((await q("SELECT count(*)::int AS n FROM users WHERE role='admin' AND active AND factory_id IS NULL")).rows[0].n,1);
  }
  await q("UPDATE users SET role='admin',active=true,factory_id=NULL,token_version=0 WHERE id=ANY($1::uuid[])",[[admin1.id,admin2.id]]);
  const deleted = await Promise.all([call(`/users/${admin2.id}`,'DELETE',undefined,admin1),call(`/users/${admin1.id}`,'DELETE',undefined,admin2)]);
  assert.equal(deleted.filter(r=>r.status===200).length,1);
  assert.equal((await q("SELECT count(*)::int AS n FROM users WHERE role='admin' AND active AND factory_id IS NULL")).rows[0].n,1);
  assert.equal((await call(`/users/${crypto.randomUUID()}`,'PUT',{name:'x'},factoryAdmin)).status,404);
  console.log('PASS: concurrent administrator disable/demotion/reassignment/deletion');

  if (process.argv.includes('--preview')) {
    await q("INSERT INTO users(username,role,password_hash) VALUES ('previewadmin','admin',$1)",[hash]);
    console.log('PREVIEW READY: localhost:4000, login previewadmin / Preview123! (isolated test data)');
    await new Promise(resolve => { process.once('SIGINT',resolve); process.once('SIGTERM',resolve); });
  }
} finally { await cleanup(); }
