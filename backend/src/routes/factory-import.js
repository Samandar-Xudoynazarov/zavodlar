import {Router} from 'express';
import crypto from 'node:crypto';
import {q,one,rows,tx} from '../db.js';
import {isId,insertSql,ValidationError,ConflictError} from '../valid.js';
import {OPERATION_TABLES,prepareLegacyImport,validateLegacyBackup} from '../legacy-import.js';
import {financeLock} from '../finance-integrity.js';
const r=Router();
r.use((req,res,next)=>req.user.role==='admin'&&!req.user.factoryId?next():res.status(403).json({error:'JSON import faqat bosh administrator uchun'}));
r.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const metadata='id,factory_id,source_name,source_created_at,counts,replaced,created_by,created_at';
async function target(c,id){if(!isId(id))throw new ValidationError('Maqsad zavodni tanlang');const f=await one('SELECT * FROM factories WHERE id=$1',[id],c);if(!f||f.archived)throw new ValidationError('Faol zavod topilmadi');return f;}
async function snapshot(c,f){const out={};for(const table of OPERATION_TABLES){const order=table==='settings'?'factory_id':table==='counters'?'name':'id';out[table]=(await c.query('SELECT * FROM '+table+' WHERE factory_id=$1 ORDER BY '+order,[f])).rows;}return out;}
async function blocked(c,f){return !!(await c.query('SELECT 1 FROM material_invoices WHERE factory_id=$1 UNION ALL SELECT 1 FROM finance_invoices WHERE factory_id=$1 UNION ALL SELECT 1 FROM finance_receipts WHERE factory_id=$1 UNION ALL SELECT 1 FROM finance_order_progress WHERE factory_id=$1 LIMIT 1',[f])).rowCount;}
const hasData=state=>Object.entries(state).some(([key,rs])=>!['settings','counters'].includes(key)&&rs.length>0);
async function plan(b){let info,records;try{info=validateLegacyBackup(b.backup);records=await prepareLegacyImport(b.backup);}catch(e){if(e instanceof ValidationError)throw e;throw new ValidationError('JSON tarkibi noto‘g‘ri: '+String(e.message).slice(0,200));}return {...info,records,sourceHash:hash(b.backup)};}
r.post('/preview',async(req,res)=>{
 const b=req.body||{},p=await plan(b);
 res.json(await tx(async c=>{await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');const f=await target(c,b.factoryId),state=await snapshot(c,f.id),existing=await one('SELECT '+metadata+' FROM factory_imports WHERE factory_id=$1 AND source_hash=$2',[f.id,p.sourceHash],c);
 return {factory:{id:f.id,name:f.name,code:f.code},counts:p.counts,skippedUsers:p.skippedUsers,createdAt:String(b.backup.createdAt||''),sourceHash:p.sourceHash,currentCounts:Object.fromEntries(Object.entries(state).map(([k,v])=>[k,v.length])),hasData:hasData(state),fingerprint:hash(state),blocked:await blocked(c,f.id),alreadyImported:existing||null};}));
});
r.get('/',async(req,res)=>{const f=await target(null,req.query.factoryId);res.json(await rows('SELECT '+metadata+' FROM factory_imports WHERE factory_id=$1 ORDER BY created_at DESC LIMIT 20',[f.id]));});
r.post('/',async(req,res)=>{
 const b=req.body||{};if(!isId(b.requestId))throw new ValidationError('So‘rov IDsi noto‘g‘ri');const p=await plan(b);
 let result;
 try {result=await tx(async c=>{
 const f=await target(c,b.factoryId);await financeLock(c,f.id);
 // The existing write routes also touch these tables. Block concurrent writes until the import commits.
 await c.query('LOCK TABLE '+OPERATION_TABLES.join(',')+' IN SHARE ROW EXCLUSIVE MODE');
 const previous=await one('SELECT '+metadata+',source_hash FROM factory_imports WHERE request_id=$1 OR (factory_id=$2 AND source_hash=$3)',[b.requestId,f.id,p.sourceHash],c);
 if(previous){if(previous.factoryId!==f.id||previous.sourceHash!==p.sourceHash)throw new ConflictError('So‘rov boshqa fayl yoki zavod uchun ishlatilgan');const {sourceHash,...safe}=previous;return {import:safe,alreadyImported:true};}
 const state=await snapshot(c,f.id);if(hash(state)!==b.fingerprint)throw new ConflictError('Zavod ma’lumotlari tekshiruvdan keyin o‘zgargan. Faylni qayta tekshiring');
 const replace=hasData(state);if(replace&&b.replace!==true)throw new ConflictError('Zavodda ma’lumot bor. Oldingi holat zaxiralanib almashtirilishini belgilang');
 if(await blocked(c,f.id))throw new ConflictError('Zavodda moliyaviy yozuvlar bor. Ularning bog‘lanishlarini saqlash uchun importni yangi yoki bo‘sh zavodga bajaring');
 const sourceData={...b.backup,data:{...b.backup.data,users:[]}};
 const archive=await one('INSERT INTO factory_imports(factory_id,request_id,source_hash,source_name,source_created_at,counts,replaced,source_data,previous_data,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING '+metadata,[f.id,b.requestId,p.sourceHash,String(b.fileName||'pto-backup.json').slice(0,160),String(b.backup.createdAt||'').slice(0,100),JSON.stringify(p.counts),replace,JSON.stringify(sourceData),JSON.stringify(state),{id:req.user.id,name:req.user.name||req.user.username}],c);
 for(const table of ['movements','inventories','vehicle_logs','product_moves','acct_reports','month_plans','days','orders','suppliers','targets','products','materials','counters','settings'])await c.query('DELETE FROM '+table+' WHERE factory_id=$1',[f.id]);
 for(const table of OPERATION_TABLES){for(const obj of p.records[table]||[]){const sql=insertSql(table,{factoryId:f.id,...obj});await c.query(sql.text,sql.values);}}
 // Keep the successful import and its audit entry in the same transaction.
 await c.query('INSERT INTO audit_log(factory_id,"user",action,entity,entity_id,label,changes) VALUES($1,$2,$3,$4,$5,$6,$7)',[f.id,{id:req.user.id,username:req.user.username,name:req.user.name},'create','factoryImport',archive.id,'JSON import: '+f.name,JSON.stringify([{p:'counts',a:Object.fromEntries(Object.entries(state).map(([k,v])=>[k,v.length])),b:p.counts}])]);
 return {import:archive,alreadyImported:false};
 });} catch(e){if(e.code==='23505')throw new ConflictError('JSONda raqam, sana yoki nom takrorlangan. Hech qanday ma’lumot o‘zgarmadi');if(['23503','23514','23502','22P02','22007','22003'].includes(e.code))throw new ValidationError('JSONdagi bog‘lanish, sana yoki son noto‘g‘ri. Hech qanday ma’lumot o‘zgarmadi');throw e;}
 res.json({...result,counts:p.counts,skippedUsers:p.skippedUsers});
});
r.get('/:id/backup',async(req,res)=>{
 if(!isId(req.params.id))throw new ValidationError('Zaxira topilmadi');const doc=await one('SELECT * FROM factory_imports WHERE id=$1',[req.params.id]);if(!doc)return res.status(404).json({error:'Import topilmadi'});
 const factory=(await q('SELECT * FROM factories WHERE id=$1',[doc.factoryId])).rows[0];
 // Snapshots intentionally cover only the operational data replaced by this importer.
 const data={factories:[factory],...doc.previousData};
 res.set('Content-Disposition','attachment; filename="before-import-'+doc.id+'.json"');res.json({app:'zavodlar',format:2,db:'postgres',scope:doc.factoryId,createdAt:doc.createdAt,createdBy:doc.createdBy.name,counts:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,v.length])),data});
});
export default r;
