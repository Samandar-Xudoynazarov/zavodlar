// Kuzatuvchi pulni ko'rmaydi; bosh panel (puls) va Telegram ertalabki hisoboti
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';
const source=process.env.DATABASE_URL||process.env.POSTGRES_URL;
if(!source)throw new Error('DATABASE_URL is required');
const schema='pulse_test_'+crypto.randomBytes(8).toString('hex');
const management=new pg.Pool({connectionString:source,connectionTimeoutMillis:10000});
await management.query('CREATE SCHEMA '+schema);
const url=new URL(source);url.searchParams.set('options','-c search_path='+schema+',public');process.env.DATABASE_URL=url.toString();process.env.AUTH_SECRET=crypto.randomBytes(32).toString('hex');
process.env.TELEGRAM_BOT_TOKEN='test-only-token';process.env.TELEGRAM_WEBHOOK_SECRET='test_secret_1234567890123456789012';process.env.TELEGRAM_BOT_USERNAME='test_bot';
const sends=[];const nativeFetch=globalThis.fetch;
globalThis.fetch=async(input,options={})=>{const u=new URL(String(input));if(u.hostname!=='api.telegram.org')return nativeFetch(input,options);sends.push(JSON.parse(options.body));return Response.json({ok:true,result:{message_id:1}});};
const {one,q,getPool,migrate}=await import('../src/db.js');
const {issueToken,hashPassword}=await import('../src/auth.js');
const {default:app}=await import('../src/app.js');
const {stripMoney}=await import('../src/no-money.js');
const {sendDailyDigests,observerText,telegramCommandReply}=await import('../src/digest.js');
const {todayTashkent}=await import('../src/common.js');
const {addDays}=await import('../src/pulse.js');
let server;
const MONEY=/"(price|amount|cost|receivable|advance|costSchemes|prodRows|otherRows|kirimSum|money|revenue|profit|excelPrice|salary)"/;
try{
 await migrate();
 assert.deepEqual(stripMoney({a:1,price:5,list:[{qty:2,price:3,calc:{items:[{norm:1}],prodRows:[1],margin:20}}]}),{a:1,list:[{qty:2,calc:{items:[{norm:1}]}}]});
 const today=todayTashkent();
 const f1=await one("INSERT INTO factories(code,name) VALUES('p-a','1-zavod') RETURNING *");
 const f2=await one("INSERT INTO factories(code,name,kind) VALUES('p-b','2-zavod','metall') RETURNING *");
 const hash=await hashPassword('PulseTest123!');
 const mk=(u,role,fid)=>one('INSERT INTO users(username,role,factory_id,password_hash) VALUES($1,$2,$3,$4) RETURNING *',[u,role,fid,hash]);
 const obs=await mk('kuz','kuzatuvchi',null),kur=await mk('kur','kurator',null),dir=await mk('dir','rahbar',f1.id),dir2=await mk('dir2','rahbar',f2.id),pto=await mk('pto','pto',f1.id);
 for(const f of [f1,f2]){
  const m=await one("INSERT INTO materials(factory_id,name,unit,price,min_qty) VALUES($1,'Sement','t',1200000,50) RETURNING *",[f.id]);
  const p=await one("INSERT INTO products(factory_id,code,name,excel_price) VALUES($1,'FBS-1','Blok',900000) RETURNING *",[f.id]);
  await q("INSERT INTO movements(factory_id,type,date,material_id,qty,price) VALUES($1,'in',$2,$3,40,1200000)",[f.id,addDays(today,-20),m.id]);
  for(let i=1;i<=10;i++){const d=addDays(today,-i);await q("INSERT INTO days(factory_id,date,production,materials) VALUES($1,$2,$3,$4)",[f.id,d,JSON.stringify([{productId:p.id,plan:100,fact:f===f1?98:60,brak:f===f1?1:6}]),JSON.stringify([{materialId:m.id,sarf:3,kirim:0}])]);}
  await q("INSERT INTO orders(factory_id,no,customer,items,date,deadline) VALUES($1,1,'Mijoz',$2,$3,$4)",[f.id,JSON.stringify([{productId:p.id,qty:5000,price:950000}]),addDays(today,-30),addDays(today,3)]);
 }
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api';
 const call=async(path,user,fid=f1.id,method='GET',body)=>{const r=await nativeFetch(base+path,{method,headers:{Authorization:'Bearer '+issueToken(user),'X-Factory':fid,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const ct=r.headers.get('content-type')||'';return {status:r.status,text:ct.includes('json')?JSON.stringify(await r.clone().json()):'',body:ct.includes('json')?await r.json():null};};

 // 1) kuzatuvchi va kurator: pul yo'q
 for(const u of [obs,kur]){
  for(const p of ['/materials','/products','/orders','/overview','/settings','/stock','/finished','/dashboard','/movements','/inventories','/vehicles/report','/plan','/days?from='+addDays(today,-5)+'&to='+today,'/pulse','/pulse/all']){
   const r=await call(p,u);assert.ok(r.status<500,p+' '+r.status);if(r.status===200)assert.ok(!MONEY.test(r.text),u.role+' '+p+' pul ko‘rindi: '+r.text.match(MONEY)?.[0]);
  }
  for(const p of ['/finance/orders','/finance/profit','/finance/cash','/suppliers','/acct-reports/2026-01','/reconciliation','/finance/material-invoices'])assert.equal((await call(p,u)).status,403,p);
 }
 // direktor pulni ko'radi
 const mats=await call('/materials',dir);assert.equal(mats.body[0].price,1200000);
 const ord=await call('/orders',dir);assert.ok(/"price"/.test(ord.text));

 // 2) puls
 const all=await call('/pulse/all',obs);assert.equal(all.status,200);
 assert.equal(all.body.factories.length,2);assert.equal(all.body.ranking[0],f1.id,'1-zavod oldinda');
 const p2=all.body.factories.find(x=>x.factory.id===f2.id);
 assert.ok(p2.month.planPct<80,'2-zavod rejadan orqada');assert.equal(p2.status,'red');
 assert.ok(p2.signals.some(s=>s.kind==='brak'),'brak signali');assert.ok(p2.signals.some(s=>s.kind==='stock'),'ombor signali');
 assert.ok(all.body.headline.startsWith('2-zavod'),all.body.headline);
 assert.equal(p2.trend.length,25);
 assert.equal((await call('/pulse/all',dir)).status,403);
 const mine=await call('/pulse',dir);assert.equal(mine.status,200);assert.equal(mine.body.canMoney,true);assert.ok(mine.body.money);assert.equal(typeof mine.body.money.receivable,'number');
 const ptoP=await call('/pulse',pto);assert.equal(ptoP.body.canMoney,false);assert.equal(ptoP.body.money,undefined);
 const obsP=await call('/pulse',obs,f2.id);assert.equal(obsP.body.factory.id,f2.id);assert.equal(obsP.body.money,undefined);

 // 3) Telegram: direktor ulanadi, kurator va pto ulanmaydi
 assert.equal((await call('/notifications/telegram/link',dir,f1.id,'POST',{})).status,200);
 assert.equal((await call('/notifications/telegram/link',pto,f1.id,'POST',{})).status,403);
 assert.equal((await call('/notifications/telegram/link',kur,f1.id,'POST',{})).status,403);
 await q("INSERT INTO telegram_subscriptions(user_id,chat_id) VALUES($1,'111'),($2,'222'),($3,'333')",[obs.id,dir.id,pto.id]);
 const r1=await sendDailyDigests();assert.equal(r1.sent,2,JSON.stringify(r1));
 const toObs=sends.find(s=>s.chat_id==='111').text,toDir=sends.find(s=>s.chat_id==='222').text;
 assert.ok(!/mln|so.m|tushum|foyda|qarz/i.test(toObs),'kuzatuvchi xabarida pul: '+toObs);
 assert.ok(/2-zavod/.test(toObs)&&/1-zavod/.test(toObs));
 assert.ok(/tushumi/.test(toDir)&&/mln/.test(toDir)&&!/2-zavod/.test(toDir),toDir);
 assert.equal((await sendDailyDigests()).sent,0,'kuniga bir marta');
 const reply=await telegramCommandReply({message:{chat:{id:111,type:'private'},from:{id:111,is_bot:false},text:'/hisobot'}});assert.ok(/Ertalabki hisobot/.test(reply));
 assert.ok(/ulash/.test(await telegramCommandReply({message:{chat:{id:999,type:'private'},from:{id:999,is_bot:false},text:'/hisobot'}})));
 assert.equal(await telegramCommandReply({message:{chat:{id:111,type:'private'},from:{id:111,is_bot:false},text:'salom'}}),null);
 // webhook orqali buyruq
 const wh=await nativeFetch(base+'/telegram/webhook',{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Bot-Api-Secret-Token':process.env.TELEGRAM_WEBHOOK_SECRET},body:JSON.stringify({update_id:5,message:{chat:{id:222,type:'private'},from:{id:222,is_bot:false},text:'/hisobot'}})});
 const whb=await wh.json();assert.equal(whb.method,'sendMessage');assert.ok(/1-zavod/.test(whb.text));
 console.log(observerText(all.body).split('\n').slice(0,8).join('\n'));
 console.log('PASS: kuzatuvchi va kurator pulni ko‘rmaydi (server javoblari va yopiq bo‘limlar), direktor ko‘radi; zavod pulsi, signallar, reyting; Telegram ertalabki hisobot (rolga qarab, kuniga bir marta), /hisobot buyrug‘i');
}finally{server?.close();await getPool().end();await management.query('DROP SCHEMA '+schema+' CASCADE');await management.end();}
