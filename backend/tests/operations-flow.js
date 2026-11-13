import assert from 'node:assert/strict';import crypto from 'node:crypto';import pg from 'pg';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {fileURLToPath} from 'node:url';
const source=process.env.DATABASE_URL||process.env.POSTGRES_URL;
if(!source)throw new Error('DATABASE_URL required');
const schema=`payroll_${crypto.randomBytes(8).toString('hex')}`;
const management=new pg.Pool({connectionString:source});
await management.query(`CREATE SCHEMA ${schema}`);
const url=new URL(source);url.searchParams.set('options',`-c search_path=${schema},public`);
process.env.DATABASE_URL=url.toString();process.env.AUTH_SECRET=crypto.randomBytes(32).toString('hex');
const {one,q,migrate,getPool}=await import('../src/db.js');
const {issueToken,hashPassword}=await import('../src/auth.js');
const {default:app}=await import('../src/app.js');let server;
try {
  await migrate();
  const f=await one("INSERT INTO factories(code,name) VALUES('pay-test','Payroll test') RETURNING *");
  const other=await one("INSERT INTO factories(code,name) VALUES('other','Other') RETURNING *");
  const hash=await hashPassword('Test123!');const users={};
  for(const role of ['admin','rahbar','buxgalter','kadrlar','usta','pto','omborchi','kuzatuvchi','kurator'])users[role]=await one('INSERT INTO users(username,role,factory_id,password_hash) VALUES($1,$2,$3,$4) RETURNING *',['test_'+role,role,f.id,hash]);
  const hq=await one("INSERT INTO users(username,role,password_hash) VALUES('hqa','admin',$1) RETURNING *",[hash]);
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}/api`;
  async function call(path,method='GET',body,user=users.admin,factory=f.id){
    const response=await fetch(base+path,{method,headers:{Authorization:`Bearer ${issueToken(user)}`,'Content-Type':'application/json','X-Factory':factory},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:response.status,body:await response.json()};
  }
  async function ok(path,method,body,user){const result=await call(path,method,body,user);assert.equal(result.status,200,JSON.stringify(result));return result.body;}


 const date='2026-11-11',pdf=Buffer.from('%PDF-1.4\nQA\n%%EOF').toString('base64');
 const material=await one("INSERT INTO materials(factory_id,name,unit,stock) VALUES($1,'Sinov armaturasi','kg',true) RETURNING *",[f.id]);
 const product=await one("INSERT INTO products(factory_id,code,norms) VALUES($1,'SINOV-1',$2) RETURNING *",[f.id,JSON.stringify([{materialId:material.id,norm:2}])]);
 const order=await one("INSERT INTO orders(factory_id,no,customer,items) VALUES($1,1,'Sinov buyurtmachisi',$2) RETURNING *",[f.id,JSON.stringify([{productId:product.id,qty:10,price:100,shippedBefore:0}])]);
 const incoming=await ok('/finance/material-invoices','POST',{requestId:crypto.randomUUID(),type:'in',date,number:'IN-1',counterparty:'Ta’minotchi',items:[{materialId:material.id,qty:100,price:10,vatRate:0}]},users.buxgalter);assert.equal(incoming.amount,1000);
 let day=await ok('/days/'+date,'PUT',{production:[{productId:product.id,plan:10,fact:10,brak:0}],materials:[{materialId:material.id,sarf:20,kirim:0}],baseUpdatedAt:null},users.usta);
 assert.equal((await call('/days/'+date,'PUT',{note:'stale',baseVersion:day.version-1},users.usta)).status,409);
 const dispatchId=crypto.randomUUID();day=await ok('/days/'+date,'PUT',{baseVersion:day.version,baseUpdatedAt:day.updatedAt,shipments:[{productId:product.id,orderId:order.id,qty:4,customer:'Sinov buyurtmachisi',vehicle:'01 A 001 AA',dispatchId,dispatchNo:'1'}],dispatchDocument:{id:dispatchId,date,number:'1',receiver:'Sinov buyurtmachisi',vehicle:'01 A 001 AA',name:'Sinov.pdf',contentBase64:pdf}});
 const stock=await ok('/stock?from='+date+'&to='+date);assert.equal(stock.materials[material.id].end,80);assert.equal(stock.products[product.id].end,6);
 // Historical review states must no longer block normal save operations.
 for(const status of ['submitted','approved']){
   await q('UPDATE days SET review_status=$3 WHERE factory_id=$1 AND date=$2',[f.id,date,status]);
   day=await ok('/days/'+date,'PUT',{note:'Oddiy saqlash: '+status,baseVersion:day.version},users.usta);
 }
 assert.equal((await call('/days/'+date,'PUT',{note:'readonly'},users.kuzatuvchi)).status,403);
 assert.equal((await call('/days/'+date,'PUT',{note:'stale',baseVersion:day.version-1},users.usta)).status,409);
 await q("INSERT INTO day_reviews(factory_id,date,action,actor) VALUES($1,$2,'approve',$3)",[f.id,date,JSON.stringify({id:users.pto.id})]);
 assert.equal((await call('/days/'+date+'/review','POST',{action:'submit',version:day.version},users.usta)).status,403);
 const invoice=await ok('/finance/orders/'+order.id+'/invoices','POST',{requestId:crypto.randomUUID(),number:'OUT-1',date,items:[{productId:product.id,qty:4,price:100}],name:'Faktura.pdf',contentBase64:pdf},users.buxgalter);
 await ok('/finance/orders/'+order.id+'/receipts','POST',{requestId:crypto.randomUUID(),invoiceId:invoice.id,date,amount:250},users.buxgalter);
 const control=await ok('/reconciliation?date='+date,undefined,undefined,users.pto);assert.equal(control.issues.length,0);assert.equal(control.variance.length,0);assert.equal(control.summary.debt,150);
 assert.equal((await call('/reconciliation?date='+date,'GET',undefined,users.usta)).status,403);
 // Invalid legacy data is surfaced, not silently rewritten.
 await q('UPDATE movements SET qty=99 WHERE id=$1',[incoming.items[0].movementId]);assert.ok((await ok('/reconciliation?date='+date)).issues.some(i=>i.type==='material_invoice_movement'));await q('UPDATE movements SET qty=100 WHERE id=$1',[incoming.items[0].movementId]);
 const backup=await ok('/backup');assert.equal(backup.data.day_reviews.length,1);
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'operations-restore-'));
 try{const file=path.join(folder,'backup.json');await fs.writeFile(file,JSON.stringify(backup));const script=fileURLToPath(new URL('../scripts/restore.js',import.meta.url));await promisify(execFile)(process.execPath,[script,file,'--yes'],{cwd:folder,env:process.env,windowsHide:true});assert.equal((await ok('/days/'+date)).reviewStatus,'approved');assert.equal((await one('SELECT count(*)::int AS n FROM day_reviews WHERE factory_id=$1',[f.id])).n,1);await ok('/days/'+date,'PUT',{note:'Tiklangandan keyin ham saqlanadi'},users.usta);assert.equal((await ok('/reconciliation?date='+date)).summary.debt,150);}finally{for(const file of await fs.readdir(folder))await fs.unlink(path.join(folder,file));await fs.rmdir(folder);}
 // Exercise the actual unknown-error middleware, keeping raw error text out of logs and responses.
 await q("CREATE FUNCTION qa_fail_day() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'PRIVATE_TOKEN_DO_NOT_LOG'; END; $$");await q('CREATE TRIGGER qa_day_error BEFORE INSERT ON days FOR EACH ROW EXECUTE FUNCTION qa_fail_day()');
 const logs=[],oldLog=console.error;let failure;console.error=(...v)=>logs.push(v.join(' '));try{failure=await call('/days/2026-11-10','PUT',{note:'failure'});}finally{console.error=oldLog;await q('DROP TRIGGER qa_day_error ON days');await q('DROP FUNCTION qa_fail_day()');}
 assert.equal(failure.status,500);assert.match(failure.body.errorId,/^[a-f0-9-]{36}$/);assert.ok(!JSON.stringify(failure).includes('PRIVATE_TOKEN'));assert.ok(!logs.join('').includes('PRIVATE_TOKEN'));
 const incidents=await ok('/error-incidents');assert.equal(incidents[0].id,failure.body.errorId);assert.equal((await call('/error-incidents','GET',undefined,users.pto)).status,403);const otherAdmin=await one("INSERT INTO users(username,role,factory_id,password_hash) VALUES('error_other','admin',$1,$2) RETURNING *",[other.id,hash]);assert.equal((await call('/error-incidents','GET',undefined,otherAdmin,other.id)).body.length,0);assert.equal((await call('/error-incidents','GET',undefined,hq)).body.length,1);
 console.log('PASS full business flow: material invoice → production/consumption → stock → shipment → invoice → partial receipt → debt; legacy submitted/approved reports editable, role/version guards; restore retains review history and balances; error IDs without sensitive messages');
}finally{if(server)await new Promise(resolve=>server.close(resolve));await getPool().end();await management.query('DROP SCHEMA '+schema+' CASCADE');await management.end();}
