import { validDate,ValidationError } from './valid.js';
import { text,today } from './payroll.js';
export const PERSONNEL_ROLES=['admin','rahbar','kadrlar'];
export const DOCUMENT_APPROVERS=['admin','rahbar'];
export const TERMINATION_ROLES=['admin','kadrlar'];
export const DOSSIER_SLOTS=['passport','residence','criminal','narcology','psych','medical086','photo','diploma','experience','military','pinfl','signed'];
export const LABOUR_SOURCE='https://lex.uz/docs/-6257288';
export const LABOUR_CHECKED='2026-11-03';
export function cleanProfile(p={}) {
 if(!p||typeof p!=='object'||Array.isArray(p))throw new ValidationError('Shaxsiy ma’lumot formati noto‘g‘ri');
 const out={};
 for(const key of ['birthDate','passportIssued','passportExpiry']){
  if(p[key]&&!validDate(p[key]))throw new ValidationError('Shaxsiy ma’lumotdagi sana noto‘g‘ri');out[key]=p[key]||'';
 }
 if(out.birthDate&&out.birthDate>today())throw new ValidationError('Tug‘ilgan sana kelajakda bo‘lmaydi');
 for(const key of ['address','currentAddress','passportIssuer','education','specialty','previousEmployment'])out[key]=text(p[key],500);
 for(const key of ['birthPlace','citizenship','gender','maritalStatus','emergencyName','emergencyPhone','phone2','diplomaNumber'])out[key]=text(p[key],120);
 out.passport=text(p.passport,30).toUpperCase();out.pinfl=text(p.pinfl,14);
 if(out.passport&&!/^[A-Z0-9 -]{5,30}$/.test(out.passport))throw new ValidationError('Pasport yoki ID raqami noto‘g‘ri');
 if(p.pinfl&&!/^\d{14}$/.test(String(p.pinfl)))throw new ValidationError('JShShIR 14 ta raqamdan iborat bo‘lsin');
 if(out.passportIssued&&out.passportExpiry&&out.passportIssued>out.passportExpiry)throw new ValidationError('Pasport amal qilish sanalari noto‘g‘ri');
 out.dossier={};
 for(const slot of DOSSIER_SLOTS){
  const v=p.dossier?.[slot];if(!v)continue;
  if(!['pending','received','not_applicable'].includes(v.status))throw new ValidationError('Delo hujjati holati noto‘g‘ri');
  out.dossier[slot]={status:v.status,note:text(v.note,500)};
 }
 return out;
}
export function employeeSnapshot(e){return {id:e.id,code:e.code,name:e.name,position:e.position,department:e.department,hireDate:e.hireDate,endDate:e.endDate,phone:e.phone,profile:e.profile,version:e.version};}
export async function seedHiringDocs(c,req,e) {
 const employer=(await c.query('SELECT profile FROM hr_employers WHERE factory_id=$1',[req.factoryId])).rows[0]?.profile||{company:req.factory?.name||''};
 const payload={employee:employeeSnapshot(e),employer,terms:{position:e.position,department:e.department,startDate:e.hireDate},legalSource:LABOUR_SOURCE,legalChecked:LABOUR_CHECKED};
 const actor={id:req.user.id,name:req.user.name||req.user.username};
 const contract=(await c.query("INSERT INTO hr_employment_docs(factory_id,employee_id,kind,date,effective_date,payload,created_by) VALUES($1,$2,'contract',$3,$4,$5,$6) RETURNING id",[req.factoryId,e.id,today(),e.hireDate,payload,actor])).rows[0];
 await c.query("INSERT INTO hr_employment_docs(factory_id,employee_id,kind,date,effective_date,payload,created_by,related_id) VALUES($1,$2,'hire',$3,$4,$5,$6,$7)",[req.factoryId,e.id,today(),e.hireDate,payload,actor,contract.id]);
}
