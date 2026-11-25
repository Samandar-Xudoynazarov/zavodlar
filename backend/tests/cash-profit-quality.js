// Kassa va bank, foyda va zarar, sifat nazorati (beton sinovi)
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';
const source=process.env.DATABASE_URL||process.env.POSTGRES_URL;
if(!source)throw new Error('DATABASE_URL is required');
const schema='cash_test_'+crypto.randomBytes(8).toString('hex');
const management=new pg.Pool({connectionString:source,connectionTimeoutMillis:10000});
await management.query('CREATE SCHEMA '+schema);
const url=new URL(source);url.searchParams.set('options','-c search_path='+schema+',public');process.env.DATABASE_URL=url.toString();process.env.AUTH_SECRET=crypto.randomBytes(32).toString('hex');
const {one,getPool,migrate}=await import('../src/db.js');
const {issueToken,hashPassword}=await import('../src/auth.js');
const {default:app,BACKUP_TABLES}=await import('../src/app.js');
const {profitRow,lastMonths}=await import('../src/routes/finance-profit.js');
const {qualityStatus}=await import('../src/routes/quality.js');
let server;
try {
 await migrate();
 for(const t of ['finance_cash_accounts','finance_cash_entries','quality_tests'])assert.ok(BACKUP_TABLES.includes(t),t);
 // sof funksiyalar
 assert.deepEqual(lastMonths('2026-02',3),['2025-12','2026-01','2026-02']);
 const pr=profitRow({revenue:1000,materials:300,expenses:50,payroll:{status:'approved',socialTaxRate:12,snapshot:[{gross:200},{gross:100}]}});
 assert.equal(pr.payroll,300);assert.equal(pr.socialTax,36);assert.equal(pr.costs,686);assert.equal(pr.profit,314);assert.equal(pr.complete,true);
 const draft=profitRow({revenue:1000,payroll:{status:'draft',snapshot:null}});assert.equal(draft.payroll,null);assert.equal(draft.complete,false);assert.equal(draft.profit,1000);
 assert.equal(qualityStatus({requiredMpa:25,r28Mpa:26,castDate:'2026-01-01'}),'ok');
 assert.equal(qualityStatus({requiredMpa:25,r28Mpa:20,castDate:'2026-01-01'}),'fail');
 assert.equal(qualityStatus({requiredMpa:25,r7Mpa:10,r28Mpa:null,castDate:'2026-01-01'},'2026-01-10'),'risk');
 assert.equal(qualityStatus({requiredMpa:25,r7Mpa:18,r28Mpa:null,castDate:'2026-01-01'},'2026-01-10'),'pending');
 assert.equal(qualityStatus({requiredMpa:25,r7Mpa:null,r28Mpa:null,castDate:'2026-01-01'},'2026-03-01'),'late');

 const f=await one("INSERT INTO factories(code,name) VALUES('cash-a','Cash A') RETURNING *");
 const f2=await one("INSERT INTO factories(code,name) VALUES('cash-b','Cash B') RETURNING *");
 const hash=await hashPassword('CashTest123!');const users={};
 for(const role of ['admin','rahbar','buxgalter','pto','usta','omborchi','kuzatuvchi'])users[role]=await one('INSERT INTO users(username,role,factory_id,password_hash) VALUES($1,$1,$2,$3) RETURNING *',[role,f.id,hash]);
 users.other=await one("INSERT INTO users(username,role,factory_id,password_hash) VALUES('other','admin',$1,$2) RETURNING *",[f2.id,hash]);
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api';
 const call=async(path,method='GET',body,user=users.admin)=>{const r=await fetch(base+path,{method,headers:{Authorization:'Bearer '+issueToken(user),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const ct=r.headers.get('content-type');return {status:r.status,body:ct?.includes('application/json')?await r.json():await r.text()};};

 // --- Kassa va bank ---
 assert.equal((await call('/finance/cash','GET',undefined,users.pto)).status,403);
 const acc=await call('/finance/cash/accounts','POST',{name:'Asosiy kassa',kind:'naqd',openingBalance:1000,openingDate:'2026-10-01'},users.buxgalter);
 assert.equal(acc.status,201,JSON.stringify(acc.body));
 assert.equal((await call('/finance/cash/accounts','POST',{name:' asosiy KASSA ',kind:'naqd',openingDate:'2026-10-01'})).status,409);
 assert.equal((await call('/finance/cash/accounts','POST',{name:'X',kind:'karta',openingDate:'2026-10-01'})).status,400);
 const bank=await call('/finance/cash/accounts','POST',{name:'Bank hisob',kind:'bank',openingDate:'2026-10-01'});assert.equal(bank.status,201);
 const entry=(x)=>call('/finance/cash/entries','POST',{requestId:crypto.randomUUID(),accountId:acc.body.id,date:'2026-10-05',direction:'in',amount:500,category:'mijoz',counterparty:'Mijoz A',...x});
 const e1=await entry();assert.equal(e1.status,200,JSON.stringify(e1.body));
 const rid=crypto.randomUUID();const a1=await entry({requestId:rid,direction:'out',amount:200,category:'xarajat',counterparty:'Elektr'});const a2=await entry({requestId:rid,direction:'out',amount:200,category:'xarajat'});
 assert.equal(a1.body.id,a2.body.id,'idempotent');
 assert.equal((await entry({amount:0})).status,400);
 assert.equal((await entry({category:'nimadir'})).status,400);
 assert.equal((await entry({date:'2026-09-30'})).status,400,'boshlang‘ich sanadan oldin');
 assert.equal((await entry({accountId:bank.body.id,direction:'out',amount:70,category:'xarajat'})).status,200);
 let list=(await call('/finance/cash?from=2026-10-01&to=2026-10-31')).body;
 assert.equal(list.entries.length,3);
 assert.equal(list.accounts.find(a=>a.id===acc.body.id).balance,1300);
 assert.equal(list.accounts.find(a=>a.id===bank.body.id).balance,-70);
 // boshqa zavod ko'rmaydi
 assert.equal((await call('/finance/cash','GET',undefined,users.other)).body.accounts.length,0);
 assert.equal((await call('/finance/cash/entries','POST',{requestId:crypto.randomUUID(),accountId:acc.body.id,date:'2026-10-05',direction:'in',amount:1,category:'boshqa'},users.other)).status,400);
 // bekor qilish
 assert.equal((await call('/finance/cash/entries/'+e1.body.id+'/void','POST',{reason:'x'})).status,400);
 assert.equal((await call('/finance/cash/entries/'+e1.body.id+'/void','POST',{reason:'xato kiritilgan'})).status,200);
 assert.equal((await call('/finance/cash/entries/'+e1.body.id+'/void','POST',{reason:'xato kiritilgan'})).status,409);
 list=(await call('/finance/cash')).body;assert.equal(list.accounts.find(a=>a.id===acc.body.id).balance,800);
 // arxivlangan hisobga yozib bo'lmaydi
 assert.equal((await call('/finance/cash/accounts/'+bank.body.id,'PUT',{archived:true})).status,200);
 assert.equal((await entry({accountId:bank.body.id})).status,409);
 // oy yopilsa
 assert.equal((await call('/finance/periods/2026-10/lock','POST',{note:'test'})).status,200);
 assert.equal((await entry({date:'2026-10-20'})).status,409);
 assert.equal((await call('/finance/cash/entries/'+a1.body.id+'/void','POST',{reason:'xato kiritilgan'})).status,409);

 // --- Foyda va zarar ---
 const p=await one("INSERT INTO products(factory_id,code) VALUES($1,'P1') RETURNING *",[f.id]);
 const order=await one("INSERT INTO orders(factory_id,no,customer,date,status,items) VALUES($1,1,'Mijoz A','2026-10-01','jarayonda',$2) RETURNING *",[f.id,JSON.stringify([{productId:p.id,qty:10,price:1000,shippedBefore:10}])]);
 await one("INSERT INTO finance_invoices(factory_id,order_id,request_id,number,date,items,net,vat,amount,name,content_base64,size_bytes,created_by) VALUES($1,$2,gen_random_uuid(),'F1','2026-10-03','[]',10000,1200,11200,'f.pdf','JVBERg==',5,'{}') RETURNING id",[f.id,order.id]);
 await one("INSERT INTO material_invoices(factory_id,request_id,type,number,date,counterparty,items,amount) VALUES($1,gen_random_uuid(),'in','M1','2026-10-04','Sement','[]',4000) RETURNING id",[f.id]);
 assert.equal((await call('/finance/profit?month=2026-10','GET',undefined,users.pto)).status,403);
 assert.equal((await call('/finance/profit?month=2026-13')).status,400);
 const pl=await call('/finance/profit?month=2026-10',"GET",undefined,users.rahbar);assert.equal(pl.status,200,JSON.stringify(pl.body));
 assert.equal(pl.body.months.length,6);assert.equal(pl.body.total,null);
 const oct=pl.body.factories[0].months.at(-1);
 assert.equal(oct.revenue,10000);assert.equal(oct.vat,1200);assert.equal(oct.materials,4000);assert.equal(oct.expenses,270);assert.equal(oct.payroll,null);assert.equal(oct.complete,false);assert.equal(oct.profit,5730);

 // --- Sifat nazorati ---
 const qt=(x,u=users.usta)=>call('/quality','POST',{requestId:crypto.randomUUID(),castDate:'2026-10-01',grade:'B25',requiredMpa:32.7,samples:3,...x},u);
 assert.equal((await qt({},users.omborchi)).status,403);
 assert.equal((await qt({},users.kuzatuvchi)).status,403);
 assert.equal((await qt({grade:''})).status,400);
 assert.equal((await qt({requiredMpa:0})).status,400);
 assert.equal((await qt({productId:crypto.randomUUID()})).status,400);
 const t1=await qt({r7Mpa:24,productId:p.id,batch:'P-1'});assert.equal(t1.status,200,JSON.stringify(t1.body));
 const t2=await qt({r7Mpa:22,r28Mpa:30},users.pto);assert.equal(t2.status,200);assert.equal(t2.body.status,'fail');assert.equal(t2.body.percent,91.7);
 const upd=await call('/quality/'+t1.body.id,'PUT',{castDate:'2026-10-01',grade:'B25',requiredMpa:32.7,r7Mpa:24,r28Mpa:35,productId:p.id},users.usta);
 assert.equal(upd.status,200);assert.equal(upd.body.status,'ok');
 const ql=await call('/quality','GET',undefined,users.kuzatuvchi);assert.equal(ql.status,200);assert.equal(ql.body.canEdit,false);
 assert.equal(ql.body.summary.ok,1);assert.equal(ql.body.summary.fail,1);
 assert.equal((await call('/quality/'+t2.body.id+'/void','POST',{reason:'namuna buzilgan'})).status,200);
 assert.equal((await call('/quality')).body.summary.total,1);
 assert.equal((await call('/quality','GET',undefined,users.other)).body.tests.length,0);
 console.log('PASS: kassa va bank (qoldiq, idempotentlik, bekor qilish, arxiv, oy qulfi), foyda va zarar, beton sinovi (huquqlar, holat, zavod ajratilishi)');
} finally {
 server?.close();
 await getPool().end();
 await management.query('DROP SCHEMA '+schema+' CASCADE');
 await management.end();
}
