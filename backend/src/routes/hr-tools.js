import {Router} from 'express';
import crypto from 'node:crypto';
import {one,rows,tx} from '../db.js';
import {ValidationError,ConflictError,isId,validDate} from '../valid.js';
import {text,today} from '../payroll.js';
import {cleanProfile,seedHiringDocs} from '../personnel.js';
import {ensureDepartment} from '../hr-departments.js';
const r=Router(),roles=['admin','kadrlar'];
const guard=(req,res,next)=>roles.includes(req.user.role)?next():res.status(403).json({error:'Faqat administrator va kadrlar uchun'});
const read=(req,res,next)=>['admin','rahbar','kadrlar'].includes(req.user.role)?next():res.status(403).json({error:'Sizda ruxsat yo‘q'});
const lock=(c,f)=>c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,8172))',[f]);
const audit=(c,req,action,id,detail)=>c.query('INSERT INTO hr_events(factory_id,actor,action,entity_id,detail) VALUES($1,$2,$3,$4,$5)',[req.factoryId,{id:req.user.id,name:req.user.name||req.user.username},action,id,JSON.stringify(detail)]);
const fingerprint=list=>crypto.createHash('sha256').update(JSON.stringify(list.map(e=>[e.id,e.version]).sort())).digest('hex');
function imported(b){
 const v={code:text(b.code,40),name:text(b.name,120),position:text(b.position,120),department:text(b.department,120),phone:text(b.phone,40),hireDate:String(b.hireDate||''),endDate:String(b.endDate||''),notes:text(b.notes,1500),profile:cleanProfile(b.profile||{})};
 if(!v.code||!v.name)throw new ValidationError('Tabel raqami va F.I.Sh. majburiy');
 if((v.hireDate&&!validDate(v.hireDate))||(v.endDate&&(!v.hireDate||!validDate(v.endDate)||v.endDate<v.hireDate)))throw new ValidationError('Sanalarni YYYY-MM-DD ko‘rinishida kiriting');
 if(v.profile.birthDate&&v.hireDate&&v.profile.birthDate>v.hireDate)throw new ValidationError('Tug‘ilgan sana ishga kirishdan keyin');return v;
}
r.post('/employees/import',guard,async(req,res)=>res.json(await tx(async c=>{
 await lock(c,req.factoryId);const b=req.body||{},existing=await rows('SELECT id,version,code,name,profile FROM hr_employees WHERE factory_id=$1',[req.factoryId],c);
 if(!Array.isArray(b.rows)||!b.rows.length||b.rows.length>1000)throw new ValidationError('1–1000 ta xodim yuboring');
 const errors=[],out=[],codes=new Set(existing.map(e=>e.code.toLowerCase())),names=new Set(existing.map(e=>e.name.toLowerCase())),pinfls=new Set(existing.map(e=>e.profile?.pinfl).filter(Boolean));
 b.rows.forEach((row,i)=>{try{const e=imported(row);if(codes.has(e.code.toLowerCase())||names.has(e.name.toLowerCase())||(e.profile.pinfl&&pinfls.has(e.profile.pinfl)))throw new ValidationError('Tabel raqami, F.I.Sh. yoki JShShIR takrorlangan');codes.add(e.code.toLowerCase());names.add(e.name.toLowerCase());if(e.profile.pinfl)pinfls.add(e.profile.pinfl);out.push(e);}catch(e){errors.push({row:i+2,error:e.message});}});
 const mark=fingerprint(existing);if(!b.commit)return {rows:out,errors,count:out.length,fingerprint:mark};
 if(errors.length)throw new ValidationError('Importda xatolar bor. Avval ularni tuzating');
 if(b.fingerprint!==mark)throw new ConflictError('Xodimlar ro‘yxati o‘zgargan. Importni qayta tekshiring');
 for(const e of out){e.department=await ensureDepartment(c,req.factoryId,e.department);const saved=await one('INSERT INTO hr_employees(factory_id,code,name,position,department,phone,hire_date,end_date,notes,profile) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',[req.factoryId,e.code,e.name,e.position,e.department,e.phone,e.hireDate,e.endDate,e.notes,JSON.stringify(e.profile)],c);if(e.hireDate)await seedHiringDocs(c,req,saved);}
 await c.query("UPDATE hr_months SET version=version+1 WHERE factory_id=$1 AND status='draft'",[req.factoryId]);await audit(c,req,'employee.import',req.factoryId,{count:out.length});return {ok:true,count:out.length};
})));
r.get('/staff-positions',read,async(req,res)=>res.json(await rows(
 "SELECT s.*,(SELECT count(*)::int FROM hr_employees e WHERE e.factory_id=s.factory_id AND lower(btrim(e.department))=lower(btrim(s.department)) AND lower(btrim(e.position))=lower(btrim(s.position)) AND e.hire_date<>'' AND e.hire_date<=$2 AND (e.end_date='' OR e.end_date>$2)) AS occupied FROM hr_staff_positions s WHERE s.factory_id=$1 ORDER BY department,position",[req.factoryId,today()])));
