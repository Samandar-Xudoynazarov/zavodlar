// Eski jo'natmalar (legacy_shipments) va oy bo'yicha hisob-kitob testi
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';
const source=process.env.DATABASE_URL||process.env.POSTGRES_URL;
if(!source)throw new Error('DATABASE_URL is required');
const schema='archive_test_'+crypto.randomBytes(8).toString('hex');
const management=new pg.Pool({connectionString:source,connectionTimeoutMillis:10000});
await management.query('CREATE SCHEMA '+schema);
const url=new URL(source);url.searchParams.set('options','-c search_path='+schema+',public');process.env.DATABASE_URL=url.toString();process.env.AUTH_SECRET=crypto.randomBytes(32).toString('hex');
const {one,getPool,migrate}=await import('../src/db.js');
const {issueToken,hashPassword}=await import('../src/auth.js');
const {default:app,BACKUP_TABLES}=await import('../src/app.js');
const {monthlySummary}=await import('../src/routes/sales-archive.js');
let server;
try {
 await migrate();
 assert.ok(BACKUP_TABLES.includes('legacy_shipments'));
 const f=await one("INSERT INTO factories(code,name) VALUES('arch-a','Arch A') RETURNING *"),other=await one("INSERT INTO factories(code,name) VALUES('arch-b','Arch B') RETURNING *");
 const p1=await one("INSERT INTO products(factory_id,code) VALUES($1,'P1') RETURNING *",[f.id]),p2=await one("INSERT INTO products(factory_id,code) VALUES($1,'P2') RETURNING *",[f.id]);
 const hash=await hashPassword('ArchiveTest123!');const users={};
 for(const role of ['admin','buxgalter','pto'])users[role]=await one('INSERT INTO users(username,role,factory_id,password_hash) VALUES($1,$1,$2,$3) RETURNING *',[role,f.id,hash]);
 const otherAdmin=await one("INSERT INTO users(username,role,factory_id,password_hash) VALUES('other','admin',$1,$2) RETURNING *",[other.id,hash]);
 const order=await one("INSERT INTO orders(factory_id,no,customer,date,status,items) VALUES($1,1,'Eski mijoz','2025-03-01','topshirildi',$2) RETURNING *",[f.id,JSON.stringify([{productId:p1.id,qty:10,price:1000,shippedBefore:3},{productId:p2.id,qty:5,price:0,shippedBefore:0}])]);
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api';
 const call=async(path,method='GET',body,user=users.admin)=>{const r=await fetch(base+path,{method,headers:{Authorization:'Bearer '+issueToken(user),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const ct=r.headers.get('content-type');return {status:r.status,body:ct?.includes('application/json')?await r.json():await r.text()};};
 const pdf=Buffer.from('%PDF-1.4\narchive\n%%EOF').toString('base64');
 const P='/finance/archive/orders/'+order.id+'/legacy-shipments';
 const body={requestId:crypto.randomUUID(),productId:p1.id,qty:4,date:'2025-03-15',dispatchNo:'N-15',vehicle:'01 A 111 AA',receiver:'Obyekt',name:'N15.pdf',contentBase64:pdf};
 // huquqlar
 assert.equal((await call(P,'POST',body,users.pto)).status,403);
 // sana va son tekshiruvlari
 assert.equal((await call(P,'POST',{...body,requestId:crypto.randomUUID(),date:'2024-12-31'})).status,400);
 assert.equal((await call(P,'POST',{...body,requestId:crypto.randomUUID(),date:'2099-01-01'})).status,400);
 assert.equal((await call(P,'POST',{...body,requestId:crypto.randomUUID(),qty:8})).status,400,'3 oldin + 8 > 10');
 assert.equal((await call(P,'POST',{...body,requestId:crypto.randomUUID(),contentBase64:'aGVsbG8='})).status,400,'PDF emas');
 assert.equal((await call(P,'POST',{...body,requestId:crypto.randomUUID(),productId:crypto.randomUUID()})).status,400);
 const created=await call(P,'POST',body,users.buxgalter);assert.equal(created.status,201,JSON.stringify(created.body));
 assert.equal((await call(P,'POST',body)).body.id,created.body.id,'takroriy so‘rov bitta yozuv');
 // PDFsiz kiritib, keyin biriktirish
 const noPdf=await call(P,'POST',{requestId:crypto.randomUUID(),productId:p2.id,qty:2,date:'2025-04-02',dispatchNo:'N-20'});assert.equal(noPdf.status,201);assert.equal(noPdf.body.sizeBytes,0);
 assert.equal((await call('/finance/archive/legacy-shipments/'+noPdf.body.id+'/pdf')).status,404);
 assert.equal((await call('/finance/archive/legacy-shipments/'+noPdf.body.id+'/pdf','POST',{name:'N20.pdf',contentBase64:pdf})).status,200);
 assert.equal((await call('/finance/archive/legacy-shipments/'+noPdf.body.id+'/pdf','POST',{name:'N20.pdf',contentBase64:pdf})).status,409,'ikkinchi PDF yo‘q');
 assert.equal((await call('/finance/archive/legacy-shipments/'+created.body.id+'/pdf')).body,Buffer.from(pdf,'base64').toString());
 assert.equal((await call('/finance/archive/legacy-shipments/'+created.body.id+'/pdf','GET',undefined,otherAdmin)).status,404);
 assert.equal((await call(P,'GET',undefined,otherAdmin)).status,400);
 // buyurtma soni: 3 oldin + 4 eski = 7
 let orders=(await call('/orders')).body;let o=orders.find(x=>x.id===order.id);
 assert.equal(o.items[0].shipped,7);assert.equal(o.items[0].left,3);assert.equal(o.items[1].shipped,2);
 const hist=(await call('/orders/'+order.id+'/products/'+p1.id+'/shipments')).body;assert.equal(hist.legacy.length,1);assert.equal(hist.legacy[0].dispatchNo,'N-15');
 // ombor/kunlik hisobotga tegmaydi
 assert.equal((await one('SELECT count(*) AS n FROM days')).n,0);
 // faktura eski jo'natmaga yoziladi, keyin jo'natmani bekor qilib bo'lmaydi
 const inv=await call('/finance/orders/'+order.id+'/invoices','POST',{requestId:crypto.randomUUID(),number:'F-1',date:'2025-03-20',name:'F.pdf',contentBase64:pdf,items:[{productId:p1.id,qty:7,price:1000}]});assert.equal(inv.status,200,JSON.stringify(inv.body));
 assert.equal((await call('/finance/archive/legacy-shipments/'+created.body.id+'/void','POST',{reason:'xato'})).status,409);
 assert.equal((await call('/finance/orders/'+order.id+'/receipts','POST',{requestId:crypto.randomUUID(),date:'2025-05-10',amount:5000})).status,200);
 // buyurtmani o'chirish / mahsulotni olib tashlash bloklanadi
 assert.equal((await call('/orders/'+order.id,'PUT',{items:[{productId:p1.id,qty:10,price:1000,shippedBefore:3}]})).status,400);
 // oy bo'yicha hisob-kitob
 const m=(await call('/finance/archive/monthly?from=2025-03&to=2025-05')).body;
 const c=m.customers.find(x=>x.customer==='Eski mijoz');assert.ok(c);
 const mar=c.months.find(x=>x.month==='2025-03'),apr=c.months.find(x=>x.month==='2025-04'),may=c.months.find(x=>x.month==='2025-05');
 assert.equal(mar.shipped,4000);assert.equal(mar.invoiced,7000);assert.equal(mar.debt,7000);
 assert.equal(apr.unpricedQty,2);assert.equal(may.paid,5000);assert.equal(may.debt,2000);assert.equal(m.undatedShippedBefore,3);
 // bekor qilish (fakturasiz yozuv)
 assert.equal((await call('/finance/archive/legacy-shipments/'+noPdf.body.id+'/void','POST',{reason:''})).status,400);
 assert.equal((await call('/finance/archive/legacy-shipments/'+noPdf.body.id+'/void','POST',{reason:'Xato kiritildi'})).status,200);
 o=(await call('/orders')).body.find(x=>x.id===order.id);assert.equal(o.items[1].shipped,0);
 assert.equal((await call('/finance/archive/legacy-shipments/'+noPdf.body.id+'/void','POST',{reason:'yana'})).status,409);
 assert.equal((await call('/orders/'+order.id,'DELETE')).status,409);
 // mijozning boshlang'ich qoldig'i (finance_customer_openings) oylik hisobotga qo'shiladi
 const op=await call('/finance/customers/openings','POST',{requestId:crypto.randomUUID(),customer:' eski  MIJOZ ',date:'2025-02-01',kind:'debt',amount:1500});assert.equal(op.status,200,JSON.stringify(op.body));
 const m2=(await call('/finance/archive/monthly?from=2025-02&to=2025-05')).body.customers.find(x=>x.customer==='Eski mijoz');
 assert.equal(m2.months.find(x=>x.month==='2025-02').opening,1500);assert.equal(m2.months.find(x=>x.month==='2025-05').debt,3500,'1500 + 7000 − 5000');
 // buyurtmaga bog'lanmagan (mijoz bo'yicha) to'lov ham qarzni kamaytiradi
 const free=await call('/finance/customers/receipts','POST',{requestId:crypto.randomUUID(),customer:'Eski mijoz',date:'2025-05-20',amount:500,method:'naqd'});assert.equal(free.status,200,JSON.stringify(free.body));
 assert.equal((await call('/finance/archive/monthly?from=2025-05&to=2025-05')).body.customers.find(x=>x.customer==='Eski mijoz').months[0].debt,3000);
 // yopilgan oyga eski jo'natma kiritib bo'lmaydi (finance-period-lock.js)
 assert.equal((await call('/finance/periods/2025-04/lock','POST',{})).status,200);
 assert.equal((await call(P,'POST',{requestId:crypto.randomUUID(),productId:p1.id,qty:1,date:'2025-04-10'})).status,409);
 assert.equal((await call('/finance/periods/2025-04/reopen','POST',{reason:'Test uchun qayta ochildi'})).status,200);
 // sof funksiya: oraliqdan oldingi summa qarzga kiradi
 const s=monthlySummary({orders:[{id:'o',customer:'X',items:[{productId:'p',qty:9,price:10}]}],shipments:[{orderId:'o',productId:'p',qty:2,date:'2025-01-05'}],invoices:[{orderId:'o',amount:20,date:'2025-01-06'}],receipts:[{orderId:'o',amount:5,date:'2025-02-01'}],from:'2025-02',to:'2025-02'});
 assert.equal(s[0].months.length,1);assert.equal(s[0].months[0].debt,15);
 const s2=monthlySummary({orders:[{id:'o',customer:'X',items:[]}],shipments:[],invoices:[],receipts:[{orderId:null,customer:' x ',amount:30,date:'2025-03-01'}],openings:[{customer:'x',kind:'advance',amount:10,date:'2025-01-01'}],from:'2025-01',to:'2025-03'});
 assert.equal(s2.length,1);assert.equal(s2[0].months[0].opening,-10);assert.equal(s2[0].months.at(-1).debt,-40,'avans 10 + to‘lov 30');
 console.log('PASS: eski jo‘natmalar, PDF накладная, buyurtma soni, faktura bog‘liqligi, oy bo‘yicha hisob-kitob, boshlang‘ich qoldiq, oy qulfi');
} finally {if(server)await new Promise(r=>server.close(r));await getPool().end();await management.query('DROP SCHEMA '+schema+' CASCADE');await management.end();}
