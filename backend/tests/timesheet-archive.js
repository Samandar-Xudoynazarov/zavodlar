// Kadrlar: Tabel raqami bo'yicha saralash va tasdiqlangan tabel PDF arxivi
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';
const source=process.env.DATABASE_URL||process.env.POSTGRES_URL,schema=`tabelarx_${crypto.randomBytes(8).toString('hex')}`;
const management=new pg.Pool({connectionString:source});await management.query(`CREATE SCHEMA ${schema}`);
const url=new URL(source);url.searchParams.set('options',`-c search_path=${schema},public`);process.env.DATABASE_URL=url.toString();process.env.AUTH_SECRET=crypto.randomBytes(32).toString('hex');
const {one,migrate,getPool}=await import('../src/db.js'),{issueToken,hashPassword}=await import('../src/auth.js'),{default:app}=await import('../src/app.js');let server;
try{
 await migrate();const f=await one("INSERT INTO factories(code,name) VALUES('tabel','Sinov zavodi') RETURNING *"),other=await one("INSERT INTO factories(code,name) VALUES('other2','Other') RETURNING *"),users={},hash=await hashPassword('Test123!');
 for(const role of ['admin','rahbar','kadrlar','buxgalter','usta'])users[role]=await one('INSERT INTO users(username,role,factory_id,password_hash) VALUES($1,$2,$3,$4) RETURNING *',[role,role,f.id,hash]);
 const alien=await one("INSERT INTO users(username,role,factory_id,password_hash) VALUES('alien2','kadrlar',$1,$2) RETURNING *",[other.id,hash]);
 server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}/api`;
 const headers=user=>({Authorization:`Bearer ${issueToken(user)}`});
 async function call(p,method='GET',body,user=users.kadrlar){const r=await fetch(base+p,{method,headers:{...headers(user),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json().catch(()=>null)};}
 async function ok(p,m,b,u){const r=await call(p,m,b,u);assert.equal(r.status,200,JSON.stringify(r));return r.body;}
 // 1) saralash: 1, 2, 10, keyin harfli raqamlar (bo'lim va ismdan qat'i nazar)
 for(const [code,name,department] of [['10','Aliyev','A sex'],['2','Valiyev','B sex'],['A-5','Boboyev','A sex'],['1','Yusupov','C sex']])await ok('/hr/employees','POST',{code,name,department,hireDate:'2025-01-01'});
 assert.deepEqual((await ok('/hr/employees')).map(e=>e.code),['1','2','10','A-5']);
 assert.deepEqual((await ok('/hr/personnel-documents')).employees.map(e=>e.code),['1','2','10','A-5']);
 // 2) tabel PDF arxivi
 const pdf=Buffer.from('%PDF-1.4\nTasdiqlangan tabel\n%%EOF');
 const upload=(q,body=pdf,user=users.kadrlar)=>fetch(base+'/hr/personnel-documents/timesheets?'+new URLSearchParams(q),{method:'POST',headers:{...headers(user),'Content-Type':'application/octet-stream'},body});
 let r=await upload({month:'2025-03',name:'Tabel_mart.pdf',title:'1-sex'});assert.equal(r.status,200);const first=await r.json();assert.equal(first.month,'2025-03');assert.ok(!Object.hasOwn(first,'contentBase64'));
 assert.equal((await upload({month:'2025-03',name:'Tabel_mart_2.pdf'},pdf,users.admin)).status,200);
 assert.equal((await upload({month:'2026-01',name:'Yanvar.pdf'})).status,200);
 assert.equal((await upload({month:'2099-01',name:'kelajak.pdf'})).status,400);
 assert.equal((await upload({month:'2025-13',name:'x.pdf'})).status,400);
 assert.equal((await upload({month:'2025-04',name:'x.pdf'},Buffer.from('not a pdf'))).status,400);
 for(const u of [users.rahbar,users.buxgalter,users.usta])assert.equal((await upload({month:'2025-04',name:'x.pdf'},pdf,u)).status,403);
 assert.equal((await ok('/hr/personnel-documents/timesheets?year=2025')).length,2);assert.equal((await ok('/hr/personnel-documents/timesheets')).length,3);
 assert.equal((await ok('/hr/personnel-documents/timesheets?year=2025',undefined,undefined,users.buxgalter)).length,2);
 assert.equal((await call('/hr/personnel-documents/timesheets',undefined,undefined,users.usta)).status,403);
 assert.equal((await ok('/hr/personnel-documents/timesheets',undefined,undefined,alien)).length,0);
 const file=await fetch(base+'/hr/personnel-documents/timesheets/'+first.id,{headers:headers(users.rahbar)});assert.equal(file.status,200);assert.equal(file.headers.get('content-type'),'application/pdf');assert.ok(Buffer.from(await file.arrayBuffer()).equals(pdf));
 assert.equal((await call('/hr/personnel-documents/timesheets/'+first.id,undefined,undefined,alien)).status,400);
 assert.equal((await call('/hr/personnel-documents/timesheets/'+first.id,'DELETE',undefined,users.rahbar)).status,403);
 assert.equal((await call('/hr/personnel-documents/timesheets/'+first.id,'DELETE',undefined,alien)).status,409);
 await ok('/hr/personnel-documents/timesheets/'+first.id,'DELETE');assert.equal((await ok('/hr/personnel-documents/timesheets?year=2025')).length,1);
 console.log('PASS timesheet-archive: employees sorted by Tabel raqami, monthly approved PDF archive (upload, list by year, download, delete, roles, factory isolation)');
}finally{if(server)await new Promise(resolve=>server.close(resolve));await getPool().end();await management.query(`DROP SCHEMA ${schema} CASCADE`);await management.end();}
