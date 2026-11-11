import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
const source=process.env.DATABASE_URL||process.env.POSTGRES_URL,schema='staff_import_'+crypto.randomBytes(8).toString('hex');
const management=new pg.Pool({connectionString:source});await management.query('CREATE SCHEMA '+schema);
const url=new URL(source);url.searchParams.set('options','-c search_path='+schema+',public');process.env.DATABASE_URL=url.toString();process.env.AUTH_SECRET=crypto.randomBytes(32).toString('hex');
const {one,q,migrate,getPool}=await import('../src/db.js');const {issueToken,hashPassword}=await import('../src/auth.js');const {default:app}=await import('../src/app.js');const {inMonth,employment}=await import('../src/payroll.js');let server;
try{
 await migrate();const f=await one("INSERT INTO factories(code,name) VALUES('staff','Staff') RETURNING *");
 const admin=await one("INSERT INTO users(username,role,password_hash) VALUES('admin','admin',$1) RETURNING *",[await hashPassword('Test123!')]);
 const existing=await one("INSERT INTO hr_employees(factory_id,code,name,hire_date) VALUES($1,'OLD-1','Existing employee','2026-01-01') RETURNING *",[f.id]);
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api';
 async function call(p,method='GET',body){const res=await fetch(base+p,{method,headers:{Authorization:'Bearer '+issueToken(admin),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:res.status,body:await res.json()};}
 const backup={app:'pto',format:1,createdAt:'2026-11-11T08:00:00Z',data:{materials:[{_id:'0123456789abcdef01234567',name:'Material',unit:'kg'}],products:[],hrEmployees:[1,2].map(i=>({_id:crypto.randomUUID(),code:'IMP-00'+i,name:'Imported employee '+i,hireDate:'',position:'',department:''}))}};
 const input={factoryId:f.id,backup},preview=await call('/admin/factory-imports/preview','POST',input);assert.equal(preview.status,200);assert.equal(preview.body.counts.hrEmployees,2);
 const request={...input,requestId:crypto.randomUUID(),fingerprint:preview.body.fingerprint};const first=await call('/admin/factory-imports','POST',request);assert.equal(first.status,200,JSON.stringify(first.body));assert.equal((await call('/admin/factory-imports','POST',request)).body.alreadyImported,true);
 const list=(await call('/hr/employees')).body;assert.equal(list.length,3);const imported=list.filter(e=>e.code.startsWith('IMP-'));assert.ok(imported.every(e=>e.hireDate===''&&e.position===''&&e.department===''));assert.equal(inMonth(imported[0],'2026-11'),false);assert.equal(employment(imported[0],'2026-11-11'),false);assert.equal((await one('SELECT count(*) AS n FROM hr_employment_docs')).n,0);
 const changed=structuredClone(input);changed.backup.createdAt='2026-11-12T08:00:00Z';const p2=await call('/admin/factory-imports/preview','POST',changed);const repeat=await call('/admin/factory-imports','POST',{...changed,requestId:crypto.randomUUID(),fingerprint:p2.body.fingerprint,replace:true});assert.equal(repeat.status,409);assert.equal((await one('SELECT count(*) AS n FROM hr_employees')).n,3);assert.equal((await one('SELECT count(*) AS n FROM factory_imports')).n,1);
 const bad=structuredClone(input);bad.backup.data.hrEmployees[1].code=bad.backup.data.hrEmployees[0].code;assert.equal((await call('/admin/factory-imports/preview','POST',bad)).status,400);
 bad.backup.data.hrEmployees[1].code='IMP-002';bad.backup.data.hrEmployees[0].hireDate='2026-02-30';assert.equal((await call('/admin/factory-imports/preview','POST',bad)).status,400);
 const before=await call('/admin/factory-imports/'+first.body.import.id+'/backup');assert.equal(before.body.data.hr_employees.length,1);assert.equal(before.body.data.hr_employees[0].id,existing.id);assert.ok(Array.isArray(before.body.data.hr_months));assert.ok(Array.isArray(before.body.data.hr_employee_files));
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'staff-import-restore-'));
 try{const file=path.join(dir,'backup.json');await fs.writeFile(file,JSON.stringify(before.body));await promisify(execFile)(process.execPath,[fileURLToPath(new URL('../scripts/restore.js',import.meta.url)),file,'--yes'],{cwd:dir,env:process.env,windowsHide:true,timeout:60000});assert.equal((await one('SELECT count(*) AS n FROM hr_employees')).n,1);assert.equal((await one('SELECT id FROM hr_employees')).id,existing.id);}finally{if(path.dirname(path.resolve(dir))===path.resolve(os.tmpdir())&&path.basename(dir).startsWith('staff-import-restore-'))await fs.rm(dir,{recursive:true,force:true});}
 console.log('PASS: employee import, unchanged existing cards, idempotency, duplicate rejection, missing-date payroll exclusion and pre-import HR backup restore');
}finally{if(server)await new Promise(r=>server.close(r));await getPool().end();await management.query('DROP SCHEMA '+schema+' CASCADE');await management.end();}
