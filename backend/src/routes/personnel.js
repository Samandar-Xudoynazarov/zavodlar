import { Router,raw } from 'express';
import { one,rows,tx } from '../db.js';
import { isId,validDate,ValidationError,ConflictError } from '../valid.js';
import { text,number,today,monthEnd,cleanDays } from '../payroll.js';
import { PERSONNEL_ROLES,DOCUMENT_APPROVERS,DOSSIER_SLOTS,employeeSnapshot,LABOUR_SOURCE,LABOUR_CHECKED } from '../personnel.js';
const r=Router(),actor=req=>({id:req.user.id,name:req.user.name||req.user.username});
const guard=roles=>(req,res,next)=>roles.includes(req.user.role)?next():res.status(403).json({error:"Sizda bu amal uchun ruxsat yo'q"});
r.use('/personnel',guard(PERSONNEL_ROLES));
const write=fn=>async(req,res)=>res.json(await tx(async c=>{await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,8172))',[req.factoryId]);return fn(c,req);}));
const event=(c,req,action,id,detail)=>c.query('INSERT INTO hr_events(factory_id,actor,action,entity_id,detail) VALUES($1,$2,$3,$4,$5)',[req.factoryId,actor(req),action,id,JSON.stringify(detail)]);
function version(row,b){if(!Number.isInteger(b?.version)||row.version!==b.version)throw new ConflictError('Ma’lumot o‘zgargan. Qayta yuklang');}
async function employee(c,req){
 if(!isId(req.params.id))throw new ValidationError('Xodim topilmadi');
 const e=await one('SELECT * FROM hr_employees WHERE factory_id=$1 AND id=$2',[req.factoryId,req.params.id],c);
 if(!e)throw new ValidationError('Xodim topilmadi');return e;
}
const date=(value,label,optional=false)=>{if(optional&&!value)return '';if(!validDate(value))throw new ValidationError(`${label}: sana noto‘g‘ri`);return value;};
function employerProfile(p={}){
 if(!p||typeof p!=='object'||Array.isArray(p))throw new ValidationError('Korxona rekvizitlari noto‘g‘ri');
 const out={};for(const k of ['company','director','directorTitle','address','tin','phone','city','hrName','bankDetails','legalForm','shortName'])out[k]=text(p[k],k==='address'||k==='bankDetails'?500:200);return out;
}
function cleanTerms(p={}){
 if(!p||typeof p!=='object'||Array.isArray(p))throw new ValidationError('Hujjat shartlari noto‘g‘ri');
 const out={};for(const k of ['position','department','workplace','employmentType','termType','termBasis','trial','workSchedule','extras','jobDuties','evidence','agreementNumber','agreementDate','sourceContractNumber','sourceContractDate','terminationBasis','legalClause','reason'])out[k]=text(p[k],['evidence','reason','jobDuties','extras'].includes(k)?2000:300);
 for(const k of ['startDate','endDate'])out[k]=date(p[k],k,true);
 for(const k of ['salary','coefficient','hoursWeek','daysWeek','leaveDays','extraLeave'])out[k]=p[k]===''||p[k]===undefined?0:number(p[k],k,0,k==='salary'||k==='coefficient'?1e10:366);
 if(out.employmentType&&!['main','part'].includes(out.employmentType))throw new ValidationError('Ish turi noto‘g‘ri');
 if(out.termType&&!['fixed','indefinite'].includes(out.termType))throw new ValidationError('Shartnoma muddati noto‘g‘ri');
 if(out.endDate&&out.startDate&&out.endDate<out.startDate)throw new ValidationError('Shartnoma sanalari noto‘g‘ri');
 return out;
}
const payload=(e,employer,terms)=>({employee:{...employeeSnapshot(e),version:e.version},employer,terms,legalSource:LABOUR_SOURCE,legalChecked:LABOUR_CHECKED});
async function employer(c,req){return await one('SELECT * FROM hr_employers WHERE factory_id=$1',[req.factoryId],c)||{version:0,profile:{company:req.factory?.name||''}};}
r.get('/personnel/:id',async(req,res)=>res.json(await tx(async c=>{
 await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');const e=await employee(c,req);
 return {employee:e,employer:await employer(c,req),documents:await rows('SELECT * FROM hr_employment_docs WHERE factory_id=$1 AND employee_id=$2 ORDER BY created_at,id',[req.factoryId,e.id],c),files:await rows('SELECT id,slot,name,mime,size_bytes,uploaded_at,uploaded_by FROM hr_employee_files WHERE factory_id=$1 AND employee_id=$2 ORDER BY uploaded_at DESC',[req.factoryId,e.id],c),history:await rows("SELECT id,actor,action,created_at,detail FROM hr_events WHERE factory_id=$1 AND entity_id=$2 AND (action LIKE 'personnel.%' OR action IN ('employee.create','employee.update')) ORDER BY created_at DESC LIMIT 100",[req.factoryId,e.id],c)};
})));
r.put('/personnel-employer',guard(PERSONNEL_ROLES),write(async(c,req)=>{
 const old=await employer(c,req);version(old,req.body);const p=employerProfile(req.body.profile);
 const doc=await one('INSERT INTO hr_employers(factory_id,profile) VALUES($1,$2) ON CONFLICT(factory_id) DO UPDATE SET profile=$2,version=hr_employers.version+1 RETURNING *',[req.factoryId,JSON.stringify(p)],c);
 await event(c,req,'personnel.employer',req.factoryId,{before:old.profile,after:p});return doc;
}));
r.post('/personnel/:id/documents',write(async(c,req)=>{
 const e=await employee(c,req),b=req.body||{},kind=b.kind;
 if(!['contract','hire','transfer','termination'].includes(kind))throw new ValidationError('Hujjat turi noto‘g‘ri');
 const em=employerProfile((await employer(c,req)).profile),terms=cleanTerms(b.terms||{position:e.position,department:e.department,startDate:e.hireDate});
 const d=date(b.date,'Hujjat'),effective=date(b.effectiveDate||terms.startDate||d,'Amal qilish');
 let relatedId=null;
 if(kind==='hire'){
  const contract=await one("SELECT * FROM hr_employment_docs WHERE factory_id=$1 AND employee_id=$2 AND kind='contract' AND status<>'cancelled' ORDER BY created_at DESC LIMIT 1",[req.factoryId,e.id],c);
  if(!contract)throw new ValidationError('Avval mehnat shartnomasini tuzing');relatedId=contract.id;
 }
 if(kind==='transfer'){
  if(!terms.position||!terms.agreementNumber||!validDate(terms.agreementDate)||!terms.evidence)throw new ValidationError('Yangi lavozim, qo‘shimcha kelishuv va xodim roziligini kiriting');
  const addendum=await one("INSERT INTO hr_employment_docs(factory_id,employee_id,kind,number,date,effective_date,payload,created_by) VALUES($1,$2,'addendum',$3,$4,$5,$6,$7) RETURNING *",[req.factoryId,e.id,terms.agreementNumber,terms.agreementDate,effective,JSON.stringify(payload(e,em,terms)),actor(req)],c);relatedId=addendum.id;
 }
 const doc=await one('INSERT INTO hr_employment_docs(factory_id,employee_id,kind,number,date,effective_date,related_id,payload,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',[req.factoryId,e.id,kind,text(b.number,60),d,effective,relatedId,JSON.stringify(payload(e,em,terms)),actor(req)],c);
 await event(c,req,'personnel.document.create',e.id,{id:doc.id,kind,number:doc.number});return doc;
}));
async function document(c,req){
 if(!isId(req.params.docId))throw new ValidationError('Hujjat topilmadi');
 const d=await one('SELECT * FROM hr_employment_docs WHERE factory_id=$1 AND employee_id=$2 AND id=$3',[req.factoryId,req.params.id,req.params.docId],c);if(!d)throw new ValidationError('Hujjat topilmadi');return d;
}
r.get('/personnel/:id/documents/:docId',async(req,res)=>{
 await employee(null,req);res.json(await document(null,req));
});
r.put('/personnel/:id/documents/:docId',write(async(c,req)=>{
 const e=await employee(c,req),old=await document(c,req),b=req.body||{};version(old,b);if(old.status!=='draft')throw new ConflictError('Faqat qoralama tahrirlanadi');
 const em=employerProfile((await employer(c,req)).profile),terms=cleanTerms(b.terms),d=date(b.date,'Hujjat'),effective=date(b.effectiveDate||terms.startDate||d,'Amal qilish');
 const doc=await one('UPDATE hr_employment_docs SET number=$4,date=$5,effective_date=$6,payload=$7,version=version+1 WHERE factory_id=$1 AND employee_id=$2 AND id=$3 RETURNING *',[req.factoryId,e.id,old.id,text(b.number,60),d,effective,JSON.stringify(payload(e,em,terms))],c);
 await event(c,req,'personnel.document.edit',e.id,{id:doc.id,kind:doc.kind});return doc;
}));
function required(v,label){if(!v)throw new ValidationError(`${label}: to‘ldiring`);}
function finalCheck(d){
 const {employee:e,employer:em,terms:t}=d.payload;
 for(const [value,label] of [[d.number,'Hujjat raqami'],[em.company,'Korxona nomi'],[em.director,'Direktor'],[em.address,'Korxona manzili'],[e.name,'F.I.Sh.']])required(value,label);
 if(d.date>today())throw new ValidationError('Hujjat sanasi kelajakda bo‘lmaydi');
 if(d.kind==='contract'){
  for(const [value,label] of [[e.profile?.passport,'Pasport / ID'],[e.profile?.pinfl,'JShShIR'],[e.profile?.birthDate,'Tug‘ilgan sana'],[e.profile?.address,'Manzil'],[t.position,'Lavozim'],[t.workplace,'Ish joyi'],[t.employmentType,'Ish turi'],[t.termType,'Shartnoma muddati'],[t.startDate,'Ish boshlanishi'],[t.workSchedule,'Ish rejimi'],[t.salary,'Ish haqi'],[t.leaveDays,'Ta’til kunlari']])required(value,label);
  if(t.daysWeek<1||t.daysWeek>7||!Number.isInteger(t.daysWeek)||t.hoursWeek<=0||t.hoursWeek>40)throw new ValidationError('Ish haftasi va ish soatlarini tekshiring');
  if(t.leaveDays<21||!Number.isInteger(t.leaveDays)||!Number.isInteger(t.extraLeave))throw new ValidationError('Yillik ta’til kamida 21 kalendar kun bo‘lsin');
  if(t.termType==='fixed'&&(!t.endDate||!t.termBasis))throw new ValidationError('Muddatli shartnoma tugash sanasi va asosini kiriting');
 }
 if(d.kind==='addendum'||d.kind==='transfer'){
  if(!t.position||!t.agreementNumber||!validDate(t.agreementDate)||!t.evidence||!t.sourceContractNumber||!validDate(t.sourceContractDate))throw new ValidationError('Qo‘shimcha kelishuv va yozma rozilik asosini kiriting');
 }
 if(d.kind==='termination'){
  if(!['mutual','employee','expiry','other'].includes(t.terminationBasis)||!t.evidence||!t.reason||!t.sourceContractNumber||!validDate(t.sourceContractDate))throw new ValidationError('Bekor qilish sababi, shartnoma va tasdiqlovchi hujjatlarni kiriting');
  if(t.terminationBasis==='other'&&!t.legalClause)throw new ValidationError('Aniq modda, qism va bandni kiriting');
 }
}
r.post('/personnel/:id/documents/:docId/issue',guard(DOCUMENT_APPROVERS),write(async(c,req)=>{
 const e=await employee(c,req),doc=await document(c,req),b=req.body||{};version(doc,b);
 if(doc.status!=='draft')throw new ConflictError('Hujjat allaqachon rasmiylashtirilgan');
 if(b.signedConfirmed!==true||b.basisChecked!==true)throw new ValidationError('Imzolar va huquqiy asoslar tekshirilganini tasdiqlang');
 if(['hire','transfer','termination'].includes(doc.kind)&&doc.effectiveDate>today())throw new ConflictError('Kelajakdagi buyruqni amal qilish sanasida qo‘llang');
 if(doc.payload.employee.version!==e.version)throw new ConflictError('Xodim kartochkasi o‘zgargan. Hujjatni qayta saqlang');
 if(doc.kind==='hire'||doc.kind==='transfer'){
  const ref=await one('SELECT * FROM hr_employment_docs WHERE factory_id=$1 AND employee_id=$2 AND id=$3',[req.factoryId,e.id,doc.relatedId],c);
  if(!ref||ref.status!=='issued'||ref.kind!==(doc.kind==='hire'?'contract':'addendum'))throw new ConflictError('Avval shartnoma yoki qo‘shimcha kelishuvni rasmiylashtiring');
  if(doc.kind==='hire'){
   if(ref.payload.employee.version!==e.version)throw new ConflictError('Imzolangan shartnomadan keyin kartochka o‘zgargan. Shartnomani qayta rasmiylashtiring');
   doc.payload={...ref.payload,terms:{...ref.payload.terms,sourceContractNumber:ref.number,sourceContractDate:ref.date}};doc.effectiveDate=ref.payload.terms.startDate;
   if(doc.effectiveDate!==e.hireDate)throw new ConflictError('Shartnomadagi boshlanish sanasi kartochkaga mos emas');
   if(doc.effectiveDate>today())throw new ConflictError('Kelajakdagi buyruqni amal qilish sanasida qo‘llang');
  }else if(JSON.stringify(doc.payload.terms)!==JSON.stringify(ref.payload.terms)||doc.effectiveDate!==ref.effectiveDate)throw new ConflictError('Buyruq va qo‘shimcha kelishuv shartlari mos emas');
 }
 finalCheck(doc);const t=doc.payload.terms;
 if(['hire','transfer','termination'].includes(doc.kind)){
  const frozen=await one("SELECT max(month) AS month FROM hr_months WHERE factory_id=$1 AND status<>'draft'",[req.factoryId],c);
  if(frozen.month&&doc.effectiveDate<=monthEnd(frozen.month))throw new ConflictError('Tasdiqlangan davrga buyruq qo‘llanmaydi');
  if(doc.effectiveDate<e.hireDate||(e.endDate&&doc.effectiveDate>e.endDate))throw new ValidationError('Buyruq sanasi ish davriga mos emas');
  if(doc.kind==='termination'){
   const months=await rows('SELECT month,attendance FROM hr_months WHERE factory_id=$1',[req.factoryId],c);
   for(const m of months)if(m.attendance[e.id])cleanDays(m.attendance[e.id],m.month,{...e,endDate:doc.effectiveDate});
   const future=await one("SELECT id FROM hr_records WHERE factory_id=$1 AND employee_id=$2 AND kind IN ('leave','shift') AND status='approved' AND end_date>$3",[req.factoryId,e.id,doc.effectiveDate],c);
   if(future)throw new ConflictError('Kelajakdagi ta’til yoki smenani avval tekshiring');
   await c.query('UPDATE hr_employees SET end_date=$3,version=version+1,updated_at=now() WHERE factory_id=$1 AND id=$2',[req.factoryId,e.id,doc.effectiveDate]);
  }else{
   if(e.endDate&&e.endDate<=today())throw new ConflictError('Ishdan chiqqan xodimga yangi ishga qabul yozuvi kerak');
   await c.query('UPDATE hr_employees SET position=$3,department=$4,version=version+1,updated_at=now() WHERE factory_id=$1 AND id=$2',[req.factoryId,e.id,t.position,t.department]);
   if(t.salary>0){
    const rate=await one('SELECT * FROM hr_rates WHERE factory_id=$1 AND employee_id=$2 AND effective_date=$3',[req.factoryId,e.id,doc.effectiveDate],c);
    if(rate&&(rate.salary!==t.salary||rate.coefficient!==t.coefficient))throw new ConflictError('Bu sana uchun boshqa maosh allaqachon belgilangan');
    if(!rate)await c.query('INSERT INTO hr_rates(factory_id,employee_id,effective_date,salary,coefficient,reason,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)',[req.factoryId,e.id,doc.effectiveDate,t.salary,t.coefficient,`Buyruq № ${doc.number}`,actor(req)]);
   }
  }
  await c.query("UPDATE hr_months SET version=version+1,updated_at=now() WHERE factory_id=$1 AND status='draft'",[req.factoryId]);
 }
 const issued=await one("UPDATE hr_employment_docs SET status='issued',payload=$4,effective_date=$5,issued_by=$6,issued_at=now(),version=version+1 WHERE factory_id=$1 AND employee_id=$2 AND id=$3 RETURNING *",[req.factoryId,e.id,doc.id,JSON.stringify(doc.payload),doc.effectiveDate,actor(req)],c);
 await event(c,req,'personnel.document.issue',e.id,{id:doc.id,kind:doc.kind,number:doc.number,effectiveDate:doc.effectiveDate});return issued;
}));
r.post('/personnel/:id/files',raw({type:'application/octet-stream',limit:'3mb'}),write(async(c,req)=>{
 const e=await employee(c,req),b=req.body,slot=String(req.query.slot||''),name=text(req.query.name,160),mime=String(req.query.mime||'');
 const matches=Buffer.isBuffer(b)&&b.length>0&&b.length<=3145728&&((mime==='application/pdf'&&b.subarray(0,5).toString()==='%PDF-')||(mime==='image/jpeg'&&b[0]===255&&b[1]===216&&b[2]===255)||(mime==='image/png'&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))));
 if(!DOSSIER_SLOTS.includes(slot)||!name||!matches)throw new ValidationError('PDF, JPG yoki PNG fayl tanlang (3 MB gacha)');
 const doc=await one('INSERT INTO hr_employee_files(factory_id,employee_id,slot,name,mime,size_bytes,content_base64,uploaded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,slot,name,mime,size_bytes,uploaded_at',[req.factoryId,e.id,slot,name,mime,b.length,b.toString('base64'),actor(req)],c);
 await event(c,req,'personnel.file.upload',e.id,{id:doc.id,slot,name});return doc;
}));
r.get('/personnel/:id/files/:fileId',async(req,res)=>{
 await employee(null,req);if(!isId(req.params.fileId))throw new ValidationError('Fayl topilmadi');
 const doc=await one('SELECT * FROM hr_employee_files WHERE factory_id=$1 AND employee_id=$2 AND id=$3',[req.factoryId,req.params.id,req.params.fileId]);if(!doc)throw new ValidationError('Fayl topilmadi');
 res.set({'Content-Type':doc.mime,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(doc.name)}`,'X-Content-Type-Options':'nosniff'}).send(Buffer.from(doc.contentBase64,'base64'));
});
r.delete('/personnel/:id/files/:fileId',write(async(c,req)=>{
 const e=await employee(c,req);if(!isId(req.params.fileId))throw new ValidationError('Fayl topilmadi');
 const doc=await one('DELETE FROM hr_employee_files WHERE factory_id=$1 AND employee_id=$2 AND id=$3 RETURNING id,slot,name',[req.factoryId,e.id,req.params.fileId],c);if(!doc)throw new ConflictError('Fayl topilmadi');
 await event(c,req,'personnel.file.delete',e.id,doc);return {ok:true};
}));
export default r;
