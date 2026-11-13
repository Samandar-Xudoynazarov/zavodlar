import { employerWithIdentity } from '../factory-profile.js';
import { Router,raw } from 'express';
import { one,rows,tx } from '../db.js';
import { PERSONNEL_ROLES } from '../personnel.js';
import { isId,validDate,ValidationError,ConflictError } from '../valid.js';
import { text } from '../payroll.js';
const r=Router();
r.use('/personnel-documents',(req,res,next)=>PERSONNEL_ROLES.includes(req.user.role)?next():res.status(403).json({error:"Sizda bu amal uchun ruxsat yo'q"}));
const actor=req=>({id:req.user.id,name:req.user.name||req.user.username});
const write=fn=>async(req,res)=>res.json(await tx(async c=>{await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,8172))',[req.factoryId]);return fn(c,req);}));
const event=(c,req,action,id,detail)=>c.query('INSERT INTO hr_events(factory_id,actor,action,entity_id,detail) VALUES($1,$2,$3,$4,$5)',[req.factoryId,actor(req),action,id,detail]);
r.get('/personnel-documents',async(req,res)=>res.json(await tx(async c=>{
 await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
 const fid=[req.factoryId];
 return {
  employees:await rows('SELECT id,code,name,position,department,hire_date,end_date FROM hr_employees WHERE factory_id=$1 ORDER BY department,name',fid,c),
  documents:await rows('SELECT id,employee_id,kind,number,date,effective_date,status,related_id,created_at,(signed_pdf IS NOT NULL) AS has_signed_pdf FROM hr_employment_docs WHERE factory_id=$1 ORDER BY date DESC,created_at,id',fid,c),
  files:await rows('SELECT id,employee_id,slot,name,mime,size_bytes,uploaded_at FROM hr_employee_files WHERE factory_id=$1 ORDER BY uploaded_at DESC',fid,c),
  records:await rows('SELECT * FROM hr_records WHERE factory_id=$1 ORDER BY start_date DESC,created_at,id',fid,c),
  companyFiles:await rows('SELECT id,category,title,date,name,mime,size_bytes,uploaded_at FROM hr_company_files WHERE factory_id=$1 ORDER BY uploaded_at DESC',fid,c),
  months:await rows('SELECT month,norm_hours,status FROM hr_months WHERE factory_id=$1 ORDER BY month DESC',fid,c),
  employer:await employerWithIdentity(req.factoryId,(await one('SELECT profile FROM hr_employers WHERE factory_id=$1',fid,c))?.profile||{},c),
 };
})));
r.post('/personnel-documents/company-files',raw({type:'application/octet-stream',limit:'3mb'}),write(async(c,req)=>{
 const b=req.body,name=text(req.query.name,160),title=text(req.query.title,200),category=String(req.query.category||''),date=String(req.query.date||''),mime=String(req.query.mime||'');
 const valid=Buffer.isBuffer(b)&&b.length>0&&b.length<=3145728&&((mime==='application/pdf'&&b.subarray(0,5).toString()==='%PDF-')||(mime==='image/jpeg'&&b[0]===255&&b[1]===216&&b[2]===255)||(mime==='image/png'&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))));
 if(!valid||!title||!name||!['policy','job','application','certificate','order','other'].includes(category)||(date&&!validDate(date)))throw new ValidationError('Nomi, turini va PDF / JPG / PNG faylni tekshiring (3 MB gacha)');
 const file=await one('INSERT INTO hr_company_files(factory_id,category,title,date,name,mime,size_bytes,content_base64,uploaded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,category,title,date,name,mime,size_bytes,uploaded_at',[req.factoryId,category,title,date,name,mime,b.length,b.toString('base64'),actor(req)],c);
 await event(c,req,'personnel.company.upload',file.id,{title,name});return file;
}));
r.get('/personnel-documents/company-files/:id',async(req,res)=>{
 if(!isId(req.params.id))throw new ValidationError('Fayl topilmadi');
 const file=await one('SELECT * FROM hr_company_files WHERE factory_id=$1 AND id=$2',[req.factoryId,req.params.id]);if(!file)throw new ValidationError('Fayl topilmadi');
 res.set({'Content-Type':file.mime,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'}).send(Buffer.from(file.contentBase64,'base64'));
});
r.delete('/personnel-documents/company-files/:id',write(async(c,req)=>{
 if(!isId(req.params.id))throw new ValidationError('Fayl topilmadi');
 const file=await one('DELETE FROM hr_company_files WHERE factory_id=$1 AND id=$2 RETURNING id,title,name',[req.factoryId,req.params.id],c);if(!file)throw new ConflictError('Fayl topilmadi');await event(c,req,'personnel.company.delete',file.id,file);return {ok:true};
}));
export default r;