for(const method of ['post','put'])r[method]('/staff-positions'+(method==='put'?'/:id':''),guard,async(req,res)=>res.json(await tx(async c=>{
 await lock(c,req.factoryId);const b=req.body||{},position=text(b.position,120),slots=Number(b.slots);if(!position||!Number.isInteger(slots)||slots<0||slots>100000)throw new ValidationError('Lavozim va shtat sonini tekshiring');
 const department=await ensureDepartment(c,req.factoryId,text(b.department,120));let d;
 if(method==='put'){if(!isId(req.params.id))throw new ValidationError('Shtat topilmadi');d=await one('SELECT * FROM hr_staff_positions WHERE factory_id=$1 AND id=$2',[req.factoryId,req.params.id],c);if(!d)throw new ValidationError('Shtat topilmadi');if(d.version!==b.version)throw new ConflictError('Shtat o‘zgargan. Qayta yuklang');}
 if(await one('SELECT id FROM hr_staff_positions WHERE factory_id=$1 AND lower(btrim(department))=lower($2) AND lower(btrim(position))=lower($3) AND ($4::uuid IS NULL OR id<>$4)',[req.factoryId,department,position,d?.id||null],c))throw new ConflictError('Bu bo‘lim va lavozim uchun shtat mavjud');
 const saved=d?await one('UPDATE hr_staff_positions SET department=$3,position=$4,slots=$5,version=version+1 WHERE factory_id=$1 AND id=$2 RETURNING *',[req.factoryId,d.id,department,position,slots],c):await one('INSERT INTO hr_staff_positions(factory_id,department,position,slots) VALUES($1,$2,$3,$4) RETURNING *',[req.factoryId,department,position,slots],c);
 await audit(c,req,'staff.save',saved.id,{department,position,slots});return saved;
})));
r.delete('/staff-positions/:id',guard,async(req,res)=>res.json(await tx(async c=>{await lock(c,req.factoryId);if(!isId(req.params.id))throw new ValidationError('Shtat topilmadi');const d=await one('DELETE FROM hr_staff_positions WHERE factory_id=$1 AND id=$2 AND version=$3 RETURNING *',[req.factoryId,req.params.id,req.body?.version],c);if(!d)throw new ConflictError('Shtat o‘zgargan. Qayta yuklang');await audit(c,req,'staff.delete',d.id,{position:d.position});return {ok:true};})));
r.get('/reminders',read,async(req,res)=>{
 const day=today(),end=new Date(Date.parse(day)+30*86400000).toISOString().slice(0,10),items=[];
 const employees=await rows("SELECT id,code,name,profile FROM hr_employees WHERE factory_id=$1 AND (end_date='' OR end_date>$2)",[req.factoryId,day]),byId=new Map(employees.map(e=>[e.id,e]));
 const add=(id,e,title,date)=>{if(!validDate(date)||date>end)return;items.push({id,employeeId:e.id,name:e.name,code:e.code,title,date,days:Math.round((Date.parse(date)-Date.parse(day))/86400000)});};
 for(const e of employees)if(e.profile?.passportExpiry)add('passport:'+e.id,e,'Pasport / ID amal qilish muddati',e.profile.passportExpiry);
 for(const d of await rows("SELECT id,employee_id,title,end_date FROM hr_records WHERE factory_id=$1 AND kind IN ('document','equipment') AND status='approved'",[req.factoryId])){const e=byId.get(d.employeeId);if(e)add(d.id,e,d.title,d.endDate);}
 const contracts=await rows("SELECT DISTINCT ON (employee_id) id,employee_id,payload FROM hr_employment_docs WHERE factory_id=$1 AND kind='contract' AND status='issued' ORDER BY employee_id,effective_date DESC,created_at DESC",[req.factoryId]);for(const d of contracts){const e=byId.get(d.employeeId);if(e&&d.payload.terms?.termType==='fixed')add(d.id,e,'Mehnat shartnomasi muddati',d.payload.terms.endDate);}
 res.set('Cache-Control','no-store');res.json({today:day,items:items.sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name)),dueDays:30});
});export default r;
