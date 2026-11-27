// Ta'minotchilar: bir nechta shartnoma, shartnoma bo'yicha qarz, STIR bo'yicha aniqlash, birlashtirish, zaxiradan tiklash.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
const source=process.env.DATABASE_URL||process.env.POSTGRES_URL;
if(!source)throw new Error('DATABASE_URL is required');
const schema='supplier_contracts_test_'+crypto.randomBytes(8).toString('hex');
const management=new pg.Pool({connectionString:source,connectionTimeoutMillis:10000});
await management.query('CREATE SCHEMA '+schema);
const url=new URL(source);url.searchParams.set('options','-c search_path='+schema+',public');process.env.DATABASE_URL=url.toString();process.env.AUTH_SECRET=crypto.randomBytes(32).toString('hex');
const {one,q,getPool,migrate}=await import('../src/db.js');
const {issueToken,hashPassword}=await import('../src/auth.js');
const {supplierSummary}=await import('../src/supplier-accounts.js');
const {default:app}=await import('../src/app.js');
let server;
try{
 await migrate();
 const f=await one("INSERT INTO factories(code,name) VALUES('a','A') RETURNING *");
 const user=await one("INSERT INTO users(username,role,factory_id,password_hash) VALUES('bux','buxgalter',$1,$2) RETURNING *",[f.id,await hashPassword('SupplierTest123!')]);
 const steel=await one("INSERT INTO materials(factory_id,name,unit,stock) VALUES($1,'Armatura','t',true) RETURNING *",[f.id]);
 const wire=await one("INSERT INTO materials(factory_id,name,unit,stock) VALUES($1,'Sim','kg',true) RETURNING *",[f.id]);
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base='http://127.0.0.1:'+server.address().port+'/api';
 const admin=await one("INSERT INTO users(username,role,factory_id,password_hash) VALUES('adm','admin',$1,'x') RETURNING *",[f.id]);
 const call=async(p,method='GET',body,who=user)=>{const res=await fetch(base+p,{method,headers:{Authorization:'Bearer '+issueToken(who),'Content-Type':'application/json','X-Factory':f.id},body:body===undefined?undefined:JSON.stringify(body)});return {status:res.status,body:res.headers.get('content-type')?.includes('application/json')?await res.json():await res.text()};};
 const save=async(p,body)=>{const r=await call(p,'POST',{requestId:crypto.randomUUID(),...body});assert.equal(r.status,200,p+' '+JSON.stringify(r.body));return r.body;};
 const pdf=Buffer.from('%PDF-1.4\nTest\n%%EOF').toString('base64');
 const S='/finance/supplier-settlements';

 // 1) Ta'minotchi STIR bilan; nomning boshqa yozilishi takror yaratmaydi
 const created=await call(S,'POST',{name:'"UZBEK METALL" MCHJ',inn:'301234567'});
 assert.equal(created.status,201,JSON.stringify(created.body));
 const sid=created.body.id;
 assert.equal((await call(S,'POST',{name:'«Uzbek  Metall» MCHJ'})).status,409);
 assert.equal((await call(S,'POST',{name:'Boshqa nom',inn:'301234567'})).status,409);
 assert.equal((await call(S,'POST',{name:'X',inn:'12'})).status,400);

 // 2) Uchta shartnoma; PDF dagi nom boshqacha, lekin STIR bir xil — o'sha ta'minotchiga tushadi
 const contract=(number,date,total,name='UZBEK METALL MChJ')=>save('/finance/contracts',{kind:'purchase',number,date,counterparty:name,inn:'301234567',contentBase64:pdf,name:'S.pdf',originalTotal:total,items:[{name:'Armatura',unit:'t',qty:10,price:total/10,total,materialId:steel.id,factor:1}]});
 const k1=await contract('EKM-1','2026-01-10',10000000);
 const k2=await contract('EKM-2','2026-03-01',20000000);
 const k3=await contract('EKM-3','2026-06-01',5000000,'Uzbek Metall');
 for(const k of [k1,k2,k3])assert.equal(k.supplierId,sid);
 assert.equal((await one('SELECT count(*) AS n FROM suppliers WHERE factory_id=$1',[f.id])).n,1);

 // 3) Fakturalar shartnomaga bog'lanadi; begona shartnoma rad etiladi
 const invoice=(number,date,qty,price,extra={})=>save('/finance/material-invoices',{type:'in',stockMode:'invoiceOnly',date,number,counterparty:'"Uzbek Metall" MChJ',items:[{materialId:steel.id,qty,price,vatRate:0}],...extra});
 const i1=await invoice('F-1','2026-02-01',4,1000000,{contractId:k1.id});
 const i2=await invoice('F-2','2026-03-05',5,2000000,{contractId:k2.id});
 const i3=await invoice('F-3','2026-07-01',1,500000);
 assert.equal(i1.contractId,k1.id);assert.equal(i1.supplierId,sid);assert.equal(i3.contractId,null);
 const stranger=await save('/finance/contracts',{kind:'purchase',number:'B-1',date:'2026-01-01',counterparty:'Boshqa zavod',contentBase64:pdf,name:'S.pdf',originalTotal:100,items:[{name:'Sim',unit:'kg',qty:1,price:100,total:100,materialId:wire.id,factor:1}]});
 assert.notEqual(stranger.supplierId,sid);
 assert.equal((await call('/finance/material-invoices','POST',{requestId:crypto.randomUUID(),type:'in',stockMode:'invoiceOnly',date:'2026-07-02',number:'F-X',counterparty:'"Uzbek Metall" MChJ',contractId:stranger.id,items:[{materialId:steel.id,qty:1,price:1}]})).status,400);

 // 4) To'lovlar: shartnoma bo'yicha avans; shartnomasiz to'lov shartnomali fakturaga — shartnomani oladi
 const ledger=S+'/'+sid;
 const p1=await save(ledger+'/entries',{kind:'payment',date:'2026-02-10',number:'P-1',amount:1500000,contractId:k1.id});
 assert.equal(p1.contractId,k1.id);
 const p2=await save(ledger+'/entries',{kind:'payment',date:'2026-03-10',number:'P-2',amount:6000000,targetId:i2.id});
 assert.equal(p2.contractId,k2.id);
 const p3=await save(ledger+'/entries',{kind:'payment',date:'2026-07-05',number:'P-3',amount:300000});
 assert.equal((await call(ledger+'/entries','POST',{requestId:crypto.randomUUID(),kind:'payment',date:'2026-07-05',number:'P-9',amount:1,contractId:stranger.id})).status,400);

 let d=(await call(ledger)).body;
 const by=id=>d.summary.contracts.find(c=>c.id===id);
 assert.equal(d.summary.total.invoiced,14500000);assert.equal(d.summary.total.paid,7800000);assert.equal(d.summary.total.debt,6700000);
 assert.equal(by(k1.id).invoiced,4000000);assert.equal(by(k1.id).debt,2500000);assert.equal(by(k1.id).paid,1500000);assert.equal(by(k1.id).left,6000000);
 assert.equal(by(k2.id).debt,4000000);assert.equal(by(k2.id).paid,6000000);
 assert.equal(by(k3.id).debt,0);assert.equal(d.summary.unassigned.debt,200000);
 const sumDebt=d.summary.contracts.reduce((s,c)=>s+c.debt,0)+d.summary.unassigned.debt;
 assert.equal(Math.round(sumDebt*100)/100,d.summary.total.debt);
 const listed=(await call(S)).body.find(s=>s.id===sid);
 assert.equal(listed.inn,'301234567');assert.equal(listed.contracts,3);assert.equal(listed.invoiced,14500000);assert.equal(listed.paid,7800000);assert.equal(listed.debt-listed.advance,6700000);

 // 5) Shartnoma to'lovi boshqa shartnoma fakturasiga bog'lanmaydi; umumiy to'lov — bog'lanadi
 assert.equal((await call(ledger+'/allocations','POST',{requestId:crypto.randomUUID(),sourceId:p1.id,targetId:i2.id,amount:100})).status,409);
 assert.equal((await call(ledger+'/allocations','POST',{requestId:crypto.randomUUID(),sourceId:p1.id,targetId:i1.id,amount:1500000})).status,200);
 await save(ledger+'/allocations',{sourceId:p3.id,targetId:i1.id,amount:300000});
 d=(await call(ledger)).body;
 assert.equal(by(k1.id).debt,2200000);assert.equal(by(k1.id).paid,1800000);assert.equal(d.summary.unassigned.debt,500000);assert.equal(d.summary.total.debt,6700000);

 // 6) Shartnomasiz fakturani shartnomaga bog'lash, to'lovni ko'chirish qoidalari
 await save(ledger+'/contract',{kind:'invoice',id:i3.id,contractId:k3.id});
 d=(await call(ledger)).body;assert.equal(by(k3.id).invoiced,500000);assert.equal(d.summary.unassigned.debt,0);
 assert.equal((await call(ledger+'/contract','POST',{kind:'invoice',id:i1.id,contractId:k2.id})).status,409); // P-1 (EKM-1) bog'langan
 assert.equal((await call(ledger+'/contract','POST',{kind:'payment',id:p2.id,contractId:k1.id})).status,409);
 assert.equal((await call(ledger+'/contract','POST',{kind:'invoice',id:i1.id,contractId:stranger.id})).status,400);
 await save(ledger+'/contract',{kind:'invoice',id:i3.id,contractId:null});
 await save(ledger+'/contract',{kind:'invoice',id:i3.id,contractId:k3.id});

 // 7) Pure summary: opening is supplier-wide (shartnomasiz)
 const pure=supplierSummary([{kind:'opening_debt',amount:100,remaining:40},{kind:'invoice',amount:50,remaining:50,contractId:'a'},{kind:'payment',amount:80,remaining:20,contractId:'a'}],[{id:'a',number:'1',originalTotal:70}]);
 assert.equal(pure.total.debt,70);assert.equal(pure.unassigned.debt,40);assert.equal(pure.contracts[0].debt,30);assert.equal(pure.contracts[0].left,20);

 // 8) Ikki xil yozilgan ta'minotchini birlashtirish
 await q("INSERT INTO suppliers(factory_id,name) VALUES($1,'Uzbek Metall Group')",[f.id]);
 const twin=await invoice('F-T','2026-08-01',1,100000,{counterparty:'Uzbek Metall Group'});
 assert.notEqual(twin.supplierId,sid);
 await q("INSERT INTO movements(factory_id,type,date,material_id,qty,supplier) VALUES($1,'in','2026-08-01',$2,1,'Uzbek Metall Group')",[f.id,steel.id]);
 assert.equal((await call(S+'/'+twin.supplierId+'/merge','POST',{targetId:twin.supplierId})).status,400);
 const merged=await save(S+'/'+twin.supplierId+'/merge',{targetId:sid});
 assert.equal(merged.moved.invoices,1);assert.equal(merged.moved.receipts,1);
 assert.equal((await call(S+'/'+twin.supplierId)).status,404);
 d=(await call(ledger)).body;assert.equal(d.summary.total.invoiced,14600000);assert.equal(d.summary.unassigned.invoiced,100000);
 // STIR va nomni tahrirlash
 assert.equal((await call(ledger+'/profile','POST',{name:'Uzbek Metall',inn:'1'})).status,400);
 assert.equal((await save(ledger+'/profile',{name:'"Uzbek Metall" MChJ',inn:'301234567'})).name,'"Uzbek Metall" MChJ');

 // 9) Zaxiradan tiklash: fakturalar shartnomalardan oldin yoziladi (FK kechiktirilgan)
 const backup=await call('/backup','GET',undefined,admin);assert.equal(backup.status,200);
 assert.ok(backup.body.data.material_invoices.some(i=>i.contract_id===k1.id));
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'supplier-contracts-restore-'));
 try{
  const file=path.join(dir,'backup.json');await fs.writeFile(file,JSON.stringify(backup.body));
  await promisify(execFile)(process.execPath,[fileURLToPath(new URL('../scripts/restore.js',import.meta.url)),file,'--yes'],{cwd:dir,env:process.env,windowsHide:true,timeout:60000});
  assert.equal((await one('SELECT contract_id FROM material_invoices WHERE id=$1',[i1.id])).contractId,k1.id);
  d=(await call(ledger)).body;assert.equal(d.summary.total.debt,6800000);assert.equal(by(k1.id).debt,2200000);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
 console.log('PASS: ta’minotchi STIR/nom bo‘yicha, 3 ta shartnoma, shartnoma bo‘yicha qarz va to‘lov, bog‘lash qoidalari, birlashtirish, zaxiradan tiklash');
}finally{if(server)await new Promise(r=>server.close(r));await getPool().end();await management.query('DROP SCHEMA '+schema+' CASCADE');await management.end();}
