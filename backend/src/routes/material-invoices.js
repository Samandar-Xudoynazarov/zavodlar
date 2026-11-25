import {randomUUID} from 'node:crypto';
import {matchReceipt} from '../supplier-materials.js';
import { Router } from 'express';
import { one, rows, tx } from '../db.js';
import { isId, validDate, validMonth, ValidationError, ConflictError, insertSql } from '../valid.js';
import { money, number, text } from '../payroll.js';
import { pdfContent, sendPdf, actor, FINANCE_ROLES } from '../dispatch.js';
import { todayTashkent, openingOf } from '../common.js';
import { lockMaterial, minBalanceFrom } from './store.js';
import { audit } from '../audit.js';
import { assertMonthOpen } from '../finance-period-lock.js';
const r = Router();
const cols = 'id,type,number,date,due_date,supplier_id,counterparty,items,amount,note,name,size_bytes,created_at,voided_at,void_reason';
r.use((req,res,next)=>FINANCE_ROLES.includes(req.user.role)?next():res.status(403).json({error:'Material fakturalari faqat admin, rahbar va buxgalter uchun'}));
r.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});
r.get('/',async(req,res)=>{
 if(!validMonth(req.query.month))throw new ValidationError('Hisob oyini tanlang');
 const month=req.query.month;
 res.json(await rows('SELECT '+cols+' FROM material_invoices WHERE factory_id=$1 AND left(date,7)=$2 ORDER BY date DESC,created_at DESC',[req.factoryId,month]));
});
r.post('/',async(req,res)=>{
 const b=req.body||{}, f=req.factoryId;
 if(!isId(b.requestId))throw new ValidationError('So‘rov raqami noto‘g‘ri');
 const doc=await tx(async c=>{
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,9473))',[f]);
  const old=await one('SELECT '+cols+' FROM material_invoices WHERE factory_id=$1 AND request_id=$2',[f,b.requestId],c);
  if(old)return old;
  if(!['in','out'].includes(b.type)||!validDate(b.date)||b.date>todayTashkent())throw new ValidationError('Harakat turi yoki sana noto‘g‘ri');
  await assertMonthOpen(c,f,b.date);
  if(b.stockMode!=null&&!['withReceipt','invoiceOnly'].includes(b.stockMode))throw new ValidationError('Omborga yozish usulini tanlang');
  const opening=await openingOf(f,c);if((b.type==='out'||b.stockMode!=='invoiceOnly')&&opening.date&&b.date<opening.date)throw new ValidationError('Sana boshlang‘ich qoldiq sanasidan oldin bo‘lmasin');
  const dueDate=b.type==='in' && b.dueDate ? b.dueDate : null;
  if(dueDate && (!validDate(dueDate) || dueDate<b.date))throw new ValidationError('To‘lov muddati faktura sanasidan oldin bo‘lmasin');
  const no=text(b.number,80),party=text(b.counterparty,160);if(!no||!party)throw new ValidationError('Faktura raqami va kontragentni kiriting');
  if(!Array.isArray(b.items)||!b.items.length||b.items.length>100)throw new ValidationError('1–100 ta material kiriting');
  const seen=new Set(),items=[];
  // Acquire all stock locks in the same order, including incoming invoices.
  for(const id of [...new Set(b.items.map(i=>i?.materialId))].sort()){if(!isId(id))throw new ValidationError('Materialni tanlang');await lockMaterial(c,id);}
  for(const line of b.items){
   if(seen.has(line.materialId))throw new ValidationError('Bir materialni ikki marta kiritmang');seen.add(line.materialId);
   const mat=await one('SELECT * FROM materials WHERE factory_id=$1 AND id=$2',[f,line.materialId],c);
   if(!mat||mat.archived||!mat.stock)throw new ValidationError('Material topilmadi yoki omborda hisobga olinmaydi');
   if(!['number','string'].includes(typeof line.qty)||!String(line.qty).trim()||!Number.isFinite(+line.qty)||+line.qty<.000001||+line.qty>1e9)throw new ValidationError('Miqdor noto‘g‘ri');
   const qty=Math.round(+line.qty*1e6)/1e6,price=number(line.price,'Narx',0,1e12),vatRate=number(line.vatRate??0,'QQS',0,100);
   if(b.type==='out'&&await minBalanceFrom(f,mat.id,b.date,c)+1e-9<qty)throw new ValidationError(mat.name+': omborda yetarli emas');
   const net=money(qty*price),vat=money(net*vatRate/100),amount=money(net+vat);
   const data={factoryId:f,type:b.type,date:b.date,materialId:mat.id,qty,price,supplier:b.type==='in'?party:'',person:b.type==='out'?party:'',docNumber:no,note:text(b.note,300),createdBy:actor(req)};
   let move=null;
   if(b.type==='out'||b.stockMode!=='invoiceOnly'){
     const s=insertSql('movements',data);move=await one(s.text,s.values,c);
   }
   items.push({materialId:mat.id,name:mat.name,unit:mat.unit,qty,price,vatRate,net,vat,amount,movementId:move?.id||null});
  }
  let size=0,content='';if(b.contentBase64){size=pdfContent(b.contentBase64).length;content=b.contentBase64;}
  const saved=await one('INSERT INTO material_invoices(factory_id,request_id,type,number,date,counterparty,items,amount,note,name,content_base64,size_bytes,created_by,due_date) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING '+cols,[f,b.requestId,b.type,no,b.date,party,JSON.stringify(items),money(items.reduce((s,i)=>s+i.amount,0)),text(b.note,1000),content?(text(b.name,160)||'Faktura.pdf'):'',content,size,actor(req),dueDate],c);
  for(const line of b.items){
    if(!line.receiptId)continue;
    if(b.type!=='in'||b.stockMode!=='invoiceOnly')throw new ValidationError('Kirimni faqat alohida kirim fakturasiga bog‘lash mumkin');
    await matchReceipt(c,f,{id:saved.supplierId,name:party},{invoiceId:saved.id,movementId:line.receiptId,materialId:line.materialId,qty:line.matchQty,requestId:randomUUID()});
  }
  return saved;
 });
 await audit(req,{action:'create',entity:'materialInvoice',entityId:doc.id,label:doc.number,after:{...doc,items:doc.items}});
 res.json(doc);
});
r.get('/:id/pdf',async(req,res)=>{
 if(!isId(req.params.id))throw new ValidationError('Faktura topilmadi');
 const doc=await one('SELECT * FROM material_invoices WHERE factory_id=$1 AND id=$2',[req.factoryId,req.params.id]);
 if(!doc||!doc.sizeBytes)return res.status(404).json({error:'Faktura PDF saqlanmagan'});sendPdf(res,doc);
});
r.post('/:id/void',async(req,res)=>{
 if(!isId(req.params.id)||!text(req.body?.reason,500))throw new ValidationError('Bekor qilish sababini kiriting');
 const doc=await tx(async c=>{
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,9473))',[req.factoryId]);
  const doc=await one('SELECT * FROM material_invoices WHERE factory_id=$1 AND id=$2 FOR UPDATE',[req.factoryId,req.params.id],c);
  if(!doc||doc.voidedAt)throw new ConflictError('Faktura topilmadi yoki bekor qilingan');
  await assertMonthOpen(c,req.factoryId,doc.date);
  if(await one('SELECT id FROM supplier_allocations WHERE factory_id=$1 AND invoice_id=$2 AND voided_at IS NULL LIMIT 1',[req.factoryId,doc.id],c))throw new ConflictError('Avval ta’minotchi hisobida fakturaga bog‘langan to‘lovni ajrating.');
  for(const item of [...doc.items].sort((a,b)=>a.materialId.localeCompare(b.materialId)))await lockMaterial(c,item.materialId);
  for(const item of doc.items){
   if(!item.movementId)continue;
   const move=await one('SELECT * FROM movements WHERE factory_id=$1 AND id=$2',[req.factoryId,item.movementId],c);
   if(!move)throw new ConflictError('Bog‘langan ombor harakati topilmadi');
   if(doc.type==='in'&&await minBalanceFrom(req.factoryId,item.materialId,doc.date,c)+1e-9<item.qty)throw new ConflictError(item.name+': material sarflangan, kirimni bekor qilib bo‘lmaydi');
   await c.query('DELETE FROM movements WHERE factory_id=$1 AND id=$2',[req.factoryId,item.movementId]);
  }
  await c.query('DELETE FROM material_invoice_matches WHERE factory_id=$1 AND invoice_id=$2',[req.factoryId,doc.id]);
  return one('UPDATE material_invoices SET voided_at=now(),void_reason=$3 WHERE factory_id=$1 AND id=$2 RETURNING '+cols,[req.factoryId,doc.id,text(req.body.reason,500)],c);
 });
 await audit(req,{action:'update',entity:'materialInvoice',entityId:doc.id,label:'Faktura bekor qilindi: '+doc.number,after:doc});res.json(doc);
});
export default r;
