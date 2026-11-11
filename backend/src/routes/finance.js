import { Router } from 'express';
import { one,rows,tx } from '../db.js';
import { isId,validDate,ValidationError,ConflictError } from '../valid.js';
import { money,number,text } from '../payroll.js';
import { FINANCE_ROLES,pdfContent,sendPdf,actor } from '../dispatch.js';
import { itemsOf,orderView } from '../orders.js';
import { shippedByOrder } from './production.js';
import { audit } from '../audit.js';
const r=Router();
r.use((req,res,next)=>FINANCE_ROLES.includes(req.user.role)?next():res.status(403).json({error:'Bu bo‘lim faqat admin, buxgalter va rahbar uchun'}));
r.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});
const invoiceCols='id,order_id,number,date,items,amount,note,name,size_bytes,created_at,voided_at,void_reason';
const receiptCols='id,order_id,invoice_id,date,amount,note,created_at,voided_at,void_reason';
const scopedOrder=async(c,req)=>{
 if(!isId(req.params.id))throw new ValidationError('Buyurtma topilmadi');
 const o=await one('SELECT * FROM orders WHERE factory_id=$1 AND id=$2 FOR UPDATE',[req.factoryId,req.params.id],c);
 if(!o)throw new ValidationError('Buyurtma topilmadi');return o;
};
const mutate=fn=>async(req,res)=>{
 const result=await tx(async c=>{await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,9473))',[req.factoryId]);const o=await scopedOrder(c,req);return fn(c,req,o);});
 await audit(req,{action:'update',entity:'finance',entityId:req.params.id,label:'Buyurtma moliyasi',after:{id:result?.id||null,action:req.path}});
 res.json(result);
};
r.get('/orders',async(req,res)=>res.json(await tx(async c=>{
 await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
 const fid=[req.factoryId];
 const orders=await rows('SELECT * FROM orders WHERE factory_id=$1 ORDER BY no DESC',fid,c);
 const shipped=await shippedByOrder(req.factoryId,null,c);
 return {orders:orders.map(o=>orderView(o,shipped)),progress:await rows('SELECT * FROM finance_order_progress WHERE factory_id=$1',fid,c),invoices:await rows('SELECT '+invoiceCols+' FROM finance_invoices WHERE factory_id=$1 ORDER BY date DESC,created_at DESC',fid,c),receipts:await rows('SELECT '+receiptCols+' FROM finance_receipts WHERE factory_id=$1 ORDER BY date DESC,created_at DESC',fid,c)};
})));
r.put('/orders/:id/progress',mutate(async(c,req,o)=>{
 if(!Array.isArray(req.body.items)||req.body.items.length>100)throw new ValidationError('Mahsulotlar noto‘g‘ri');
 const shipped=orderView(o,await shippedByOrder(req.factoryId,[o.id],c));const seen=new Set();
 for(const it of req.body.items){const line=shipped.items.find(i=>i.productId===it.productId);if(!line||seen.has(it.productId))throw new ValidationError('Mahsulot topilmadi yoki takrorlangan');seen.add(it.productId);
 const qty=number(it.readyQty,'Tayyor soni',line.shipped,Math.max(line.qty,line.shipped));
 await c.query('INSERT INTO finance_order_progress(factory_id,order_id,product_id,ready_qty) VALUES($1,$2,$3,$4) ON CONFLICT(factory_id,order_id,product_id) DO UPDATE SET ready_qty=EXCLUDED.ready_qty,updated_at=now()',[req.factoryId,o.id,it.productId,qty]);}
 return {ok:true};
}));
r.post('/orders/:id/invoices',mutate(async(c,req,o)=>{
 const b=req.body;if(!isId(b.requestId))throw new ValidationError('So‘rov raqami noto‘g‘ri');
 const old=await one('SELECT '+invoiceCols+' FROM finance_invoices WHERE factory_id=$1 AND request_id=$2',[req.factoryId,b.requestId],c);if(old){if(old.orderId!==o.id)throw new ConflictError('So‘rov boshqa buyurtmaga tegishli');return old;}
 const no=text(b.number,80);if(!no||!validDate(b.date))throw new ValidationError('Faktura raqami va sanasi majburiy');
 if(!Array.isArray(b.items)||!b.items.length||b.items.length>100)throw new ValidationError('Faktura mahsulotlarini kiriting');
 const pdf=pdfContent(b.contentBase64);const view=orderView(o,await shippedByOrder(req.factoryId,[o.id],c));
 const invoices=await rows('SELECT items FROM finance_invoices WHERE factory_id=$1 AND order_id=$2 AND voided_at IS NULL',[req.factoryId,o.id],c);
 const seen=new Set(),items=[];
 for(const it of b.items){const line=view.items.find(l=>l.productId===it.productId);if(!line||seen.has(it.productId))throw new ValidationError('Faktura mahsuloti noto‘g‘ri');seen.add(it.productId);
 const qty=number(it.qty,'Soni',.001,1e9),price=number(it.price,'Narx',0,1e12);
 const used=invoices.reduce((sum,x)=>sum+x.items.filter(i=>i.productId===it.productId).reduce((s,i)=>s+i.qty,0),0);
 if(qty+used>line.shipped+.00001)throw new ValidationError('Faktura soni jo‘natilgan, hali faktura qilinmagan sondan oshmasin');
 items.push({productId:it.productId,qty,price,amount:money(qty*price)});}
 const amount=money(items.reduce((s,i)=>s+i.amount,0));if(amount<=0)throw new ValidationError('Faktura summasi noldan katta bo‘lsin');
 const doc=await one('INSERT INTO finance_invoices(factory_id,order_id,request_id,number,date,items,amount,note,name,content_base64,size_bytes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING '+invoiceCols,[req.factoryId,o.id,b.requestId,no,b.date,JSON.stringify(items),amount,text(b.note,1000),text(b.name,160)||'Faktura.pdf',b.contentBase64,pdf.length,actor(req)],c);return doc;
}));
r.get('/invoices/:id/pdf',async(req,res)=>{
 if(!isId(req.params.id))throw new ValidationError('Faktura topilmadi');
 const file=await one('SELECT * FROM finance_invoices WHERE factory_id=$1 AND id=$2',[req.factoryId,req.params.id]);if(!file)return res.status(404).json({error:'Faktura topilmadi'});sendPdf(res,file);
});
r.post('/orders/:id/receipts',mutate(async(c,req,o)=>{
 const b=req.body;if(!isId(b.requestId)||!validDate(b.date))throw new ValidationError('Sana yoki so‘rov raqami noto‘g‘ri');
 const old=await one('SELECT '+receiptCols+' FROM finance_receipts WHERE factory_id=$1 AND request_id=$2',[req.factoryId,b.requestId],c);if(old){if(old.orderId!==o.id)throw new ConflictError('So‘rov boshqa buyurtmaga tegishli');return old;}
 let invoiceId=null;
 if(b.invoiceId){if(!isId(b.invoiceId))throw new ValidationError('Faktura noto‘g‘ri');const invoice=await one('SELECT id FROM finance_invoices WHERE factory_id=$1 AND order_id=$2 AND id=$3 AND voided_at IS NULL',[req.factoryId,o.id,b.invoiceId],c);if(!invoice)throw new ValidationError('Faktura topilmadi yoki bekor qilingan');invoiceId=invoice.id;}
 return one('INSERT INTO finance_receipts(factory_id,order_id,invoice_id,request_id,date,amount,note,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING '+receiptCols,[req.factoryId,o.id,invoiceId,b.requestId,b.date,number(b.amount,'To‘lov',.01,1e12),text(b.note,1000),actor(req)],c);
}));
for(const [path,table] of [['invoices','finance_invoices'],['receipts','finance_receipts']])r.post('/orders/:id/'+path+'/:entryId/void',mutate(async(c,req,o)=>{
 if(!isId(req.params.entryId)||!text(req.body.reason,500))throw new ValidationError('Bekor qilish sababi majburiy');
 if(path==='invoices'&&(await one('SELECT id FROM finance_receipts WHERE factory_id=$1 AND invoice_id=$2 AND voided_at IS NULL',[req.factoryId,req.params.entryId],c)))throw new ConflictError('Avval shu fakturaga bog‘langan to‘lovlarni bekor qiling');
 const entry=await one('UPDATE '+table+' SET voided_at=now(),void_reason=$4 WHERE factory_id=$1 AND order_id=$2 AND id=$3 AND voided_at IS NULL RETURNING id',[req.factoryId,o.id,req.params.entryId,text(req.body.reason,500)],c);
 if(!entry)throw new ConflictError('Yozuv topilmadi yoki bekor qilingan');return entry;
}));
export default r;
