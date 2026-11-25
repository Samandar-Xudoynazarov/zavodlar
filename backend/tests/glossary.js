// Lug'at: nomlar va tayyor iboralarning o'zbekcha / ruscha shakli
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';
const source=process.env.DATABASE_URL||process.env.POSTGRES_URL;
if(!source)throw new Error('DATABASE_URL is required');
const schema='glossary_test_'+crypto.randomBytes(8).toString('hex');
const management=new pg.Pool({connectionString:source,connectionTimeoutMillis:10000});
await management.query('CREATE SCHEMA '+schema);
const url=new URL(source);url.searchParams.set('options','-c search_path='+schema+',public');process.env.DATABASE_URL=url.toString();process.env.AUTH_SECRET=crypto.randomBytes(32).toString('hex');
const {one,getPool,migrate}=await import('../src/db.js');
const {issueToken,hashPassword}=await import('../src/auth.js');
const {default:app,BACKUP_TABLES}=await import('../src/app.js');
const {cleanEntry}=await import('../src/routes/glossary.js');
let server;
try {
 await migrate();
 assert.ok(BACKUP_TABLES.includes('glossary'));
 assert.deepEqual(cleanEntry({uz:'  Ankerli   plita ',ru:'Плита анкерная'}),{uz:'Ankerli plita',ru:'Плита анкерная',kind:'name'});
 assert.throws(()=>cleanEntry({uz:'',ru:'x'}));
 assert.throws(()=>cleanEntry({uz:'x',ru:'y',kind:'boshqa'}));

 const f=await one("INSERT INTO factories(code,name) VALUES('gl-a','Gl A') RETURNING *");
 const f2=await one("INSERT INTO factories(code,name) VALUES('gl-b','Gl B') RETURNING *");
 const hash=await hashPassword('GlossTest123!');const users={};
 for(const role of ['admin','pto','usta','kuzatuvchi'])users[role]=await one('INSERT INTO users(username,role,factory_id,password_hash) VALUES($1,$1,$2,$3) RETURNING *',[role,f.id,hash]);
 users.other=await one("INSERT INTO users(username,role,factory_id,password_hash) VALUES('other','admin',$1,$2) RETURNING *",[f2.id,hash]);
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api';
 const call=async(path,method='GET',body,user=users.admin)=>{const r=await fetch(base+path,{method,headers:{Authorization:'Bearer '+issueToken(user),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json()};};

 const a=await call('/glossary','POST',{uz:'Ankerli plita',ru:'Плита анкерная'},users.pto);
 assert.equal(a.status,201,JSON.stringify(a.body));
 assert.equal((await call('/glossary','POST',{uz:' ankerli  PLITA',ru:'Другое'})).status,409,'takror o‘zbekcha');
 assert.equal((await call('/glossary','POST',{uz:'Boshqa',ru:'плита АНКЕРНАЯ'})).status,409,'takror ruscha');
 assert.equal((await call('/glossary','POST',{uz:'Qolip yetmadi',ru:'Не хватило форм',kind:'phrase'})).status,201);
 assert.equal((await call('/glossary','POST',{uz:'x',ru:'y'},users.usta)).status,403);
 assert.equal((await call('/glossary','POST',{uz:'x',ru:''})).status,400);
 // hamma ko'radi, faqat o'z zavodini
 const list=await call('/glossary','GET',undefined,users.kuzatuvchi);
 assert.equal(list.status,200);assert.equal(list.body.items.length,2);assert.equal(list.body.canEdit,false);
 assert.equal((await call('/glossary','GET',undefined,users.other)).body.items.length,0);
 assert.equal((await call('/glossary/'+a.body.id,'PUT',{uz:'x',ru:'y'},users.other)).status,404);
 // tahrirlash va o'chirish
 const u=await call('/glossary/'+a.body.id,'PUT',{uz:'Anker plita',ru:'Плита анкерная'});
 assert.equal(u.status,200);assert.equal(u.body.uz,'Anker plita');
 // nomzodlar: ishlatilayotgan nomlar
 await one("INSERT INTO products(factory_id,code,name) VALUES($1,'L-1','Кабельный лоток') RETURNING id",[f.id]);
 await one("INSERT INTO suppliers(factory_id,name) VALUES($1,'Sement savdo') RETURNING id",[f.id]);
 const c=await call('/glossary/candidates');
 assert.equal(c.status,200);
 assert.deepEqual(c.body.items.map(x=>x.text).sort(),['Sement savdo','Кабельный лоток']);
 assert.equal((await call('/glossary/candidates','GET',undefined,users.kuzatuvchi)).status,403);
 assert.equal((await call('/glossary/'+a.body.id,'DELETE')).status,200);
 assert.equal((await call('/glossary/'+a.body.id,'DELETE')).status,404);
 assert.equal((await call('/glossary','GET')).body.items.length,1);
 console.log('✓ glossary');
} finally {
 server?.close();
 await getPool().end().catch(()=>{});
 await management.query('DROP SCHEMA '+schema+' CASCADE').catch(()=>{});
 await management.end();
}
