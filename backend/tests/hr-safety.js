// Kadrlar xavfsizligi: o'chirilgan xodim tarixi saqlanadi, tasdiqlangan oyni qayta ochish, kadrlar uchun pulsiz tarix
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';
const source=process.env.DATABASE_URL||process.env.POSTGRES_URL,schema=`hrsafe_${crypto.randomBytes(8).toString('hex')}`;
const management=new pg.Pool({connectionString:source});await management.query(`CREATE SCHEMA ${schema}`);
const url=new URL(source);url.searchParams.set('options',`-c search_path=${schema},public`);process.env.DATABASE_URL=url.toString();process.env.AUTH_SECRET=crypto.randomBytes(32).toString('hex');
const {one,migrate,getPool}=await import('../src/db.js'),{issueToken,hashPassword}=await import('../src/auth.js'),{default:app}=await import('../src/app.js');let server;
try{
 await migrate();const f=await one("INSERT INTO factories(code,name) VALUES('safe','Sinov') RETURNING *"),users={},hash=await hashPassword('Test123!');
 for(const role of ['admin','rahbar','kadrlar','buxgalter','usta','kuzatuvchi'])users[role]=await one('INSERT INTO users(username,role,factory_id,password_hash) VALUES($1,$2,$3,$4) RETURNING *',[role,role,f.id,hash]);
 users.hq=await one("INSERT INTO users(username,role,password_hash) VALUES('bosh_admin','admin',$1) RETURNING *",[hash]);
 server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}/api`;
 async function call(p,method='GET',body,user=users.kadrlar){const r=await fetch(base+p,{method,headers:{Authorization:`Bearer ${issueToken(user)}`,'Content-Type':'application/json','X-Factory':f.id},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json().catch(()=>null)};}
 async function ok(p,m,b,u){const r=await call(p,m,b,u);assert.equal(r.status,200,JSON.stringify(r));return r.body;}
 // 1) o'chirilgan xodimning tarixi saqlanadi
 const gone=await ok('/hr/employees','POST',{code:'9',name:'Xato Kiritilgan',hireDate:'2026-01-05'});
 for(const role of ['kadrlar','admin','rahbar'])assert.equal((await call('/hr/employees/'+gone.id,'DELETE',{version:gone.version,confirmName:'Xato Kiritilgan'},users[role])).status,403,role+' butunlay o‘chira olmaydi');
 await ok('/hr/employees/'+gone.id,'DELETE',{version:gone.version,confirmName:'Xato Kiritilgan'},users.hq);
 const after=await ok('/hr/events',undefined,undefined,users.rahbar);
 assert.ok(after.some(e=>e.entityId===gone.id&&e.action==='employee.create'),'yaratish yozuvi saqlanishi kerak');
 assert.ok(after.some(e=>e.entityId===gone.id&&e.action==='employee.delete'));
 // 2) tasdiqlangan oyni qayta ochish
 const e=await ok('/hr/employees','POST',{code:'1',name:'Ishchi Bir',hireDate:'2026-01-01'});
 await ok('/hr/rates/'+e.id,'POST',{effectiveDate:'2026-01-01',salary:1680000,coefficient:0},users.buxgalter);
 let m=await ok('/hr/months','POST',{month:'2026-01',normHours:168});
 m=await ok('/hr/months/2026-01');
 let v=(await ok('/hr/months/2026-01/attendance/'+e.id,'PUT',{version:m.version,days:{5:{status:'work',hours:8,shift:'day'}}})).version;
 v=(await ok('/hr/months/2026-01/approve','POST',{version:v},users.rahbar)).version;
 assert.equal((await call('/hr/months/2026-01/reopen','POST',{version:v,reason:'Xato'},users.kadrlar)).status,403);
 assert.equal((await call('/hr/months/2026-01/reopen','POST',{version:v,reason:'Xato'},users.buxgalter)).status,403);
 assert.equal((await call('/hr/months/2026-01/reopen','POST',{version:v,reason:''},users.rahbar)).status,400);
 assert.equal((await call('/hr/months/2026-01/reopen','POST',{version:v-1,reason:'Xato'},users.rahbar)).status,409);
 // keyingi oy tasdiqlangan bo'lsa ochilmaydi
 v=(await ok('/hr/months/2026-01/close','POST',{version:v},users.rahbar)).version;
 assert.equal((await call('/hr/months/2026-01/reopen','POST',{version:v,reason:'Kech'},users.rahbar)).status,409,'yopilgan oy ochilmaydi');
 await ok('/hr/months','POST',{month:'2026-02',normHours:160});let feb=await ok('/hr/months/2026-02');
 let fv=(await ok('/hr/months/2026-02/attendance/'+e.id,'PUT',{version:feb.version,days:{2:{status:'work',hours:8,shift:'day'}}})).version;
 fv=(await ok('/hr/months/2026-02/approve','POST',{version:fv},users.rahbar)).version;
 fv=(await ok('/hr/months/2026-02/reopen','POST',{version:fv,reason:'Soat noto‘g‘ri'},users.rahbar)).version;
 feb=await ok('/hr/months/2026-02',undefined,undefined,users.rahbar);assert.equal(feb.status,'draft');assert.equal(feb.payroll.length,1);
 fv=(await ok('/hr/months/2026-02/attendance/'+e.id,'PUT',{version:feb.version,days:{2:{status:'work',hours:6,shift:'day'}}})).version;
 fv=(await ok('/hr/months/2026-02/approve','POST',{version:fv},users.admin)).version;
 assert.equal((await ok('/hr/months/2026-02',undefined,undefined,users.rahbar)).payroll[0].hours,6);
 // 4) bo'sh tabel tasdiqlanmaydi
 fv=(await ok('/hr/months/2026-02/close','POST',{version:fv},users.rahbar)).version;
 const blank=await ok('/hr/employees','POST',{code:'2',name:'Bo‘sh Tabelli',hireDate:'2026-03-01'});
 await ok('/hr/rates/'+blank.id,'POST',{effectiveDate:'2026-03-01',salary:1000000,coefficient:0},users.buxgalter);
 await ok('/hr/months','POST',{month:'2026-03',normHours:176});let mar=await ok('/hr/months/2026-03');
 let mv=(await ok('/hr/months/2026-03/attendance/'+e.id,'PUT',{version:mar.version,days:{2:{status:'work',hours:8,shift:'day'}}})).version;
 const refused=await call('/hr/months/2026-03/approve','POST',{version:mv},users.rahbar);
 assert.equal(refused.status,400);assert.match(refused.body.error,/Bo‘sh Tabelli/);
 mv=(await ok('/hr/months/2026-03/attendance/'+blank.id,'PUT',{version:mv,days:{2:{status:'off',hours:0,shift:'day'}}})).version;
 await ok('/hr/months/2026-03/approve','POST',{version:mv},users.rahbar);
 // 5) rag'batlantirish va intizomiy jazo buyruqlari
 const order=(detail,extra={})=>call('/hr/workforce/records','POST',{employeeId:e.id,kind:'order',title:'Buyruq',startDate:'2026-03-10',endDate:'2026-03-10',detail,...extra});
 assert.equal((await order({orderType:'reward',rewardType:'bonus',basis:'Reja oshirib bajarildi',number:'12-R',orderDate:'2026-03-10'})).status,200);
 assert.equal((await order({orderType:'reward',rewardType:'bonus'})).status,400,'asossiz rag‘bat');
 assert.equal((await order({orderType:'reward',rewardType:'money'})).status,400);
 assert.equal((await order({orderType:'reward',rewardType:'gratitude',basis:'x',orderDate:'2026-13-01'})).status,400);
 const penalty={orderType:'penalty',penaltyType:'reprimand',violationDate:'2026-03-05',explanation:'received',basis:'Ishga 2 soat kechikdi'};
 assert.equal((await order({...penalty,violationDate:'2026-03-11'})).status,400,'qoidabuzarlik buyruqdan keyin bo‘lmaydi');
 assert.equal((await order({...penalty,explanation:''})).status,400,'tushuntirish xati');
 assert.equal((await order({...penalty,basis:''})).status,400);
 const pen=await order(penalty,{endDate:'2027-03-09'});assert.equal(pen.status,200);assert.equal(pen.body.detail.penaltyType,'reprimand');assert.equal(pen.body.detail.explanation,'received');
 // 6) sinov muddati eslatmasi
 const {trialEnd}=await import('../src/routes/hr-tools.js');
 assert.equal(trialEnd('2026-03-01','3 oy'),'2026-05-31');assert.equal(trialEnd('2026-03-01','2 hafta'),'2026-03-14');assert.equal(trialEnd('2026-03-01','Sinovsiz'),'');assert.equal(trialEnd('2026-03-01','3 ой'),'2026-05-31');
 const now=new Date(),start=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-3,now.getUTCDate()+10)).toISOString().slice(0,10);
 const trainee=await ok('/hr/employees','POST',{code:'3',name:'Sinovdagi Xodim',hireDate:start});
 await one("INSERT INTO hr_employment_docs(factory_id,employee_id,kind,number,date,effective_date,status,payload,created_by) VALUES($1,$2,'contract','7',$3,$3,'issued',$4,'{}') RETURNING id",[f.id,trainee.id,start,JSON.stringify({terms:{startDate:start,trial:'3 oy'}})]);
 const rem=await ok('/hr/reminders');const trial=rem.items.find(x=>x.employeeId===trainee.id);
 assert.ok(trial,'sinov eslatmasi chiqishi kerak');assert.equal(trial.title,'Sinov muddati tugaydi');assert.equal(trial.date,trialEnd(start,'3 oy'));
 // 3) tarix: kadrlar pulsiz amallarni ko'radi, summalar va oylik amallari yo'q; usta va kuzatuvchi umuman ko'rmaydi
 const hr=await ok('/hr/events');
 assert.ok(hr.length>0);assert.ok(hr.every(x=>!/^(rate|payroll|payment)\./.test(x.action)&&!('detail' in x)));
 assert.ok(hr.some(x=>x.action==='attendance.save'));
 const full=await ok('/hr/events',undefined,undefined,users.buxgalter);assert.ok(full.some(x=>x.action==='payroll.reopen'&&x.detail.reason));
 assert.ok(full.some(x=>x.action==='rate.create'));
 for(const u of [users.usta,users.kuzatuvchi])assert.equal((await call('/hr/events',undefined,undefined,u)).status,403);
 console.log('PASS hr-safety: only head admin deletes employees, deleted employee history kept, empty timesheet blocks approval, reward/penalty order validation, probation reminder, approved month reopen (roles, reason, version, closed/later guards, recalculation), money-free history for kadrlar');
}finally{if(server)await new Promise(resolve=>server.close(resolve));await getPool().end();await management.query(`DROP SCHEMA ${schema} CASCADE`);await management.end();}
