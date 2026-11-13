import {Router} from 'express';import {one,rows,tx} from '../db.js';import {validDate,ValidationError,ConflictError} from '../valid.js';import {financeLock} from '../finance-integrity.js';import {todayTashkent} from '../common.js';
const r=Router();
r.post('/days/:date/review',async(req,res)=>{
 const date=req.params.date,b=req.body||{},reviewer=['admin','rahbar','pto'].includes(req.user.role);
 if(!['admin','rahbar','pto','usta'].includes(req.user.role))return res.status(403).json({error:'Hisobotni boshqarish uchun ruxsat yo‘q'});
 if(!validDate(date))throw new ValidationError('Sana noto‘g‘ri');
 if(!['submit','approve','return','reopen'].includes(b.action))throw new ValidationError('Amal noto‘g‘ri');
 if(b.action!=='submit'&&!reviewer)return res.status(403).json({error:'Tekshirish va qayta ochish faqat PTO, administrator yoki rahbar uchun'});
 const result=await tx(async c=>{
 await financeLock(c,req.factoryId);await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',['day:'+req.factoryId+':'+date]);
 const d=await one('SELECT * FROM days WHERE factory_id=$1 AND date=$2 FOR UPDATE',[req.factoryId,date],c);if(!d)throw new ValidationError('Avval hisobotni saqlang');
 if(b.version!==d.version)throw new ConflictError('Hisobot o‘zgargan. Qayta yuklang');
 const transitions={submit:['draft','submitted'],approve:['submitted','approved'],return:['submitted','draft'],reopen:['approved','draft']},[from,to]=transitions[b.action];if(d.reviewStatus!==from)throw new ConflictError('Hisobot holati o‘zgargan yoki bu amal hozir mumkin emas');
 const reason=typeof b.reason==='string'?b.reason.trim().slice(0,1000):'';if(['return','reopen'].includes(b.action)&&!reason)throw new ValidationError('Qaytarish yoki qayta ochish sababini yozing');
 if(b.action==='submit'&&(date>todayTashkent()||!(d.production.length||d.materials.length||d.shipments.length||d.note)))throw new ValidationError('Bo‘sh yoki kelajakdagi hisobot yuborilmaydi');
 await c.query('INSERT INTO day_reviews(factory_id,date,action,reason,actor) VALUES($1,$2,$3,$4,$5)',[req.factoryId,date,b.action,reason,{id:req.user.id,name:req.user.name||req.user.username}]);
 return one('UPDATE days SET review_status=$3,version=version+1,updated_at=now() WHERE factory_id=$1 AND date=$2 RETURNING *',[req.factoryId,date,to],c);
 });res.json(result);
});
r.get('/days/:date/reviews',async(req,res)=>{if(!validDate(req.params.date))throw new ValidationError('Sana noto‘g‘ri');res.json(await rows('SELECT * FROM day_reviews WHERE factory_id=$1 AND date=$2 ORDER BY created_at DESC,id DESC LIMIT 50',[req.factoryId,req.params.date]));});export default r;
