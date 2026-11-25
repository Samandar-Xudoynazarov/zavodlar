// Moliya: sotuv fakturasida QQS, ortiqcha to'lov taqiqi, mijoz bo'yicha qarz, boshlang'ich qoldiq, akt sverka, oyni yopish
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';
const source=process.env.DATABASE_URL||process.env.POSTGRES_URL;
if(!source)throw new Error('DATABASE_URL is required');
const schema='ledger_test_'+crypto.randomBytes(8).toString('hex');
const management=new pg.Pool({connectionString:source,connectionTimeoutMillis:10000});
await management.query('CREATE SCHEMA '+schema);
const url=new URL(source);url.searchParams.set('options','-c search_path='+schema+',public');process.env.DATABASE_URL=url.toString();process.env.AUTH_SECRET=crypto.randomBytes(32).toString('hex');
const {one,getPool,migrate}=await import('../src/db.js');
const {issueToken,hashPassword}=await import('../src/auth.js');
const {default:app,BACKUP_TABLES}=await import('../src/app.js');
const {assertMonthOpen}=await import('../src/finance-period-lock.js');
const {customerLedger,customerStatement}=await import('../src/finance-customers.js');
const {vatLine}=await import('../src/routes/finance.js');
let server;
try {
 await migrate();
 assert.equal(typeof assertMonthOpen,'function');
 for(const t of ['finance_period_locks','finance_customer_openings'])assert.ok(BACKUP_TABLES.includes(t));
 // QQS hisobi (sof funksiya)
 assert.deepEqual(vatLine(2,1000,12),{vatRate:12,priceIncludesVat:false,net:2000,vat:240,amount:2240});
 assert.deepEqual(vatLine(1,1120,12,true),{vatRate:12,priceIncludesVat:true,net:1000,vat:120,amount:1120});
 const f=await one("INSERT INTO factories(code,name) VALUES('ledger-a','Ledger A') RETURNING *");
 const p1=await one("INSERT INTO products(factory_id,code) VALUES($1,'L1') RETURNING *",[f.id]),p2=await one("INSERT INTO products(factory_id,code) VALUES($1,'L2') RETURNING *",[f.id]);
 const hash=await hashPassword('LedgerTest123!');const users={};
 for(const role of ['admin','rahbar','buxgalter','pto'])users[role]=await one('INSERT INTO users(username,role,factory_id,password_hash) VALUES($1,$1,$2,$3) RETURNING *',[role,f.id,hash]);
 const order=await one("INSERT INTO orders(factory_id,no,customer,date,status,items) VALUES($1,1,'Mijoz A','2026-09-01','jarayonda',$2) RETURNING *",[f.id,JSON.stringify([{productId:p1.id,qty:10,price:1000,shippedBefore:6},{productId:p2.id,qty:5,price:0,shippedBefore:2}])]);
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api';
 const call=async(path,method='GET',body,user=users.admin)=>{const r=await fetch(base+path,{method,headers:{Authorization:'Bearer '+issueToken(user),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const ct=r.headers.get('content-type');return {status:r.status,body:ct?.includes('application/json')?await r.json():await r.text()};};
 const pdf=Buffer.from('%PDF-1.4\nledger\n%%EOF').toString('base64');
 const O='/finance/orders/'+order.id;
 assert.equal((await call('/finance/customers','GET',undefined,users.pto)).status,403);
 // narx 0 bo'lsa faktura yozilmaydi (tannarx olinmaydi)
 assert.equal((await call(O+'/invoices','POST',{requestId:crypto.randomUUID(),number:'F-0',date:'2026-10-01',name:'F.pdf',contentBase64:pdf,items:[{productId:p2.id,qty:1,price:0}]})).status,400);
 // QQS 12%: QQSsiz 2000 + QQS 240 = 2240
 const inv1=await call(O+'/invoices','POST',{requestId:crypto.randomUUID(),number:'F-1',date:'2026-10-01',dueDate:'2026-10-10',name:'F.pdf',contentBase64:pdf,vatRate:12,items:[{productId:p1.id,qty:2,price:1000}]});
 assert.equal(inv1.status,200,JSON.stringify(inv1.body));assert.equal(inv1.body.net,2000);assert.equal(inv1.body.vat,240);assert.equal(inv1.body.amount,2240);assert.equal(inv1.body.dueDate,'2026-10-10');
 assert.equal((await call(O+'/invoices','POST',{requestId:crypto.randomUUID(),number:'F-x',date:'2026-10-01',dueDate:'2026-09-01',name:'F.pdf',contentBase64:pdf,items:[{productId:p1.id,qty:1,price:1000}]})).status,400,'muddat sanadan oldin');
 // narx QQS bilan: 1120 = 1000 + 120
 const inv2=await call(O+'/invoices','POST',{requestId:crypto.randomUUID(),number:'F-2',date:'2026-10-02',dueDate:'2026-10-05',name:'F.pdf',contentBase64:pdf,items:[{productId:p1.id,qty:1,price:1120,vatRate:12,priceIncludesVat:true}]});
 assert.equal(inv2.status,200,JSON.stringify(inv2.body));assert.equal(inv2.body.net,1000);assert.equal(inv2.body.vat,120);
 // to'lov faktura qoldig'idan oshmaydi
 const pay=(amount,extra={})=>call(O+'/receipts','POST',{requestId:crypto.randomUUID(),invoiceId:inv1.body.id,date:'2026-10-08',amount,method:'bank',docNumber:'PP-1',...extra});
 const over=await pay(3000);assert.equal(over.status,400);assert.match(over.body.error,/qoldig/);
 const ok=await pay(2240);assert.equal(ok.status,200,JSON.stringify(ok.body));assert.equal(ok.body.method,'bank');assert.equal(ok.body.docNumber,'PP-1');assert.equal(ok.body.customer,'Mijoz A');
 assert.equal((await pay(1)).status,400,'to‘liq to‘langan');
 assert.equal((await pay(10,{method:'chek'})).status,400);
 // mijoz bo'yicha: qarz = 2240 + 1120 − 2240 = 1120, F-2 muddati o'tgan
 let cust=(await call('/finance/customers')).body.customers.find(c=>c.name==='Mijoz A');
 assert.equal(cust.debt,1120);assert.equal(cust.overdue,1120);assert.equal(cust.status,'overdue');assert.equal(cust.vat,360);assert.equal(cust.unpricedQty,2);
 // boshlang'ich qoldiq (2025 dan qolgan qarz)
 const opening={requestId:crypto.randomUUID(),customer:'  mijoz a ',inn:'200111222',date:'2026-01-01',kind:'debt',amount:500};
 assert.equal((await call('/finance/customers/openings','POST',opening)).status,200);
 assert.equal((await call('/finance/customers/openings','POST',{...opening,requestId:crypto.randomUUID()})).status,409,'bitta mijozga bitta boshlang‘ich qoldiq');
 cust=(await call('/finance/customers')).body.customers.find(c=>c.name==='Mijoz A');assert.equal(cust.debt,1620);assert.equal(cust.inn,'200111222');
 // buyurtmasiz avans va faktura orqali to'lov (mijoz bo'yicha)
 assert.equal((await call('/finance/customers/receipts','POST',{requestId:crypto.randomUUID(),customer:'Mijoz A',date:'2026-10-20',amount:120,method:'naqd'})).status,200);
 assert.equal((await call('/finance/customers/receipts','POST',{requestId:crypto.randomUUID(),invoiceId:inv2.body.id,date:'2026-10-21',amount:2000})).status,400);
 assert.equal((await call('/finance/customers/receipts','POST',{requestId:crypto.randomUUID(),date:'2026-10-21',amount:10})).status,400,'mijozsiz to‘lov yo‘q');
 // akt sverka: oktyabr
 const st=(await call('/finance/customers/statement?name=MIJOZ%20A&from=2026-10-01&to=2026-10-31')).body;
 assert.equal(st.initial,500);assert.equal(st.debit,3360);assert.equal(st.credit,2360);assert.equal(st.closing,1500);
 assert.equal((await call('/finance/customers/statement?name=Yo%E2%80%98q&from=2026-10-01&to=2026-10-31')).status,404);
 // to'lov muddati
 assert.equal((await call('/finance/customers/invoices/'+inv2.body.id+'/due-date','POST',{dueDate:'2026-12-31'})).status,200);
 cust=(await call('/finance/customers')).body.customers.find(c=>c.name==='Mijoz A');assert.equal(cust.overdue,0);assert.equal(cust.nextDue,'2026-12-31');
 // oyni yopish
 const supplier=await call('/finance/supplier-settlements','POST',{name:'Ta’minotchi L'});assert.equal(supplier.status,201);
 assert.equal((await call('/finance/periods/2099-01/lock','POST',{})).status,400,'kelajak oy');
 const check=await call('/finance/periods/2026-10/checklist');assert.equal(check.status,200);
 assert.equal(check.body.checks.find(c=>c.key==='invoices').status,'bad','jo‘natilgan 6+2, faktura 3');assert.equal(check.body.checks.find(c=>c.key==='prices').status,'ok');
 assert.equal((await call('/finance/periods/2026-10/lock','POST',{note:'Oktyabr hisoboti topshirildi'},users.buxgalter)).status,200);
 assert.equal((await call('/finance/periods/2026-10/lock','POST',{})).status,409);
 assert.equal((await call('/finance/customers/receipts','POST',{requestId:crypto.randomUUID(),customer:'Mijoz A',date:'2026-10-15',amount:10})).status,409);
 assert.equal((await call(O+'/invoices/'+inv2.body.id+'/void','POST',{reason:'xato'})).status,409);
 assert.equal((await call(O+'/receipts/'+ok.body.id+'/void','POST',{reason:'xato'})).status,409);
 assert.equal((await call(O+'/invoices','POST',{requestId:crypto.randomUUID(),number:'F-3',date:'2026-10-30',name:'F.pdf',contentBase64:pdf,items:[{productId:p1.id,qty:1,price:1000}]})).status,409);
 assert.equal((await call('/finance/supplier-settlements/'+supplier.body.id+'/entries','POST',{requestId:crypto.randomUUID(),kind:'payment',date:'2026-10-12',amount:100,number:'P-1'})).status,409);
 assert.equal((await call('/finance/customers/openings','POST',{requestId:crypto.randomUUID(),customer:'Mijoz B',date:'2026-10-01',kind:'advance',amount:10})).status,409);
 // noyabr ochiq
 assert.equal((await call('/finance/customers/receipts','POST',{requestId:crypto.randomUUID(),customer:'Mijoz A',date:'2026-11-01',amount:10,method:'karta'})).status,200);
 // qayta ochish: faqat admin/rahbar va sabab bilan
 assert.equal((await call('/finance/periods/2026-10/reopen','POST',{reason:'Xato tuzatiladi'},users.buxgalter)).status,403);
 assert.equal((await call('/finance/periods/2026-10/reopen','POST',{reason:''},users.rahbar)).status,400);
 assert.equal((await call('/finance/periods/2026-10/reopen','POST',{reason:'Faktura F-2 xato'},users.rahbar)).status,200);
 assert.equal((await call('/finance/customers/receipts','POST',{requestId:crypto.randomUUID(),customer:'Mijoz A',date:'2026-10-15',amount:10})).status,200);
 const locks=(await call('/finance/periods')).body.locks;assert.equal(locks[0].month,'2026-10');assert.equal(locks[0].reopenReason,'Faktura F-2 xato');
 // ijtimoiy soliq foizi: oy ochilmagan bo'lsa — 409
 assert.equal((await call('/finance/payroll/2026-10/social-tax','PUT',{rate:12})).status,409);
 // sof funksiya: mijoz nomi bo'yicha guruhlash
 const L=customerLedger({today:'2026-11-25',orders:[{id:'a',no:1,customer:'X',items:[{productId:'p',qty:1,price:10}]},{id:'b',no:2,customer:' x ',items:[]}],invoices:[{id:'i',orderId:'b',number:'1',date:'2026-01-01',amount:10,net:10,vat:0,items:[]}],receipts:[{id:'r',orderId:null,customer:'X',date:'2026-01-02',amount:15}]});
 assert.equal(L.length,1);assert.equal(L[0].debt,-5);assert.equal(L[0].status,'advance');assert.equal(customerStatement(L[0],'2026-01-01','2026-01-31').closing,-5);
 console.log('PASS: QQS, narxsiz faktura, ortiqcha to‘lov, mijoz bo‘yicha qarz, boshlang‘ich qoldiq, akt sverka, to‘lov muddati, oyni yopish va qayta ochish');
} finally {if(server)await new Promise(r=>server.close(r));await getPool().end();await management.query('DROP SCHEMA '+schema+' CASCADE');await management.end();}
