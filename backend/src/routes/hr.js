import { Router } from 'express';
import { one, rows, tx } from '../db.js';
import { isId, validDate, validMonth, ValidationError, ConflictError } from '../valid.js';
import { PAY_ROLES, HR_ROLES, TIME_ROLES, money, number, text, today, monthEnd, cleanDays, calculatePayroll, withPayments, inMonth } from '../payroll.js';
import workforce from './workforce.js';
const r=Router();
const actor=req=>({id:req.user.id,name:req.user.name||req.user.username});
const guard=roles=>(req,res,next)=>roles.includes(req.user.role)?next():res.status(403).json({error:"Sizda bu amal uchun ruxsat yo'q"});
r.use(guard(TIME_ROLES));
r.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
r.use(workforce);
const event=(c,req,action,id,detail={})=>c.query('INSERT INTO hr_events(factory_id,actor,action,entity_id,detail) VALUES($1,$2,$3,$4,$5)',[req.factoryId,actor(req),action,id,JSON.stringify(detail)]);
const lock=(c,f)=>c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,8172))',[f]);
const invalidateDrafts=(c,f)=>c.query("UPDATE hr_months SET version=version+1,updated_at=now() WHERE factory_id=$1 AND status='draft'",[f]);
function version(doc,b) { if (!Number.isInteger(b.version)||b.version!==doc.version) throw new ConflictError("Ma'lumot o'zgargan. Qayta yuklang va solishtiring"); }
function date(v,label,optional=false) { if (optional&&!v) return ''; if (!validDate(v)) throw new ValidationError(`${label}: sana noto'g'ri`); return v; }
async function employee(c,f,id) {
  if (!isId(id)) throw new ValidationError("Xodim topilmadi");
  const e=await one('SELECT * FROM hr_employees WHERE factory_id=$1 AND id=$2',[f,id],c);
  if (!e) throw new ValidationError("Xodim topilmadi"); return e;
}
async function getMonth(c,f,m) {
  if (!validMonth(m)) throw new ValidationError('Oy formati YYYY-MM');
  const doc=await one('SELECT * FROM hr_months WHERE factory_id=$1 AND month=$2',[f,m],c);
  if (!doc) throw new ValidationError("Avval oyni yarating"); return doc;
}
function draft(m) { if (m.status!=='draft') throw new ConflictError("Tasdiqlangan oy tahrirlanmaydi"); }
async function bump(c,f,m) { return one('UPDATE hr_months SET version=version+1,updated_at=now() WHERE factory_id=$1 AND month=$2 RETURNING *',[f,m],c); }
async function monthData(c,f,m) {
  const employees=await rows('SELECT * FROM hr_employees WHERE factory_id=$1 ORDER BY department,name',[f],c);
  const rates=await rows('SELECT * FROM hr_rates WHERE factory_id=$1 ORDER BY effective_date',[f],c);
  const payments=await rows('SELECT * FROM hr_payments WHERE factory_id=$1 AND month=$2 ORDER BY created_at DESC,id',[f,m.month],c);
  const prev=await one('SELECT * FROM hr_months WHERE factory_id=$1 AND month<$2 ORDER BY month DESC LIMIT 1',[f,m.month],c);
  let previous=[];
  if (prev?.status==='closed') {
    const oldPayments=await rows('SELECT * FROM hr_payments WHERE factory_id=$1 AND month=$2',[f,prev.month],c);
    previous=withPayments(prev.snapshot,oldPayments);
  }
  const payroll=m.status==='draft'?calculatePayroll(m,employees,rates,previous,payments):withPayments(m.snapshot,payments);
  return {payroll,payments,previousMonth:prev?.month||null,previousClosed:!prev||prev.status==='closed'};
}
async function frozenThrough(c,f) { const x=await one("SELECT max(month) AS month FROM hr_months WHERE factory_id=$1 AND status<>'draft'",[f],c); return x.month?monthEnd(x.month):''; }
const write=fn=>async(req,res)=>res.json(await tx(async c=>{await lock(c,req.factoryId);return fn(c,req);}));

