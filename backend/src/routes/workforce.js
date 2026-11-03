import { Router } from 'express';
import { one,rows,tx } from '../db.js';
import { isId,validDate,ValidationError,ConflictError } from '../valid.js';
import { HR_ROLES,text,number,today,cleanDays } from '../payroll.js';
import { KINDS,DECIDERS,annualDays,plannedDays } from '../workforce.js';
const r=Router();
const guard=roles=>(req,res,next)=>roles.includes(req.user.role)?next():res.status(403).json({error:"Sizda bu amal uchun ruxsat yo'q"});
const actor=req=>({id:req.user.id,name:req.user.name||req.user.username});
const write=fn=>async(req,res)=>res.json(await tx(async c=>{
 req.body ||= {};await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,8172))',[req.factoryId]);return fn(c,req);
}));
const event=(c,req,action,id,detail)=>c.query('INSERT INTO hr_events(factory_id,actor,action,entity_id,detail) VALUES($1,$2,$3,$4,$5)',[req.factoryId,actor(req),action,id,JSON.stringify(detail)]);
function version(row,b) {if(!Number.isInteger(b.version)||b.version!==row.version)throw new ConflictError('Ma’lumot o‘zgargan. Qayta yuklang');}
async function employee(c,f,id) {
 if(!isId(id))throw new ValidationError('Xodim topilmadi');
 const e=await one('SELECT * FROM hr_employees WHERE factory_id=$1 AND id=$2',[f,id],c);
 if(!e)throw new ValidationError('Xodim topilmadi');return e;
}
async function record(c,req) {
 if(!isId(req.params.id))throw new ValidationError('Yozuv topilmadi');
 const v=await one('SELECT * FROM hr_records WHERE factory_id=$1 AND id=$2',[req.factoryId,req.params.id],c);
 if(!v)throw new ValidationError('Yozuv topilmadi');return v;
}
function clean(b,e) {
 if(!KINDS.includes(b.kind))throw new ValidationError('Yozuv turi noto‘g‘ri');
 if(!validDate(b.startDate)||!validDate(b.endDate)||b.startDate>b.endDate||(['leave','shift'].includes(b.kind)&&+b.endDate.slice(0,4)-+b.startDate.slice(0,4)>2))throw new ValidationError('Sana oralig‘i noto‘g‘ri yoki juda uzun');
 if(['leave','shift'].includes(b.kind)&&(b.startDate<e.hireDate||(e.endDate&&b.endDate>e.endDate)))throw new ValidationError('Sana xodimning ish davriga mos emas');
 const title=text(b.title,160);if(!title)throw new ValidationError('Nomi majburiy');
 const d=b.detail||{};const detail={note:text(d.note,1500),number:text(d.number,100)};
 if(b.kind==='leave'){
  if(!['annual','unpaid'].includes(d.leaveType))throw new ValidationError('Ta’til turi noto‘g‘ri');detail.leaveType=d.leaveType;
 }
 if(b.kind==='shift'){
  if(!['day','night'].includes(d.shift)||!Array.isArray(d.workDays)||!d.workDays.length||d.workDays.length>7||new Set(d.workDays).size!==d.workDays.length||d.workDays.some(x=>!Number.isInteger(x)||x<0||x>6))throw new ValidationError('Smena jadvali noto‘g‘ri');
  Object.assign(detail,{shift:d.shift,workDays:d.workDays,hours:number(d.hours,'Ish soati',.25,24)});
 }
 if(b.kind==='document'){
  if(!['contract','medical','safety','qualification','other'].includes(d.docType))throw new ValidationError('Hujjat turi noto‘g‘ri');detail.docType=d.docType;
 }
 if(b.kind==='order'){
  if(!['hire','transfer','salary','termination','other'].includes(d.orderType))throw new ValidationError('Buyruq turi noto‘g‘ri');detail.orderType=d.orderType;
 }
 if(b.kind==='equipment')detail.quantity=number(d.quantity,'Miqdor',.01,100000);
 return {kind:b.kind,title,startDate:b.startDate,endDate:b.endDate,detail};
}
async function checkApproval(c,f,v) {
 clean(v,await employee(c,f,v.employeeId));
 if(['leave','shift'].includes(v.kind)) {
  const overlap=await one("SELECT id FROM hr_records WHERE factory_id=$1 AND employee_id=$2 AND kind=$3 AND status='approved' AND id<>$4 AND start_date<=$5 AND end_date>=$6",[f,v.employeeId,v.kind,v.id,v.endDate,v.startDate],c);
  if(overlap)throw new ConflictError('Bu davrda tasdiqlangan yozuv mavjud');
 }
 if(v.kind==='leave'&&v.detail.leaveType==='annual') {
  const previous=await rows("SELECT * FROM hr_records WHERE factory_id=$1 AND employee_id=$2 AND kind='leave' AND status='approved'",[f,v.employeeId],c);
  for(let year=+v.startDate.slice(0,4);year<=+v.endDate.slice(0,4);year++){
   const a=await one('SELECT * FROM hr_leave_allowances WHERE factory_id=$1 AND employee_id=$2 AND year=$3',[f,v.employeeId,year],c);
   if(!a)throw new ValidationError('Avval shu yil uchun ta’til limitini kiriting');
   const used=previous.reduce((s,x)=>s+annualDays(x,year),a.usedBefore);
   if(used+annualDays({...v,status:'approved'},year)>a.days)throw new ConflictError('Ta’til qoldig‘i yetarli emas');
  }
 }
}
r.get('/workforce',guard(HR_ROLES),async(req,res)=>{
 const data=await tx(async c=>{
  await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
  const employees=await rows('SELECT * FROM hr_employees WHERE factory_id=$1 ORDER BY department,name',[req.factoryId],c);
  const records=await rows('SELECT * FROM hr_records WHERE factory_id=$1 ORDER BY start_date DESC,created_at DESC',[req.factoryId],c);
  const allowances=await rows('SELECT * FROM hr_leave_allowances WHERE factory_id=$1 ORDER BY year DESC',[req.factoryId],c);
  const events=await rows("SELECT id,actor,action,entity_id,created_at FROM hr_events WHERE factory_id=$1 AND action LIKE 'workforce.%' ORDER BY created_at DESC,id DESC LIMIT 50",[req.factoryId],c);
  const date=today(),month=await one('SELECT attendance FROM hr_months WHERE factory_id=$1 AND month=$2',[req.factoryId,date.slice(0,7)],c);
  const day=String(+date.slice(8)),active=employees.filter(e=>e.hireDate<=date&&(!e.endDate||e.endDate>=date));
  return {date,employees,records,allowances,events,summary:{active:active.length,marked:active.filter(e=>month?.attendance[e.id]?.[day]).length,atWork:active.filter(e=>['work','trip'].includes(month?.attendance[e.id]?.[day]?.status)).length,pending:records.filter(x=>x.status==='draft').length,onLeave:records.filter(x=>x.kind==='leave'&&x.status==='approved'&&x.startDate<=date&&x.endDate>=date).length}};
 });res.json(data);
});
r.post('/workforce/records',guard(HR_ROLES),write(async(c,req)=>{
 const e=await employee(c,req.factoryId,req.body.employeeId),v=clean(req.body,e);
 const doc=await one('INSERT INTO hr_records(factory_id,employee_id,kind,title,start_date,end_date,detail,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[req.factoryId,e.id,v.kind,v.title,v.startDate,v.endDate,JSON.stringify(v.detail),actor(req)],c);
 await event(c,req,'workforce.create',e.id,{recordId:doc.id,...v});return doc;
}));
r.put('/workforce/records/:id',guard(HR_ROLES),write(async(c,req)=>{
 const old=await record(c,req);version(old,req.body);if(old.status!=='draft')throw new ConflictError('Faqat qoralama tahrirlanadi');
 if(req.body.kind!==old.kind||req.body.employeeId!==old.employeeId)throw new ValidationError('Xodim yoki yozuv turi o‘zgartirilmaydi');
 const e=await employee(c,req.factoryId,old.employeeId),v=clean(req.body,e);
 const doc=await one('UPDATE hr_records SET title=$3,start_date=$4,end_date=$5,detail=$6,version=version+1,updated_at=now() WHERE factory_id=$1 AND id=$2 RETURNING *',[req.factoryId,old.id,v.title,v.startDate,v.endDate,JSON.stringify(v.detail)],c);
 await event(c,req,'workforce.update',e.id,{before:old,after:doc});return doc;
}));
r.post('/workforce/records/:id/decision',guard(DECIDERS),write(async(c,req)=>{
 const old=await record(c,req);version(old,req.body);const {status}=req.body,reason=text(req.body.reason,500);
 if(!((old.status==='draft'&&status==='approved')||(['draft','approved'].includes(old.status)&&status==='cancelled')||(old.status==='approved'&&['equipment','document','order'].includes(old.kind)&&status==='completed')))throw new ConflictError('Holatni bunday o‘zgartirib bo‘lmaydi');
 if(status==='cancelled'&&!reason)throw new ValidationError('Bekor qilish sababini yozing');
 if(old.detail.appliedAt&&status==='cancelled'){
  const months=await rows('SELECT * FROM hr_months WHERE factory_id=$1 AND month>=$2 AND month<=$3',[req.factoryId,old.startDate.slice(0,7),old.endDate.slice(0,7)],c);
  if(months.some(m=>m.status!=='draft'))throw new ConflictError('Tasdiqlangan yoki yopilgan oyga qo‘llanmaydi');
  if(plannedDays(old).some(({date,value})=>{
   const actual=months.find(m=>m.month===date.slice(0,7))?.attendance[old.employeeId]?.[String(+date.slice(8))];
   return actual&&['status','hours','shift'].every(k=>actual[k]===value[k]);
  }))throw new ConflictError('Avval tabeldagi tegishli kunlarni tekshirib tuzating');
 }
 if(status==='approved')await checkApproval(c,req.factoryId,old);
 const doc=await one('UPDATE hr_records SET status=$3,reason=$4,decided_by=$5,version=version+1,updated_at=now() WHERE factory_id=$1 AND id=$2 RETURNING *',[req.factoryId,old.id,status,reason,actor(req)],c);
 await event(c,req,'workforce.decision',old.employeeId,{before:old.status,status,recordId:old.id,reason});return doc;
}));
r.post('/workforce/records/:id/apply',guard(DECIDERS),write(async(c,req)=>{
 const old=await record(c,req);version(old,req.body);if(old.status!=='approved')throw new ConflictError('Avval yozuvni tasdiqlang');
 const e=await employee(c,req.factoryId,old.employeeId),groups=new Map();
 for(const {date,value} of plannedDays(old)){
  const m=date.slice(0,7);if(!groups.has(m))groups.set(m,[]);groups.get(m).push([String(+date.slice(8)),value]);
 }
 for(const [month,entries] of groups){
  const m=await one('SELECT * FROM hr_months WHERE factory_id=$1 AND month=$2',[req.factoryId,month],c);
  if(!m)throw new ValidationError('Avval barcha tegishli hisob oylarini oching');
  if(m.status!=='draft')throw new ConflictError('Tasdiqlangan yoki yopilgan oyga qo‘llanmaydi');
  const days={...m.attendance[e.id]};
  for(const [day,v] of entries){
   if(days[day]&&['status','hours','shift'].some(k=>days[day][k]!==v[k]))throw new ConflictError('Tabelda boshqa yozuv bor. Avval kunlarni tekshiring');
   days[day]=v;
  }
  cleanDays(days,month,e);
  await c.query('UPDATE hr_months SET attendance=$3,version=version+1,updated_at=now() WHERE factory_id=$1 AND month=$2',[req.factoryId,month,JSON.stringify({...m.attendance,[e.id]:days})]);
 }
 const doc=await one("UPDATE hr_records SET detail=detail||jsonb_build_object('appliedAt',$3::text),version=version+1,updated_at=now() WHERE factory_id=$1 AND id=$2 RETURNING *",[req.factoryId,old.id,new Date().toISOString()],c);
 await event(c,req,'workforce.apply',e.id,{recordId:old.id,months:[...groups.keys()]});return doc;
}));
r.put('/workforce/allowances/:id/:year',guard(DECIDERS),write(async(c,req)=>{
 const e=await employee(c,req.factoryId,req.params.id),year=Number(req.params.year),b=req.body;
 if(!Number.isInteger(year)||year<1900||year>2200)throw new ValidationError('Yil noto‘g‘ri');
 const days=number(b.days,'Ta’til limiti',0,366),used=number(b.usedBefore,'Avval ishlatilgan',0,days);
 if(!Number.isInteger(days)||!Number.isInteger(used))throw new ValidationError('Kunlar butun son bo‘lishi kerak');
 const old=await one('SELECT * FROM hr_leave_allowances WHERE factory_id=$1 AND employee_id=$2 AND year=$3',[req.factoryId,e.id,year],c);
 if(old)version(old,b);else if(b.version!==0)throw new ConflictError('Qayta yuklang');
 const records=await rows("SELECT * FROM hr_records WHERE factory_id=$1 AND employee_id=$2 AND kind='leave' AND status='approved'",[req.factoryId,e.id],c);
 if(used+records.reduce((s,x)=>s+annualDays(x,year),0)>days)throw new ConflictError('Limit tasdiqlangan ta’tillardan kam bo‘lishi mumkin emas');
 const doc=await one('INSERT INTO hr_leave_allowances(factory_id,employee_id,year,days,used_before) VALUES($1,$2,$3,$4,$5) ON CONFLICT(factory_id,employee_id,year) DO UPDATE SET days=$4,used_before=$5,version=hr_leave_allowances.version+1 RETURNING *',[req.factoryId,e.id,year,days,used],c);
 await event(c,req,'workforce.allowance',e.id,{year,before:old,after:doc});return doc;
}));
export default r;
