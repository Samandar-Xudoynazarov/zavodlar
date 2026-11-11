import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import pg from 'pg';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
const chunks=[];if(!process.stdin.isTTY)for await(const chunk of process.stdin)chunks.push(chunk);
const fixture=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):JSON.parse(await fs.readFile(new URL('../pto-backup-2026-09-30-08-56.json',import.meta.url),'utf8'));
const source=process.env.DATABASE_URL||process.env.POSTGRES_URL;
if(!source)throw new Error('DATABASE_URL required');const schema='import_test_'+crypto.randomBytes(8).toString('hex');const management=new pg.Pool({connectionString:source,connectionTimeoutMillis:10000});await management.query('CREATE SCHEMA '+schema);
const url=new URL(source);url.searchParams.set('options','-c search_path='+schema+',public');process.env.DATABASE_URL=url.toString();process.env.AUTH_SECRET=crypto.randomBytes(32).toString('hex');
const {q,one,rows,migrate,getPool}=await import('../src/db.js');const {issueToken,hashPassword}=await import('../src/auth.js');const {default:app,BACKUP_TABLES}=await import('../src/app.js');let server;
try {
 await migrate();const f=await one("INSERT INTO factories(code,name) VALUES('import-a','Import zavodi A') RETURNING *"),other=await one("INSERT INTO factories(code,name) VALUES('import-b','Import zavodi B') RETURNING *");
 const hash=await hashPassword('ImportTest123!');const admin=await one("INSERT INTO users(username,role,password_hash) VALUES('head-admin','admin',$1) RETURNING *",[hash]);const users=[];
 for(const role of ['admin','rahbar','pto','buxgalter','kadrlar','kuzatuvchi','kurator'])users.push(await one('INSERT INTO users(username,role,factory_id,password_hash) VALUES($1,$2,$3,$4) RETURNING *',['factory-'+role,role,f.id,hash]));
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api/admin/factory-imports';
 const call=async(path='',method='POST',body={},user=admin)=>{const r=await fetch(base+path,{method,headers:{Authorization:'Bearer '+issueToken(user),'Content-Type':'application/json','X-Factory':other.id},body:method==='GET'?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
 const input={factoryId:f.id,backup:fixture,fileName:'pto-reference.json'};
 for(const user of users){assert.equal((await call('/preview','POST',input,user)).status,403);assert.equal((await call('','POST',input,user)).status,403);assert.equal((await call('?factoryId='+f.id,'GET',{},user)).status,403);}
 assert.equal((await call('/preview','POST',{...input,backup:{app:'zavodlar',format:2,data:{}}})).status,400);
 const malformed=structuredClone(fixture);malformed.data.materials[0].history={wrong:true};assert.equal((await call('/preview','POST',{...input,backup:malformed})).status,400);
 const preview=await call('/preview','POST',input);assert.equal(preview.status,200,JSON.stringify(preview.body));assert.equal(preview.body.factory.id,f.id);assert.equal(preview.body.counts.materials,fixture.data.materials.length);assert.equal(preview.body.skippedUsers,fixture.data.users.length);assert.equal(preview.body.hasData,false);
 assert.equal((await one('SELECT count(*) AS n FROM materials')).n,0);assert.equal((await one('SELECT count(*) AS n FROM factory_imports')).n,0);
 const req={...input,requestId:crypto.randomUUID(),fingerprint:preview.body.fingerprint};
 const results=await Promise.all([call('','POST',req),call('','POST',req)]);assert.deepEqual(results.map(r=>r.status),[200,200]);assert.equal(results[0].body.import.id,results[1].body.import.id);assert.equal((await one('SELECT count(*) AS n FROM factory_imports')).n,1);
 const archive=results[0].body.import;
 assert.equal((await one('SELECT count(*) AS n FROM materials WHERE factory_id=$1',[f.id])).n,fixture.data.materials.length);assert.equal((await one('SELECT count(*) AS n FROM products WHERE factory_id=$1',[f.id])).n,fixture.data.products.length);assert.equal((await one('SELECT count(*) AS n FROM orders WHERE factory_id=$1',[f.id])).n,fixture.data.orders.length);assert.equal((await one('SELECT count(*) AS n FROM days WHERE factory_id=$1',[f.id])).n,fixture.data.days.length);
 assert.equal((await one('SELECT count(*) AS n FROM materials WHERE factory_id=$1',[other.id])).n,0);assert.equal((await one('SELECT count(*) AS n FROM users')).n,8);
 const materialIds=new Set((await rows('SELECT id FROM materials WHERE factory_id=$1',[f.id])).map(m=>m.id));for(const p of await rows('SELECT * FROM products WHERE factory_id=$1',[f.id]))for(const it of [...p.norms,...(p.calc.items||[])])assert.ok(materialIds.has(it.materialId));
 const totalHistory=fixture.data.materials.reduce((s,m)=>s+(m.history?.length||0),0);assert.equal((await one('SELECT coalesce(sum(jsonb_array_length(history)),0) AS n FROM materials WHERE factory_id=$1',[f.id])).n,totalHistory);
 const oldBackup=await call('/'+archive.id+'/backup','GET');assert.equal(oldBackup.status,200);assert.equal(oldBackup.body.data.materials.length,0);assert.equal(oldBackup.body.data.factories[0].id,f.id);
 const list=await call('?factoryId='+f.id,'GET');assert.equal(list.status,200);assert.ok(!Object.hasOwn(list.body[0],'sourceData'));assert.ok(BACKUP_TABLES.includes('factory_imports'));
 assert.equal((await call('/'+archive.id+'/backup','GET',{},users[0])).status,403);
 console.log('PASS: HQ-only API, read-only preview, exact source counts, scoped IDs, history, users unchanged, concurrent idempotency and backups');
 // A different source file for replacement, without changing operational keys.
 const changed=structuredClone(fixture);changed.createdAt='2026-11-12T08:00:00Z';changed.data.materials[0].name+=' (import test)';const next={...input,backup:changed};const check=await call('/preview','POST',next);assert.equal(check.body.hasData,true);
 const body={...next,requestId:crypto.randomUUID(),fingerprint:check.body.fingerprint};assert.equal((await call('','POST',body)).status,409);
 await q("UPDATE materials SET name=name||' local' WHERE factory_id=$1 AND id=(SELECT id FROM materials WHERE factory_id=$1 LIMIT 1)",[f.id]);assert.equal((await call('','POST',{...body,replace:true})).status,409);
 const fresh=await call('/preview','POST',next);const before=await rows('SELECT * FROM materials WHERE factory_id=$1 ORDER BY id',[f.id]);const replaced=await call('','POST',{...body,replace:true,fingerprint:fresh.body.fingerprint});assert.equal(replaced.status,200,JSON.stringify(replaced.body));assert.equal(replaced.body.import.replaced,true);const snap=await call('/'+replaced.body.import.id+'/backup','GET');assert.deepEqual(snap.body.data.materials,JSON.parse(JSON.stringify(before.map(m=>{const out={};for(const [k,v]of Object.entries(m))out[k==='group'?'grp':k.replace(/[A-Z]/g,c=>'_'+c.toLowerCase())]=v;return out;}))));
 // Force a late SQL constraint failure and verify transaction rollback and archive rollback.
 const invalid=structuredClone(changed);invalid.createdAt='2026-11-13T08:00:00Z';invalid.data.movements[0].qty=-1;const badInput={...input,backup:invalid};const checked=await call('/preview','POST',badInput);assert.equal(checked.status,200);const countBefore=(await one('SELECT count(*) AS n FROM factory_imports')).n;const snapshotBefore=await rows('SELECT * FROM materials WHERE factory_id=$1 ORDER BY id',[f.id]);const failed=await call('','POST',{...badInput,requestId:crypto.randomUUID(),replace:true,fingerprint:checked.body.fingerprint});assert.equal(failed.status,400);assert.deepEqual(await rows('SELECT * FROM materials WHERE factory_id=$1 ORDER BY id',[f.id]),snapshotBefore);assert.equal((await one('SELECT count(*) AS n FROM factory_imports')).n,countBefore);
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'zavodlar-import-restore-'));
 try{const file=path.join(temp,'before-import.json');await fs.writeFile(file,JSON.stringify(snap.body));await promisify(execFile)(process.execPath,[fileURLToPath(new URL('../scripts/restore.js',import.meta.url)),file,'--yes'],{cwd:temp,env:{...process.env,DATABASE_URL:url.toString()},windowsHide:true,timeout:60000});assert.deepEqual(await rows('SELECT * FROM materials WHERE factory_id=$1 ORDER BY id',[f.id]),before);console.log('PASS: downloaded pre-import backup restores exactly, including material history');}finally{const resolved=path.resolve(temp);if(path.dirname(resolved)===path.resolve(os.tmpdir())&&path.basename(resolved).startsWith('zavodlar-import-restore-'))await fs.rm(resolved,{recursive:true,force:true});}
 const currentOrder=await one('SELECT * FROM orders WHERE factory_id=$1 LIMIT 1',[f.id]);const currentProduct=currentOrder.items[0].productId;await q('INSERT INTO finance_order_progress(factory_id,order_id,product_id,ready_qty) VALUES($1,$2,$3,0)',[f.id,currentOrder.id,currentProduct]);const blocked=await call('/preview','POST',badInput);assert.equal(blocked.body.blocked,true);assert.equal((await call('','POST',{...badInput,requestId:crypto.randomUUID(),replace:true,fingerprint:blocked.body.fingerprint})).status,409);
 console.log('PASS: explicit replacement, stale preview protection, atomic snapshot and rollback, finance links protected');
} finally {if(server)await new Promise(r=>server.close(r));await getPool().end();await management.query('DROP SCHEMA '+schema+' CASCADE');await management.end();}
