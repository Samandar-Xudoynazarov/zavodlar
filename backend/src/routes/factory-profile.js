import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import { Router } from 'express';
import { one,tx } from '../db.js';
import { ValidationError,ConflictError } from '../valid.js';
import { factoryProfile,cleanLogo } from '../factory-profile.js';
const r=Router();
r.get('/backup-status',async(req,res)=>{
 if(req.user.role!=='admin'||req.user.factoryId)return res.status(403).json({error:'Faqat bosh administrator uchun'});
 try{const dir=path.resolve(process.env.BACKUP_DIR||path.join(os.homedir(),'zavodlar-private-backups'));const last=JSON.parse(await fs.readFile(path.join(dir,'backup-status.json'),'utf8'));res.json({last,keyConfigured:!!process.env.BACKUP_ENCRYPTION_KEY,offsiteConfigured:!!process.env.BACKUP_UPLOAD_URL});}catch(e){if(e.code!=='ENOENT')throw e;res.json({last:null,keyConfigured:!!process.env.BACKUP_ENCRYPTION_KEY,offsiteConfigured:!!process.env.BACKUP_UPLOAD_URL});}
});
r.get('/factory-profile',async(req,res)=>{res.set('Cache-Control','no-store');res.json(await factoryProfile(req.factoryId));});
r.put('/factory-profile',async(req,res)=>{
 if(!['admin','rahbar'].includes(req.user.role))return res.status(403).json({error:'Zavod rekvizitlarini faqat administrator yoki rahbar o‘zgartiradi'});
 res.json(await tx(async c=>{
 await c.query('INSERT INTO settings(factory_id) VALUES($1) ON CONFLICT DO NOTHING',[req.factoryId]);
 const old=await one('SELECT * FROM settings WHERE factory_id=$1 FOR UPDATE',[req.factoryId],c),b=req.body||{};
 if(b.factoryId&&b.factoryId!==req.factoryId)throw new ConflictError('Zavod o‘zgargan. Rekvizitlarni qayta yuklang');
 if(b.version!==old.documentVersion)throw new ConflictError('Rekvizitlar o‘zgargan. Qayta yuklang');
 const p={};for(const k of ['company','shortName','address','phone','tin','director','directorTitle','hrName','bankDetails','city','legalForm']){if(b[k]!==undefined&&typeof b[k]!=='string')throw new ValidationError('Rekvizitlar matn bo‘lishi kerak');p[k]=String(b[k]||'').trim().slice(0,k==='bankDetails'||k==='address'?500:200);}
 if(!p.company)throw new ValidationError('Hujjatdagi korxona nomi majburiy');p.logo=cleanLogo(b.logo);
 await c.query('UPDATE settings SET document_profile=$2,company=$3,document_version=document_version+1,updated_at=now() WHERE factory_id=$1',[req.factoryId,JSON.stringify(p),p.company]);
 await c.query('INSERT INTO hr_events(factory_id,actor,action,entity_id,detail) VALUES($1,$2,$3,$5,$4)',[req.factoryId,{id:req.user.id,name:req.user.name||req.user.username},'factory.identity',JSON.stringify({company:p.company,logoChanged:old.documentProfile?.logo!==p.logo}),req.factoryId]);
 return factoryProfile(req.factoryId,c);
 }));
});export default r;
