import assert from 'node:assert/strict';import crypto from 'node:crypto';import pg from 'pg';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {encryptBackup,decryptBackup} from '../src/backup-crypto.js';import {cleanLogo} from '../src/factory-profile.js';
const encryptionKey=crypto.randomBytes(32).toString('hex'),encrypted=encryptBackup({test:'O‘zbekcha'},encryptionKey);assert.deepEqual(decryptBackup(encrypted,encryptionKey),{test:'O‘zbekcha'});assert.throws(()=>decryptBackup(encrypted,crypto.randomBytes(32).toString('hex')));const corrupted=Buffer.from(encrypted);corrupted[40]^=1;assert.throws(()=>decryptBackup(corrupted,encryptionKey));assert.throws(()=>cleanLogo('data:image/svg+xml;base64,PHN2Zz4='));
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


 const logo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
 let identity=await ok('/factory-profile');assert.equal(identity.company,'Payroll test');
 identity=await ok('/factory-profile','PUT',{...identity,company:'Birinchi zavod',logo,address:'Manzil A',director:'Rahbar A'});
 assert.equal(identity.logo,logo);
 for(const role of ['kadrlar','pto','buxgalter','usta','kuzatuvchi'])assert.equal((await call('/factory-profile','PUT',identity,users[role])).status,403);
 const foreign=await call('/factory-profile','GET',undefined,hq,other.id);assert.equal(foreign.body.logo,'');assert.notEqual(foreign.body.company,identity.company);
 assert.equal((await call('/factory-profile','PUT',{...identity,version:identity.version-1})).status,409);
 assert.equal((await call('/factory-profile','PUT',{...identity,logo:'data:image/svg+xml;base64,PHN2Zz4='})).status,400);
 let employee=await ok('/hr/employees','POST',{code:'B1',name:'Brend xodimi',department:'Ishlab chiqarish',position:'Muhandis',hireDate:'2026-10-01',profile:{passportExpiry:'2026-01-01'}});
 const dossier=await ok('/hr/personnel/'+employee.id);const contract=dossier.documents.find(d=>d.kind==='contract');assert.equal(contract.payload.employer.company,identity.company);assert.equal(contract.payload.employer.logo,logo);
 identity=await ok('/factory-profile','PUT',{...identity,company:'Yangilangan nom'});
 assert.equal((await ok('/hr/personnel/'+employee.id)).documents.find(d=>d.id===contract.id).payload.employer.company,'Birinchi zavod');
 let preview=await ok('/hr/employees/import','POST',{rows:[{code:'I1',name:'Import xodimi',department:'Ishlab chiqarish',position:'Muhandis',hireDate:'2026-10-01'}]},users.kadrlar);
 assert.equal(preview.errors.length,0);assert.equal((await ok('/hr/employees')).length,1);
 await ok('/hr/employees/import','POST',{rows:preview.rows,commit:true,fingerprint:preview.fingerprint},users.kadrlar);assert.equal((await ok('/hr/employees')).length,2);
 const duplicate=await ok('/hr/employees/import','POST',{rows:preview.rows},users.kadrlar);assert.equal(duplicate.errors.length,1);
 assert.equal((await call('/hr/employees/import','POST',{rows:preview.rows,commit:true,fingerprint:preview.fingerprint},users.kadrlar)).status,400);
 const invalid=await ok('/hr/employees/import','POST',{rows:[{code:'XX',name:'Invalid date',hireDate:'2026-02-30'}]});assert.equal(invalid.errors.length,1);
 assert.equal((await call('/hr/employees/import','POST',{rows:preview.rows},users.buxgalter)).status,403);
 let position=await ok('/hr/staff-positions','POST',{department:'Ishlab chiqarish',position:'Muhandis',slots:5},users.kadrlar);
 assert.equal((await ok('/hr/staff-positions'))[0].occupied,2);
 assert.equal((await call('/hr/staff-positions','POST',{department:'Ishlab chiqarish',position:'muhandis',slots:1})).status,409);
 assert.equal((await call('/hr/staff-positions/'+position.id,'PUT',{...position,slots:9},hq,other.id)).status,400);
 assert.equal((await call('/hr/staff-positions','GET',undefined,users.usta)).status,403);
 const dept=(await ok('/hr/departments')).find(d=>d.name==='Ishlab chiqarish');await ok('/hr/departments/'+dept.id,'PUT',{name:'Yangi sex',version:dept.version});assert.equal((await ok('/hr/staff-positions'))[0].occupied,2);
 assert.ok((await ok('/hr/reminders')).items.some(x=>x.employeeId===employee.id&&x.days<0));
 assert.equal((await call('/hr/reminders','GET',undefined,users.buxgalter)).status,403);
 const backup=await ok('/backup');assert.equal(backup.data.hr_staff_positions.length,1);assert.equal(backup.data.settings[0].document_profile.logo,logo);
 // Actual scheduled backup and decryption against this isolated test schema.
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'zavodlar-backup-test-'));
 try{
 await promisify(execFile)(process.execPath,['scripts/backup.js'],{cwd:path.resolve('..','backend'),env:{...process.env,BACKUP_DIR:folder,BACKUP_ENCRYPTION_KEY:encryptionKey,BACKUP_KEEP:'2'},windowsHide:true});
 const files=(await fs.readdir(folder)).filter(n=>n.endsWith('.enc'));assert.equal(files.length,1);const restored=decryptBackup(await fs.readFile(path.join(folder,files[0])),encryptionKey);assert.equal(restored.data.hr_employees.length,2);assert.equal(restored.data.hr_staff_positions.length,1);
 const jsonPath=path.join(folder,'restore.json');await fs.writeFile(jsonPath,JSON.stringify(restored));const script=(await import('node:url')).fileURLToPath(new URL('../scripts/restore.js',import.meta.url));await promisify(execFile)(process.execPath,[script,jsonPath,'--yes'],{cwd:folder,env:process.env,windowsHide:true});
 assert.equal((await ok('/hr/staff-positions'))[0].occupied,2);assert.equal((await ok('/factory-profile')).logo,logo);
 }finally{for(const file of await fs.readdir(folder))await fs.unlink(path.join(folder,file));await fs.rmdir(folder);}
 console.log('PASS factory branding: role/factory isolation, valid images, immutable document payloads; Excel preview/atomic import/duplicates; staffing/rename; expiry privacy; encrypted backup round trip');
}finally{if(server)await new Promise(resolve=>server.close(resolve));await getPool().end();await management.query('DROP SCHEMA '+schema+' CASCADE');await management.end();}
