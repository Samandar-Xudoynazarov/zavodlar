import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
const source=process.env.DATABASE_URL||process.env.POSTGRES_URL,schema=`personnel_${crypto.randomBytes(8).toString('hex')}`;
const management=new pg.Pool({connectionString:source});await management.query(`CREATE SCHEMA ${schema}`);
const url=new URL(source);url.searchParams.set('options',`-c search_path=${schema},public`);process.env.DATABASE_URL=url.toString();process.env.AUTH_SECRET=crypto.randomBytes(32).toString('hex');
const {one,q,migrate,getPool}=await import('../src/db.js'),{issueToken,hashPassword}=await import('../src/auth.js'),{default:app}=await import('../src/app.js');let server;
try{
 await migrate();const f=await one("INSERT INTO factories(code,name) VALUES('personnel','Sinov zavodi') RETURNING *"),other=await one("INSERT INTO factories(code,name) VALUES('other','Other') RETURNING *"),users={},hash=await hashPassword('Test123!');
 for(const role of ['admin','rahbar','kadrlar','buxgalter','usta'])users[role]=await one('INSERT INTO users(username,role,factory_id,password_hash) VALUES($1,$2,$3,$4) RETURNING *',[role,role,f.id,hash]);
 const alien=await one("INSERT INTO users(username,role,factory_id,password_hash) VALUES('alien','kadrlar',$1,$2) RETURNING *",[other.id,hash]);
 server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}/api`;
 async function call(p,method='GET',body,user=users.kadrlar){const r=await fetch(base+p,{method,headers:{Authorization:`Bearer ${issueToken(user)}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json()};}
 async function ok(p,m,b,u){const r=await call(p,m,b,u);assert.equal(r.status,200,JSON.stringify(r));return r.body;}
 let e=await ok('/hr/employees','POST',{code:'001',name:'Sinov Xodimov',position:'Operator',department:'Sex',phone:'+998901234567',hireDate:'2026-10-01',profile:{birthDate:'1990-02-03',passport:'AA1234567',pinfl:'12345678901234',phone2:'+998911234567',address:'Sinov ko‘chasi',passportIssued:'2020-01-01',passportIssuer:'Sinov IIB'}});
 const p=`/hr/personnel/${e.id}`;let card=await ok(p);assert.equal(card.documents.length,2);assert.equal(card.employee.profile.phone2,'+998911234567');assert.equal(card.files.length,0);
 for(const u of [users.buxgalter,users.usta,alien])assert.ok([400,403].includes((await call(p,'GET',undefined,u)).status));
 for(const profile of [{birthDate:'2030-01-01'},{pinfl:'123'},{passport:'<>bad'},{dossier:{passport:{status:'wrong'}}}])assert.equal((await call('/hr/employees/'+e.id,'PUT',{...e,profile})).status,400);
 const em={company:'Sinov zavodi MChJ',director:'Sinov Rahbarov',address:'Sinov manzili',city:'Toshkent',phone:'123',hrName:'Sinov Kadrov',shortName:'SZ'};
 const employer=await ok('/hr/personnel-employer','PUT',{version:0,profile:em});assert.equal((await call('/hr/personnel-employer','PUT',{version:0,profile:em})).status,409);
 let contract=card.documents.find(d=>d.kind==='contract'),hire=card.documents.find(d=>d.kind==='hire');
 const issue=(d,u=users.admin)=>call(`${p}/documents/${d.id}/issue`,'POST',{version:d.version,signedConfirmed:true,basisChecked:true},u);
 assert.equal((await issue(contract)).status,400);assert.equal((await issue(hire)).status,409);
 const terms={position:'Operator',department:'Sex',workplace:'Zavod',employmentType:'main',termType:'indefinite',startDate:e.hireDate,workSchedule:'09:00–18:00',daysWeek:5,hoursWeek:40,salary:3000000,coefficient:0,leaveDays:21,extraLeave:0};
 async function edit(d,changes={}){return ok(`${p}/documents/${d.id}`,'PUT',{number:d.number||'1',date:'2026-10-01',effectiveDate:e.hireDate,terms:d.payload.terms,...changes,version:d.version});}
 contract=await edit(contract,{number:'S-001',terms});assert.equal((await issue(contract,users.kadrlar)).status,403);
 const signed=await issue(contract);assert.equal(signed.status,200,JSON.stringify(signed));contract=signed.body;
 assert.equal((await call(`${p}/documents/${contract.id}`,'PUT',{...contract,version:contract.version})).status,409);
 hire=await edit(hire,{number:'B-001'});const hires=await Promise.all([issue(hire),issue(hire)]);assert.deepEqual(hires.map(r=>r.status).sort(),[200,409]);hire=hires.find(r=>r.status===200).body;
 assert.equal(hire.payload.terms.sourceContractNumber,'S-001');assert.equal((await one('SELECT salary FROM hr_rates WHERE employee_id=$1',[e.id])).salary,3000000);
 e=(await ok(p)).employee;assert.equal(e.version,2);
 const transferTerms={position:'Usta',department:'Yangi sex',agreementNumber:'Q-001',agreementDate:'2026-10-15',sourceContractNumber:'S-001',sourceContractDate:'2026-10-01',evidence:'Xodimning 15.10.2026 dagi yozma roziligi',salary:4000000,coefficient:100000};
 let transfer=await ok(p+'/documents','POST',{kind:'transfer',number:'B-002',date:'2026-10-15',effectiveDate:'2026-10-15',terms:transferTerms});
 assert.equal((await issue(transfer)).status,409);card=await ok(p);let addendum=card.documents.find(d=>d.id===transfer.relatedId);assert.equal((await issue(addendum)).status,200);assert.equal((await issue(transfer)).status,200);
 card=await ok(p);assert.equal(card.employee.position,'Usta');assert.equal(card.documents.find(d=>d.id===hire.id).payload.employee.position,'Operator');assert.equal(card.documents.find(d=>d.id===transfer.id).payload.employee.position,'Operator');
 // File bytes are persistent and only visible to personnel roles in this factory.
 const bytes=Buffer.from('%PDF-1.4\n% test attachment\n'),filePath=p+'/files?'+new URLSearchParams({slot:'passport',name:'Sinov.pdf',mime:'application/pdf'});
 const upload=async(data=bytes,u=users.kadrlar)=>{const r=await fetch(base+filePath,{method:'POST',headers:{Authorization:`Bearer ${issueToken(u)}`,'Content-Type':'application/octet-stream'},body:data});return {status:r.status,body:await r.json()};};
 assert.equal((await upload(Buffer.from('invalid'))).status,400);assert.equal((await upload(bytes,users.buxgalter)).status,403);assert.equal((await upload(Buffer.alloc(3145729))).status,413);
 const file=await upload();assert.equal(file.status,200);const download=await fetch(base+p+'/files/'+file.body.id,{headers:{Authorization:`Bearer ${issueToken(users.kadrlar)}`}});assert.equal(download.status,200);assert.deepEqual(Buffer.from(await download.arrayBuffer()),bytes);
 assert.equal((await call(p+'/files/'+file.body.id,'GET',undefined,users.buxgalter)).status,403);
 card=await ok(p);assert.ok(!JSON.stringify(card.files).includes('contentBase64'));e=card.employee;
 const terminationTerms={terminationBasis:'other',reason:'Sinov asosi',evidence:'Sinov hujjati',sourceContractNumber:'S-001',sourceContractDate:'2026-10-01'};
 let termination=await ok(p+'/documents','POST',{kind:'termination',number:'B-003',date:'2026-11-01',effectiveDate:'2026-11-01',terms:terminationTerms});assert.equal((await issue(termination)).status,400);
 termination=await edit(termination,{number:'B-003',date:'2026-11-01',effectiveDate:'2026-11-01',terms:{...terminationTerms,terminationBasis:'mutual'}});
 await q("INSERT INTO hr_months(factory_id,month,norm_hours,status) VALUES($1,'2026-11',160,'approved')",[f.id]);assert.equal((await issue(termination)).status,409);await q("UPDATE hr_months SET status='draft' WHERE factory_id=$1",[f.id]);
 assert.equal((await issue(termination)).status,200);card=await ok(p);assert.equal(card.employee.endDate,'2026-11-01');assert.ok(card.history.some(h=>h.action==='personnel.document.issue'));
 // Complete backup and restore retains linked documents and attachment bytes.
 const backup=await ok('/backup','GET',undefined,users.admin);assert.equal(backup.data.hr_employee_files.length,1);assert.equal(backup.data.hr_employment_docs.length,5);
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'personnel-restore-'));
 try{
  const fileName=path.join(folder,'backup.json');fs.writeFileSync(fileName,JSON.stringify(backup));await q('DELETE FROM hr_employee_files WHERE factory_id=$1',[f.id]);
  await promisify(execFile)(process.execPath,[fileURLToPath(new URL('../scripts/restore.js',import.meta.url)),fileName,'--yes'],{cwd:folder,env:process.env,windowsHide:true});
  assert.equal((await ok(p)).files.length,1);assert.equal((await one('SELECT content_base64 FROM hr_employee_files WHERE id=$1',[file.body.id])).contentBase64,bytes.toString('base64'));
  const legacy={...backup,data:{...backup.data}};for(const table of ['hr_employers','hr_employment_docs','hr_employee_files','hr_records','hr_leave_allowances'])delete legacy.data[table];
  fs.writeFileSync(fileName,JSON.stringify(legacy));await promisify(execFile)(process.execPath,[fileURLToPath(new URL('../scripts/restore.js',import.meta.url)),fileName,'--yes'],{cwd:folder,env:process.env,windowsHide:true});
  assert.equal((await ok(p)).files.length,1);assert.equal((await ok(p)).documents.length,5);
  const partial={...backup,data:{...backup.data}};delete partial.data.hr_employee_files;fs.writeFileSync(fileName,JSON.stringify(partial));
  await assert.rejects(promisify(execFile)(process.execPath,[fileURLToPath(new URL('../scripts/restore.js',import.meta.url)),fileName,'--yes'],{cwd:folder,env:process.env,windowsHide:true}));assert.equal((await ok(p)).documents.length,5);
 }finally{const resolved=fs.realpathSync(folder);assert.equal(path.dirname(resolved).toLowerCase(),fs.realpathSync(os.tmpdir()).toLowerCase());assert.ok(path.basename(resolved).startsWith('personnel-restore-'));fs.rmSync(resolved,{recursive:true,force:true});}
 await ok(p+'/files/'+file.body.id,'DELETE');assert.equal((await ok(p)).files.length,0);
 console.log('PASS personnel: automatic drafts, validated personal data, consent/addendum dependency, signed confirmation, atomic hire/promotion/termination, immutable snapshots, versions, frozen payroll, private persistent attachments, backup/restore');
}finally{if(server)await new Promise(resolve=>server.close(resolve));await getPool().end();await management.query(`DROP SCHEMA ${schema} CASCADE`);await management.end();}
