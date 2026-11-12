import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';
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

  const hqEmployee=await ok('/hr/employees','POST',{code:'HQ',name:'Bosh admin sinovi',hireDate:'2026-10-01'},hq);
  await ok('/hr/employees/'+hqEmployee.id,'DELETE',{version:hqEmployee.version,confirmName:hqEmployee.name},hq);
  let d=await ok('/hr/departments','POST',{name:'Ishlab chiqarish'},users.kadrlar);
  assert.equal((await call('/hr/departments','POST',{name:'ishlab chiqarish'})).status,409);
  for(const role of ['rahbar','buxgalter','usta','pto'])assert.equal((await call('/hr/departments','POST',{name:'No'},users[role])).status,403);
  assert.equal((await call('/hr/departments/'+d.id,'PUT',{name:'Foreign',version:d.version},hq,other.id)).status,400);
  let e=await ok('/hr/employees','POST',{code:'DEL',name:'Sinov xodimi',hireDate:'2026-10-01',position:'Usta',department:d.name},users.kadrlar);
  e=await ok('/hr/employees/'+e.id,'PUT',{...e,position:'Muhandis',phone:'123',profile:{address:'Yangi manzil'}},users.kadrlar);
  assert.equal(e.position,'Muhandis');assert.equal(e.profile.address,'Yangi manzil');
  d=await ok('/hr/departments/'+d.id,'PUT',{name:'Yangi bo‘lim',version:d.version},users.kadrlar);
  e=(await ok('/hr/employees')).find(x=>x.id===e.id);assert.equal(e.department,d.name);
  assert.equal((await call('/hr/departments/'+d.id,'DELETE',{version:d.version})).status,409);
  assert.equal((await call('/hr/employees/'+e.id,'DELETE',{version:e.version,confirmName:e.name},users.buxgalter)).status,403);
  assert.equal((await call('/hr/employees/'+e.id,'DELETE',{version:e.version,confirmName:e.name},hq,other.id)).status,400);
  assert.equal((await call('/hr/employees/'+e.id,'DELETE',{version:e.version-1,confirmName:e.name})).status,409);
  assert.equal((await call('/hr/employees/'+e.id,'DELETE',{version:e.version,confirmName:'wrong'})).status,400);
  await ok('/hr/months','POST',{month:'2026-10',normHours:168});
  let m=await ok('/hr/months/2026-10');
  await ok('/hr/months/2026-10/attendance/'+e.id,'PUT',{version:m.version,days:{1:{status:'work',hours:8,shift:'day'}}});
  await ok('/hr/rates/'+e.id,'POST',{effectiveDate:'2026-10-01',salary:1680000,coefficient:0});
  m=await ok('/hr/months/2026-10');
  const paid=await ok('/hr/months/2026-10/payments','POST',{version:m.version,requestId:crypto.randomUUID(),employeeId:e.id,date:'2026-10-12',method:'cash',kind:'advance',amount:100});
  assert.equal((await call('/hr/employees/'+e.id,'DELETE',{version:e.version,confirmName:e.name},users.kadrlar)).status,409);
  await ok('/hr/months/2026-10/payments/'+paid.payment.id+'/void','POST',{version:paid.version,reason:'Sinov to‘lovi'});
  await ok('/hr/employees/'+e.id,'DELETE',{version:e.version,confirmName:e.name},users.kadrlar);
  assert.equal((await ok('/hr/employees')).length,0);
  for(const table of ['hr_employment_docs','hr_rates','hr_records','hr_employee_files','hr_leave_allowances','hr_payments'])assert.equal((await q('SELECT count(*)::int AS n FROM '+table+' WHERE employee_id=$1',[e.id])).rows[0].n,0);
  m=await ok('/hr/months/2026-10');assert.equal(m.attendance[e.id],undefined);
  await ok('/hr/departments/'+d.id,'DELETE',{version:d.version});
  e=await ok('/hr/employees','POST',{code:'KEEP',name:'Hisobdagi xodim',hireDate:'2026-10-01'});
  await q("UPDATE hr_months SET status='closed',snapshot=$1 WHERE factory_id=$2",[JSON.stringify([{employeeId:e.id}]),f.id]);
  assert.equal((await call('/hr/employees/'+e.id,'DELETE',{version:e.version,confirmName:e.name})).status,409);
  assert.equal((await ok('/hr/employees')).length,1);
  console.log('PASS departments: role and factory isolation, duplicate names, rename propagation, full employee editing, version and confirmation guards, atomic deletion and draft cleanup, finalized payroll protection');
}finally{if(server)await new Promise(resolve=>server.close(resolve));await getPool().end();await management.query(`DROP SCHEMA ${schema} CASCADE`);await management.end();}