r.get('/employees',async(req,res)=>{
  const list=await rows('SELECT * FROM hr_employees WHERE factory_id=$1 ORDER BY department,name',[req.factoryId]);
  const full=HR_ROLES.includes(req.user.role);
  res.json(list.map(e=>full?e:({id:e.id,code:e.code,name:e.name,position:e.position,department:e.department,hireDate:e.hireDate,endDate:e.endDate})));
});
function profile(b) {
  const out={code:text(b.code,40),name:text(b.name),position:text(b.position),department:text(b.department),phone:text(b.phone,40),hireDate:date(b.hireDate,'Ishga kirish'),endDate:date(b.endDate,'Ishdan chiqish',true),notes:text(b.notes,1500)};
  if (!out.code||!out.name) throw new ValidationError("Tabel raqami va F.I.Sh. majburiy");
  if (out.endDate && out.endDate<out.hireDate) throw new ValidationError("Ishdan chiqish sanasi ishga kirishdan oldin");
  const p=b.profile||{};
  out.profile={birthDate:date(p.birthDate,'Tug‘ilgan sana',true),address:text(p.address,300),emergencyName:text(p.emergencyName),emergencyPhone:text(p.emergencyPhone,40)};
  if(out.profile.birthDate&&out.profile.birthDate>out.hireDate)throw new ValidationError('Tug‘ilgan sana ishga kirishdan keyin bo‘lishi mumkin emas');
  return out;
}
r.post('/employees',guard(HR_ROLES),write(async(c,req)=>{
  const v=profile(req.body||{});
  const doc=await one('INSERT INTO hr_employees(factory_id,code,name,position,department,phone,hire_date,end_date,notes,profile) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',[req.factoryId,...Object.values(v).map(x=>typeof x==='object'?JSON.stringify(x):x)],c);
  await invalidateDrafts(c,req.factoryId);await event(c,req,'employee.create',doc.id,v); return doc;
}));
r.put('/employees/:id',guard(HR_ROLES),write(async(c,req)=>{
  const e=await employee(c,req.factoryId,req.params.id); version(e,req.body||{}); const v=profile({...req.body,profile:req.body?.profile??e.profile});
  const months=await rows('SELECT month,attendance FROM hr_months WHERE factory_id=$1',[req.factoryId],c);
  for (const m of months) if (m.attendance[e.id]) cleanDays(m.attendance[e.id],m.month,v);
  const outside=await one("SELECT id FROM hr_records WHERE factory_id=$1 AND employee_id=$2 AND kind IN ('leave','shift') AND status='approved' AND (start_date<$3 OR ($4<>'' AND end_date>$4))",[req.factoryId,e.id,v.hireDate,v.endDate],c);
  if(outside)throw new ConflictError('Tasdiqlangan ta’til yoki smena ish davridan tashqarida qolmoqda');
  const frozen=await frozenThrough(c,req.factoryId);
  if ((v.hireDate!==e.hireDate && (v.hireDate<=frozen||e.hireDate<=frozen)) || (v.endDate!==e.endDate && [v.endDate,e.endDate].filter(Boolean).some(d=>d<=frozen)))
    throw new ConflictError("Tasdiqlangan davrdagi ish sanalarini o'zgartirib bo'lmaydi");
  const doc=await one('UPDATE hr_employees SET code=$3,name=$4,position=$5,department=$6,phone=$7,hire_date=$8,end_date=$9,notes=$10,profile=$11,version=version+1,updated_at=now() WHERE factory_id=$1 AND id=$2 RETURNING *',[req.factoryId,e.id,...Object.values(v).map(x=>typeof x==='object'?JSON.stringify(x):x)],c);
  await invalidateDrafts(c,req.factoryId);await event(c,req,'employee.update',e.id,{before:e,after:doc}); return doc;
}));
r.get('/rates/:id',guard(PAY_ROLES),async(req,res)=>{
  await employee(null,req.factoryId,req.params.id);
  res.json(await rows('SELECT * FROM hr_rates WHERE factory_id=$1 AND employee_id=$2 ORDER BY effective_date DESC',[req.factoryId,req.params.id]));
});
r.post('/rates/:id',guard(PAY_ROLES),write(async(c,req)=>{
  const e=await employee(c,req.factoryId,req.params.id); const b=req.body||{}; const effective=date(b.effectiveDate,'Amal sanasi');
  if (effective<e.hireDate || (e.endDate&&effective>e.endDate)) throw new ValidationError("Maosh sanasi ish davriga mos emas");
  if (effective<=await frozenThrough(c,req.factoryId)) throw new ConflictError("Tasdiqlangan davr uchun maosh o'zgarmaydi");
  const rate=await one('INSERT INTO hr_rates(factory_id,employee_id,effective_date,salary,coefficient,grade,reason,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[req.factoryId,e.id,effective,number(b.salary,'Maosh'),number(b.coefficient,'Koeffitsiyent haqi'),text(b.grade,40),text(b.reason,300),actor(req)],c);
  await invalidateDrafts(c,req.factoryId);await event(c,req,'rate.create',e.id,rate); return rate;
}));
r.put('/rates/:id',guard(PAY_ROLES),write(async(c,req)=>{
  if (!isId(req.params.id)) throw new ValidationError("Maosh topilmadi");
  const old=await one('SELECT * FROM hr_rates WHERE factory_id=$1 AND id=$2',[req.factoryId,req.params.id],c);
  if (!old) throw new ValidationError("Maosh topilmadi");
  const b=req.body||{};version(old,b);const e=await employee(c,req.factoryId,old.employeeId),effective=date(b.effectiveDate,'Amal sanasi');
  const frozen=await frozenThrough(c,req.factoryId);
  if (old.effectiveDate<=frozen||effective<=frozen) throw new ConflictError("Tasdiqlangan davr uchun maosh o'zgarmaydi");
  if (effective<e.hireDate||(e.endDate&&effective>e.endDate)) throw new ValidationError("Maosh sanasi ish davriga mos emas");
  const rate=await one('UPDATE hr_rates SET effective_date=$3,salary=$4,coefficient=$5,grade=$6,reason=$7,version=version+1 WHERE factory_id=$1 AND id=$2 RETURNING *',[req.factoryId,old.id,effective,number(b.salary,'Maosh'),number(b.coefficient,'Koeffitsiyent haqi'),text(b.grade,40),text(b.reason,300)],c);
  await invalidateDrafts(c,req.factoryId);await event(c,req,'rate.update',e.id,{before:old,after:rate});return rate;
}));
r.get('/months',async(req,res)=>res.json(await rows('SELECT month,status,version,norm_hours FROM hr_months WHERE factory_id=$1 ORDER BY month DESC',[req.factoryId])));
r.post('/months',guard(HR_ROLES),write(async(c,req)=>{
  const b=req.body||{}; monthEnd(b.month);
  const latest=await frozenThrough(c,req.factoryId);
  if (`${b.month}-01`<=latest) throw new ConflictError("Oldingi tasdiqlangan oydan avval yangi oy ochib bo'lmaydi");
  const m=await one('INSERT INTO hr_months(factory_id,month,norm_hours,tax_rate,work_days,holidays) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[req.factoryId,b.month,number(b.normHours,'Oy normasi',.01,744),12,JSON.stringify([1,2,3,4,5]),'[]'],c);
  await event(c,req,'month.create',m.month,{normHours:m.normHours}); return {month:m.month,version:m.version};
}));
r.get('/months/:month',async(req,res)=>{
  const data=await tx(async c=>{
    await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
    const m=await getMonth(c,req.factoryId,req.params.month);
    const {taxRate,adjustments,snapshot,approvedBy,closedBy,...safe}=m;
    return {...safe,...(PAY_ROLES.includes(req.user.role)?{taxRate,adjustments,approvedBy,closedBy,...await monthData(c,req.factoryId,m)}:{})};
  });res.json(data);
});
r.put('/months/:month/settings',guard(HR_ROLES),write(async(c,req)=>{
  const m=await getMonth(c,req.factoryId,req.params.month); draft(m);const b=req.body||{};version(m,b);
  const days=b.workDays;
  if (!Array.isArray(days)||!days.length||days.length>7||days.some(d=>!Number.isInteger(d)||d<0||d>6)||new Set(days).size!==days.length) throw new ValidationError("Ish haftasi noto'g'ri");
  if (!Array.isArray(b.holidays)||b.holidays.length>31||b.holidays.some(d=>!validDate(d)||!d.startsWith(m.month+'-'))) throw new ValidationError("Dam olish sanalari noto'g'ri");
  const norm=number(b.normHours,'Oy normasi',.01,744);
  const tax=PAY_ROLES.includes(req.user.role)?number(b.taxRate,'Soliq foizi',0,100):m.taxRate;
  await c.query('UPDATE hr_months SET norm_hours=$3,tax_rate=$4,work_days=$5,holidays=$6 WHERE factory_id=$1 AND month=$2',[req.factoryId,m.month,norm,tax,JSON.stringify(days),JSON.stringify(b.holidays)]);
  await event(c,req,'month.settings',m.month,{normHours:norm,taxRate:tax,workDays:days,holidays:b.holidays});
  const n=await bump(c,req.factoryId,m.month);return {version:n.version};
}));
r.put('/months/:month/attendance/:id',write(async(c,req)=>{
  const m=await getMonth(c,req.factoryId,req.params.month); draft(m);version(m,req.body||{});
  const e=await employee(c,req.factoryId,req.params.id);
  if (!inMonth(e,m.month)) throw new ValidationError("Xodim bu oyda ishlamagan");
  const days=cleanDays(req.body.days,m.month,e);
  const attendance={...m.attendance,[e.id]:days};
  await c.query('UPDATE hr_months SET attendance=$3 WHERE factory_id=$1 AND month=$2',[req.factoryId,m.month,JSON.stringify(attendance)]);
  await event(c,req,'attendance.save',e.id,{month:m.month,before:m.attendance[e.id]||{},after:days});
  return {version:(await bump(c,req.factoryId,m.month)).version};
}));
r.put('/months/:month/adjustments/:id',guard(PAY_ROLES),write(async(c,req)=>{
  const m=await getMonth(c,req.factoryId,req.params.month);draft(m);version(m,req.body||{});
  const e=await employee(c,req.factoryId,req.params.id),b=req.body||{};
  const v={extra:number(b.extra,'Qo‘shimcha'),tripPay:number(b.tripPay,'Xizmat safari'),deductions:number(b.deductions,'Ushlanma'),openingBalance:number(b.openingBalance,'Boshlang‘ich qarz',-1e10),note:text(b.note,300)};
  const previous=await one('SELECT month,snapshot FROM hr_months WHERE factory_id=$1 AND month<$2 ORDER BY month DESC LIMIT 1',[req.factoryId,m.month],c);
  if (previous?.snapshot?.some(r=>r.employeeId===e.id) && v.openingBalance!==0) throw new ValidationError("Oldingi oy mavjud: qarz avtomatik olinadi");
  if (!inMonth(e,m.month)&&!previous) throw new ValidationError("Xodim bu oyda ishlamagan");
  await c.query('UPDATE hr_months SET adjustments=$3 WHERE factory_id=$1 AND month=$2',[req.factoryId,m.month,JSON.stringify({...m.adjustments,[e.id]:v})]);
  await event(c,req,'payroll.adjust',e.id,{month:m.month,before:m.adjustments[e.id]||{},after:v});return {version:(await bump(c,req.factoryId,m.month)).version};
}));
r.post('/months/:month/approve',guard(PAY_ROLES),write(async(c,req)=>{
  const m=await getMonth(c,req.factoryId,req.params.month);draft(m);version(m,req.body||{});
  const data=await monthData(c,req.factoryId,m);
  if (!data.previousClosed) throw new ConflictError("Avval oldingi oyni yoping");
  if (!data.payroll.length) throw new ValidationError("Hisoblash uchun xodim yo'q");
  if (data.payroll.some(p=>p.missingRates.length)) throw new ValidationError("Ishlangan kunlar uchun maosh belgilanmagan");
  await c.query("UPDATE hr_months SET status='approved',snapshot=$3,approved_by=$4 WHERE factory_id=$1 AND month=$2",[req.factoryId,m.month,JSON.stringify(data.payroll),actor(req)]);
  await event(c,req,'payroll.approve',m.month,{count:data.payroll.length});return {version:(await bump(c,req.factoryId,m.month)).version};
}));
r.post('/months/:month/close',guard(PAY_ROLES),write(async(c,req)=>{
  const m=await getMonth(c,req.factoryId,req.params.month);version(m,req.body||{});
  if (m.status!=='approved') throw new ConflictError("Avval oylikni tasdiqlang");
  await c.query("UPDATE hr_months SET status='closed',closed_by=$3 WHERE factory_id=$1 AND month=$2",[req.factoryId,m.month,actor(req)]);
  await event(c,req,'payroll.close',m.month);return {version:(await bump(c,req.factoryId,m.month)).version};
}));
r.post('/months/:month/payments',guard(PAY_ROLES),write(async(c,req)=>{
  const b=req.body||{},f=req.factoryId;const m=await getMonth(c,f,req.params.month);
  if (!isId(b.requestId)) throw new ValidationError("To'lov kaliti noto'g'ri");
  const amount=number(b.amount,"To'lov",.01),note=text(b.note,300);
  date(b.date,"To'lov");
  if (b.date>today()) throw new ValidationError("Kelajakdagi to'lov kiritilmaydi");
  if (!['cash','card'].includes(b.method)||!['advance','salary'].includes(b.kind)) throw new ValidationError("To'lov turi noto'g'ri");
  const duplicate=await one('SELECT * FROM hr_payments WHERE factory_id=$1 AND request_id=$2',[f,b.requestId],c);
  if (duplicate) {
    if (duplicate.month!==m.month||duplicate.employeeId!==b.employeeId||duplicate.amount!==amount||duplicate.date!==b.date||duplicate.method!==b.method||duplicate.kind!==b.kind||duplicate.note!==note) throw new ConflictError("To'lov kaliti boshqa yozuvda ishlatilgan");
    return {payment:duplicate,version:m.version};
  }
  version(m,b);if (m.status==='closed') throw new ConflictError("Yopilgan oyda to'lov o'zgarmaydi");
  await employee(c,f,b.employeeId);
  const data=await monthData(c,f,m);
  if (!data.payroll.some(p=>p.employeeId===b.employeeId)) throw new ValidationError("Xodim bu oy hisobida yo'q");
  const pay=await one('INSERT INTO hr_payments(factory_id,month,employee_id,date,method,kind,amount,note,request_id,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',[f,m.month,b.employeeId,b.date,b.method,b.kind,amount,note,b.requestId,actor(req)],c);
  await event(c,req,'payment.create',pay.id,pay);return {payment:pay,version:(await bump(c,f,m.month)).version};
}));
r.post('/months/:month/payments/:id/void',guard(PAY_ROLES),write(async(c,req)=>{
  const m=await getMonth(c,req.factoryId,req.params.month);version(m,req.body||{});
  if (m.status==='closed') throw new ConflictError("Yopilgan oyda to'lov o'zgarmaydi");
  const reason=text(req.body.reason,300);if (!reason) throw new ValidationError("Bekor qilish sababini yozing");
  if (!isId(req.params.id)) throw new ValidationError("To'lov topilmadi");
  const pay=await one('UPDATE hr_payments SET voided_at=now(),voided_by=$4,void_reason=$5 WHERE factory_id=$1 AND month=$2 AND id=$3 AND voided_at IS NULL RETURNING *',[req.factoryId,m.month,req.params.id,actor(req),reason],c);
  if (!pay) throw new ConflictError("To'lov topilmadi yoki bekor qilingan");
  await event(c,req,'payment.void',pay.id,{reason});return {version:(await bump(c,req.factoryId,m.month)).version};
}));
r.get('/events',guard(PAY_ROLES),async(req,res)=>res.json(await rows('SELECT * FROM hr_events WHERE factory_id=$1 ORDER BY created_at DESC,id DESC LIMIT 200',[req.factoryId])));
export default r;
