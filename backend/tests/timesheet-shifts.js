import assert from 'node:assert/strict';import crypto from 'node:crypto';import pg from 'pg';import fs from 'node:fs/promises';import {createRequire} from 'node:module';
import {cleanAttendance} from '../src/attendance.js';
const {emptyAttendance,updateAttendance,shiftEntries,workingDay}=await import(new URL('../../frontend/lib/attendance.js',import.meta.url));
const legacy={status:'work',hours:8,shift:'day'};assert.deepEqual(cleanAttendance(legacy),legacy);
let two=updateAttendance(legacy,'shiftCount','2');two=updateAttendance(two,'secondHours',4);assert.equal(two.hours,12);assert.deepEqual(cleanAttendance(two),two);
assert.throws(()=>cleanAttendance({...two,hours:8}));assert.throws(()=>cleanAttendance({...two,hours:28,shifts:[{shift:'day',hours:14},{shift:'night',hours:14}]}));assert.throws(()=>cleanAttendance({...two,shifts:[{shift:'day',hours:8},{shift:'day',hours:4}]}));
const off=updateAttendance(two,'status','off');assert.equal(off.hours,0);assert.ok(off.shifts.every(s=>s.hours===0));assert.equal(cleanAttendance(off).hours,0);assert.equal(updateAttendance(two,'shiftCount',1).hours,12);
// Inspect real XLSX merges and cached/formula totals, including February and blank forms.
const requireFrontend=createRequire(new URL('../../frontend/package.json',import.meta.url));const Excel=requireFrontend('exceljs');
const moduleSource=(await fs.readFile(new URL('../../frontend/lib/hr-timesheet.js',import.meta.url),'utf8')).replace(/^import .*/gm,'').replace(/export /g,'');const buildTimesheet=new Function('shiftEntries','workingDay',moduleSource+';return buildTimesheet;')(shiftEntries,workingDay);
const wb=new Excel.Workbook(),ws=buildTimesheet(wb,{month:'2026-11',employees:[{id:'e',code:'1',name:'Sinov',department:'Sex'}],doc:{normHours:168,status:'draft',attendance:{e:{1:legacy,2:two,16:{status:'work',shift:'night',hours:8,shiftCount:2,shifts:[{shift:'night',hours:3},{shift:'day',hours:5}]},3:{status:'off',hours:0,shift:'day'}}}},company:'Sinov zavodi',t:s=>s});
assert.equal(ws.getCell('E7').master.address,'E6');assert.equal(ws.getCell('E6').value,8);assert.equal(ws.getCell('F6').value,8);assert.equal(ws.getCell('F7').value,4);assert.notEqual(ws.getCell('F7').master.address,'F6');assert.equal(ws.getCell('G7').master.address,'G6');assert.equal(ws.getCell('G6').value,'D');assert.equal(ws.getCell('AI6').value.result,3);assert.equal(ws.getCell('AJ6').value.result,28);assert.equal(ws.getCell('AK6').value.result,20);assert.equal(ws.getCell('AL6').value.result,8);
const again=new Excel.Workbook();await again.xlsx.load(await wb.xlsx.writeBuffer());assert.equal(again.worksheets[0].getCell('E7').master.address,'E6');assert.equal(again.worksheets[0].getCell('F7').value,4);
const blank=new Excel.Workbook();const feb=buildTimesheet(blank,{month:'2028-02',employees:[{id:'e',code:'1',name:'Sinov'}],doc:{attendance:{},normHours:168,status:'draft'},t:s=>s,blank:true});assert.equal(feb.getCell('E7').master.address,'E6');assert.equal(feb.getCell('AG4').value,29);
console.log('PASS one/two shift validation, legacy compatibility, XLSX merged/split cells, totals, leap February and blank forms');
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


 const e=await ok('/hr/employees','POST',{code:'TS',name:'Ikki smena xodimi',hireDate:'2026-10-01'});
 await ok('/hr/months','POST',{month:'2026-11',normHours:168});await ok('/hr/rates/'+e.id,'POST',{effectiveDate:'2026-10-01',salary:1680000,coefficient:0});let m=await ok('/hr/months/2026-11');
 await ok('/hr/months/2026-11/attendance/'+e.id,'PUT',{version:m.version,days:{1:legacy,2:two,16:{status:'work',shift:'night',hours:8,shiftCount:2,shifts:[{shift:'night',hours:3},{shift:'day',hours:5}]}}},users.usta);
 m=await ok('/hr/months/2026-11');assert.equal(m.attendance[e.id][2].shifts[1].hours,4);assert.equal(m.payroll[0].hours,28);assert.equal(m.payroll[0].workedDays,3);assert.equal(m.payroll[0].base,280000);
 assert.equal((await call('/hr/months/2026-11/attendance/'+e.id,'PUT',{version:m.version,days:{2:{...two,hours:2}}},users.kadrlar)).status,400);
 assert.equal((await ok('/hr/months/2026-11')).version,m.version);
 await ok('/hr/months/2026-11/approve','POST',{version:m.version});m=await ok('/hr/months/2026-11');assert.equal(m.payroll[0].hours,28);
 assert.equal((await call('/hr/months/2026-11/attendance/'+e.id,'PUT',{version:m.version,days:{}},users.usta)).status,409);
 console.log('PASS API two-shift round trip, day counted once, payroll totals, atomic invalid-input rejection and frozen month protection');
}finally{if(server)await new Promise(resolve=>server.close(resolve));await getPool().end();await management.query('DROP SCHEMA '+schema+' CASCADE');await management.end();}
