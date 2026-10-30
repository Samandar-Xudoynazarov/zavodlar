import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { calculatePayroll, cleanDays, monthEnd } from '../src/payroll.js';

assert.equal(monthEnd('2028-02'),'2028-02-29');
assert.throws(()=>monthEnd('2026-13'));
const testEmployee={id:'e',code:'1',name:'Test',hireDate:'2026-10-01',endDate:''};
assert.throws(()=>cleanDays({'32':{status:'work',hours:8,shift:'day'}},'2026-10',testEmployee));
assert.throws(()=>cleanDays({'1':{status:'sick',hours:8,shift:'day'}},'2026-10',testEmployee));
const time={1:{status:'work',hours:8,shift:'day'},16:{status:'work',hours:8,shift:'night'}};
const unit=calculatePayroll({month:'2026-10',normHours:168,taxRate:12,attendance:{e:time},adjustments:{}},[testEmployee],[{id:'a',employeeId:'e',effectiveDate:'2026-10-01',salary:1680000,coefficient:247500},{id:'b',employeeId:'e',effectiveDate:'2026-10-16',salary:3360000,coefficient:247500}])[0];
assert.equal(unit.base,240000);assert.equal(unit.coefficient,23571.43);assert.equal(unit.tax,31628.57);assert.equal(unit.balance,231942.86);assert.equal(unit.segments.length,2);
console.log('PASS payroll arithmetic, effective dates, leap year and attendance validation');

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
  for(const role of ['pto','omborchi','kuzatuvchi','kurator'])assert.equal((await call('/hr/employees','GET',undefined,users[role])).status,403);
  const e=await ok('/hr/employees','POST',{code:'001',name:'Sinov xodimi',hireDate:'2026-10-01',position:'Usta',department:'Sex'},users.kadrlar);
  assert.equal((await call('/hr/rates/'+e.id,'GET',undefined,users.kadrlar)).status,403);
  assert.equal((await call('/materials','GET',undefined,users.kadrlar)).status,403);
  assert.equal((await call('/hr/employees/'+e.id,'PUT',{...e,phone:'1'},hq,other.id)).status,400);
  assert.equal((await call('/hr/employees','GET',undefined,hq,other.id)).body.length,0);
  const firstRate=await ok('/hr/rates/'+e.id,'POST',{effectiveDate:'2026-10-01',salary:1600000,coefficient:247500});
  await ok('/hr/rates/'+firstRate.id,'PUT',{effectiveDate:'2026-10-01',salary:1680000,coefficient:247500,version:firstRate.version});
  assert.equal((await call('/hr/rates/'+firstRate.id,'PUT',{effectiveDate:'2026-10-01',salary:9,coefficient:0,version:firstRate.version})).status,409);
  await ok('/hr/rates/'+e.id,'POST',{effectiveDate:'2026-10-16',salary:3360000,coefficient:247500});
  await ok('/hr/months','POST',{month:'2026-10',normHours:168});
  let m=await ok('/hr/months/2026-10');
  const body={version:m.version,days:time};
  const concurrent=await Promise.all([call('/hr/months/2026-10/attendance/'+e.id,'PUT',body,users.usta),call('/hr/months/2026-10/attendance/'+e.id,'PUT',body,users.kadrlar)]);
  assert.deepEqual(concurrent.map(x=>x.status).sort(),[200,409]);
  m=await ok('/hr/months/2026-10');assert.equal(m.payroll[0].balance,unit.balance);
  for(const role of ['kadrlar','usta']){
    const safe=await ok('/hr/months/2026-10','GET',undefined,users[role]);
    for(const key of ['snapshot','payroll','adjustments','taxRate','payments'])assert.ok(!Object.hasOwn(safe,key));
    assert.equal((await call('/hr/months/2026-10/approve','POST',{version:m.version},users[role])).status,403);
  }
  console.log('PASS role privacy, factory isolation and concurrent attendance protection');
  const requestId=crypto.randomUUID(),payment={requestId,employeeId:e.id,amount:1000,date:'2026-10-12',method:'cash',kind:'advance',note:'Test',version:m.version};
  const duplicate=await Promise.all([call('/hr/months/2026-10/payments','POST',payment),call('/hr/months/2026-10/payments','POST',payment)]);
  assert.deepEqual(duplicate.map(x=>x.status),[200,200]);assert.equal(duplicate[0].body.payment.id,duplicate[1].body.payment.id);
  assert.equal((await call('/hr/months/2026-10/payments','POST',{...payment,amount:2000})).status,409);
  m=await ok('/hr/months/2026-10');assert.equal(m.payroll[0].balance,230942.86);
  await ok('/hr/months/2026-10/payments/'+duplicate[0].body.payment.id+'/void','POST',{version:m.version,reason:'Xato to‘lov'});
  m=await ok('/hr/months/2026-10');assert.equal(m.payroll[0].balance,231942.86);
  await ok('/hr/months/2026-10/approve','POST',{version:m.version});
  m=await ok('/hr/months/2026-10');assert.equal(m.status,'approved');
  assert.equal((await call('/hr/months/2026-10/attendance/'+e.id,'PUT',{version:m.version,days:{}})).status,409);
  assert.equal((await call('/hr/rates/'+e.id,'POST',{effectiveDate:'2026-10-25',salary:9,coefficient:0})).status,409);
  assert.equal((await call('/hr/rates/'+firstRate.id,'PUT',{effectiveDate:'2026-10-01',salary:9,coefficient:0,version:2})).status,409);
  const pay=await ok('/hr/months/2026-10/payments','POST',{...payment,requestId:crypto.randomUUID(),amount:50000,version:m.version,method:'card'});
  m=await ok('/hr/months/2026-10');assert.equal(m.payroll[0].balance,181942.86);
  await ok('/hr/months/2026-10/close','POST',{version:m.version});
  m=await ok('/hr/months/2026-10');
  assert.equal((await call('/hr/months/2026-10/payments/'+pay.payment.id+'/void','POST',{version:m.version,reason:'no'})).status,409);
  assert.equal((await call('/hr/months','POST',{month:'2026-09',normHours:160})).status,409);
  await ok('/hr/months','POST',{month:'2026-11',normHours:168});
  const nov=await ok('/hr/months/2026-11');assert.equal(nov.payroll[0].openingBalance,181942.86);
  // Later changes must not alter the approved snapshot.
  await ok('/hr/rates/'+e.id,'POST',{effectiveDate:'2026-11-01',salary:9999999,coefficient:0});
  const frozen=await ok('/hr/months/2026-10');assert.equal(frozen.payroll[0].gross,m.payroll[0].gross);
  const profile={...e,endDate:'2026-11-30',phone:'998'};await ok('/hr/employees/'+e.id,'PUT',profile,users.kadrlar);
  const safeEmployee=(await ok('/hr/employees','GET',undefined,users.usta))[0];assert.ok(!('phone' in safeEmployee));
  const backup=await ok('/backup');assert.equal(backup.data.hr_employees.length,1);assert.equal(backup.data.hr_payments.length,2);assert.ok(backup.data.hr_events.length>0);
  assert.equal((await call('/hr/events','GET',undefined,users.kadrlar)).status,403);
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'payroll-restore-'));
  try {
    const file=path.join(folder,'test-backup.json');fs.writeFileSync(file,JSON.stringify(backup));
    await q('UPDATE hr_employees SET name=$2 WHERE id=$1',[e.id,'Changed test name']);
    await promisify(execFile)(process.execPath,[fileURLToPath(new URL('../scripts/restore.js',import.meta.url)),file,'--yes'],{cwd:folder,env:process.env,windowsHide:true});
    assert.equal((await one('SELECT name FROM hr_employees WHERE id=$1',[e.id])).name,'Sinov xodimi');
    assert.equal((await ok('/hr/months/2026-10')).payroll[0].balance,181942.86);
    const legacy={...backup,data:{...backup.data}};
    for(const key of Object.keys(legacy.data).filter(k=>k.startsWith('hr_')))delete legacy.data[key];
    fs.writeFileSync(file,JSON.stringify(legacy));
    await promisify(execFile)(process.execPath,[fileURLToPath(new URL('../scripts/restore.js',import.meta.url)),file,'--yes'],{cwd:folder,env:process.env,windowsHide:true});
    assert.equal((await one('SELECT count(*) AS n FROM hr_payments WHERE factory_id=$1',[f.id])).n,2);
    console.log('PASS full payroll backup/restore round trip and legacy backup preserves personnel');
  } finally {
    const resolved=fs.realpathSync(folder);
    assert.equal(path.dirname(resolved).toLowerCase(),fs.realpathSync(os.tmpdir()).toLowerCase());
    assert.ok(path.basename(resolved).startsWith('payroll-restore-'));
    fs.rmSync(resolved,{recursive:true,force:true});
  }
  console.log('PASS payment idempotency, cancellation, snapshots, month closing, carry-forward and backups');
} finally {
  if(server)await new Promise(resolve=>server.close(resolve));await getPool().end();
  await management.query(`DROP SCHEMA ${schema} CASCADE`);await management.end();
}
