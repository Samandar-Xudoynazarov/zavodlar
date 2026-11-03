import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { annualDays } from '../src/workforce.js';
assert.equal(annualDays({kind:'leave',status:'approved',startDate:'2027-12-30',endDate:'2028-01-03',detail:{leaveType:'annual'}},2028),3);
const source=process.env.DATABASE_URL||process.env.POSTGRES_URL;
const schema=`workforce_${crypto.randomBytes(8).toString('hex')}`;
const management=new pg.Pool({connectionString:source});await management.query(`CREATE SCHEMA ${schema}`);
const url=new URL(source);url.searchParams.set('options',`-c search_path=${schema},public`);
process.env.DATABASE_URL=url.toString();process.env.AUTH_SECRET=crypto.randomBytes(32).toString('hex');
const {one,q,migrate,getPool}=await import('../src/db.js');
const {issueToken,hashPassword}=await import('../src/auth.js');
const {default:app}=await import('../src/app.js');let server;
try{
 await migrate();
 const f=await one("INSERT INTO factories(code,name) VALUES('hr-manager','HR manager') RETURNING *");
 const other=await one("INSERT INTO factories(code,name) VALUES('other','Other') RETURNING *");
 const users={},hash=await hashPassword('Test123!');
 for(const role of ['admin','rahbar','kadrlar','buxgalter','usta','kuzatuvchi'])users[role]=await one('INSERT INTO users(username,role,factory_id,password_hash) VALUES($1,$2,$3,$4) RETURNING *',[role,role,f.id,hash]);
 server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const base=`http://127.0.0.1:${server.address().port}/api/hr`;
 async function call(path,method='GET',body,user=users.kadrlar){const r=await fetch(base+path,{method,headers:{Authorization:`Bearer ${issueToken(user)}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json()};}
 async function ok(path,method,body,user){const r=await call(path,method,body,user);assert.equal(r.status,200,JSON.stringify(r));return r.body;}
 const e=await ok('/employees','POST',{code:'001',name:'Sinov xodimi',hireDate:'2026-01-01',profile:{birthDate:'1990-03-02',address:'Uzun',emergencyPhone:'123'}});
 assert.equal(e.profile.address,'Uzun');
 for(const role of ['usta','kuzatuvchi'])assert.equal((await call('/workforce','GET',undefined,users[role])).status,403);
 const safe=await ok('/employees','GET',undefined,users.usta);assert.ok(!('profile' in safe[0]));
 await ok('/months','POST',{month:'2026-10',normHours:168});
 let allowance=await ok(`/workforce/allowances/${e.id}/2026`,'PUT',{days:20,usedBefore:2,version:0});
 assert.equal((await call(`/workforce/allowances/${e.id}/2026`,'PUT',{days:20,usedBefore:2,version:0})).status,409);
 const make=(kind,startDate,endDate,detail={},employeeId=e.id)=>ok('/workforce/records','POST',{kind,employeeId,title:kind+' sinov',startDate,endDate,detail});
 let leave=await make('leave','2026-10-05','2026-10-07',{leaveType:'annual'});
 assert.equal((await call(`/workforce/records/${leave.id}/decision`,'POST',{version:leave.version,status:'approved'},users.buxgalter)).status,403);
 const parallel=await Promise.all([call(`/workforce/records/${leave.id}/decision`,'POST',{version:leave.version,status:'approved'}),call(`/workforce/records/${leave.id}/decision`,'POST',{version:leave.version,status:'approved'})]);
 assert.deepEqual(parallel.map(x=>x.status).sort(),[200,409]);leave=parallel.find(x=>x.status===200).body;
 const overlap=await make('leave','2026-10-06','2026-10-08',{leaveType:'annual'});
 assert.equal((await call(`/workforce/records/${overlap.id}/decision`,'POST',{version:overlap.version,status:'approved'})).status,409);
 const overLimit=await make('leave','2026-11-01','2026-11-20',{leaveType:'annual'});
 assert.equal((await call(`/workforce/records/${overLimit.id}/decision`,'POST',{version:overLimit.version,status:'approved'})).status,409);
 leave=await ok(`/workforce/records/${leave.id}/apply`,'POST',{version:leave.version});
 let month=await ok('/months/2026-10');assert.equal(month.attendance[e.id]['5'].status,'leave');assert.equal(month.attendance[e.id]['5'].hours,0);
 // Reapplying does not overwrite or conflict merely because JSONB reordered keys.
 leave=await ok(`/workforce/records/${leave.id}/apply`,'POST',{version:leave.version});
 assert.equal((await call(`/workforce/records/${leave.id}/decision`,'POST',{version:leave.version,status:'cancelled',reason:'Sinov'})).status,409);
 assert.equal((await call(`/workforce/allowances/${e.id}/2026`,'PUT',{days:4,usedBefore:2,version:allowance.version})).status,409);
 let shift=await make('shift','2026-10-05','2026-10-09',{shift:'night',hours:8,workDays:[1,2,3,4,5]});
 shift=await ok(`/workforce/records/${shift.id}/decision`,'POST',{version:shift.version,status:'approved'});
 assert.equal((await call(`/workforce/records/${shift.id}/apply`,'POST',{version:shift.version})).status,409);
 // Atomic rollback across months when a later target month is absent.
 let across=await make('shift','2026-10-30','2026-11-02',{shift:'day',hours:8,workDays:[1,2,3,4,5]});
 across=await ok(`/workforce/records/${across.id}/decision`,'POST',{version:across.version,status:'approved'});
 assert.equal((await call(`/workforce/records/${across.id}/apply`,'POST',{version:across.version})).status,400);
 month=await ok('/months/2026-10');assert.ok(!month.attendance[e.id]['30']);
 await ok('/months','POST',{month:'2026-11',normHours:168});
 across=await ok(`/workforce/records/${across.id}/apply`,'POST',{version:across.version});
 assert.equal((await ok('/months/2026-11')).attendance[e.id]['2'].hours,8);
 const alien=await one("INSERT INTO hr_employees(factory_id,code,name,hire_date) VALUES($1,'alien','Other','2026-01-01') RETURNING *",[other.id]);
 assert.equal((await call('/workforce/records','POST',{kind:'leave',employeeId:alien.id,title:'bad',startDate:'2026-10-01',endDate:'2026-10-01',detail:{leaveType:'unpaid'}})).status,400);
 const doc=await make('document','2026-01-01','2031-01-01',{docType:'qualification',number:'123'});
 let approved=await ok(`/workforce/records/${doc.id}/decision`,'POST',{version:doc.version,status:'approved'});
 await ok(`/workforce/records/${doc.id}/decision`,'POST',{version:approved.version,status:'completed'});
 for(const [kind,detail] of [['order',{orderType:'transfer'}],['equipment',{quantity:2}]]){
  let r=await make(kind,'2026-10-01','2026-12-01',detail);
  r=await ok(`/workforce/records/${r.id}/decision`,'POST',{version:r.version,status:'approved'});
  await ok(`/workforce/records/${r.id}/decision`,'POST',{version:r.version,status:'completed'});
 }
 const summary=await ok('/workforce');assert.ok(summary.records.length>=8);assert.equal(summary.allowances.length,1);
 assert.ok(summary.events.length>0);
 // Backups include the new records, balances and extended personal card.
 const backupResponse=await fetch(base.replace(/\/hr$/,'')+'/backup',{headers:{Authorization:`Bearer ${issueToken(users.admin)}`}});
 assert.equal(backupResponse.status,200);const backup=await backupResponse.json();
 assert.equal(backup.data.hr_records.length,summary.records.length);assert.equal(backup.data.hr_leave_allowances.length,1);
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'workforce-restore-'));
 try{
  const file=path.join(folder,'backup.json');fs.writeFileSync(file,JSON.stringify(backup));
  await q('DELETE FROM hr_records WHERE factory_id=$1',[f.id]);await q('DELETE FROM hr_leave_allowances WHERE factory_id=$1',[f.id]);
  await promisify(execFile)(process.execPath,[fileURLToPath(new URL('../scripts/restore.js',import.meta.url)),file,'--yes'],{cwd:folder,env:process.env,windowsHide:true});
  assert.equal((await ok('/workforce')).records.length,summary.records.length);
  assert.equal((await ok('/employees'))[0].profile.address,'Uzun');
  const partial={...backup,data:{...backup.data}};delete partial.data.hr_leave_allowances;
  fs.writeFileSync(file,JSON.stringify(partial));
  await assert.rejects(promisify(execFile)(process.execPath,[fileURLToPath(new URL('../scripts/restore.js',import.meta.url)),file,'--yes'],{cwd:folder,env:process.env,windowsHide:true}));
  assert.equal((await ok('/workforce')).records.length,summary.records.length);
 }finally{
  const resolved=fs.realpathSync(folder);assert.equal(path.dirname(resolved).toLowerCase(),fs.realpathSync(os.tmpdir()).toLowerCase());assert.ok(path.basename(resolved).startsWith('workforce-restore-'));fs.rmSync(resolved,{recursive:true,force:true});
 }
 assert.equal((await call('/employees/'+e.id,'PUT',{...e,endDate:'2026-10-01'})).status,400);
 await q("UPDATE hr_months SET status='closed' WHERE factory_id=$1 AND month='2026-10'",[f.id]);
 assert.equal((await call(`/workforce/records/${leave.id}/apply`,'POST',{version:leave.version})).status,409);
 console.log('PASS workforce: profile privacy, factory isolation, leave balances, overlap and concurrent approvals, atomic table application, closed months, documents, orders and equipment');
}finally{
 if(server)await new Promise(resolve=>server.close(resolve));await getPool().end();await management.query(`DROP SCHEMA ${schema} CASCADE`);await management.end();
}
