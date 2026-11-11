import { one, rows } from './db.js';
import { isId, validDate, ValidationError, ConflictError } from './valid.js';
export const FINANCE_ROLES=['admin','rahbar','buxgalter'];
export const actor=req=>({id:req.user.id,name:req.user.name||req.user.username});
export function pdfContent(value) {
 if(typeof value!=='string'||value.length>11184812||!value.length||!/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new ValidationError('PDF fayl noto‘g‘ri (8 MB gacha)');
 const b=Buffer.from(value,'base64');
 if(!b.length||b.length>8388608||b.subarray(0,5).toString()!=='%PDF-')throw new ValidationError('Faqat PDF fayl qabul qilinadi (8 MB gacha)');
 return b;
}
export function sendPdf(res,file) {
 res.set({'Content-Type':'application/pdf','Content-Disposition':`inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).send(Buffer.from(file.contentBase64,'base64'));
}
export async function archiveDispatch(c,req,date,shipments,input) {
 if(input) {
  if(!isId(input.id)||!validDate(input.date)||input.date!==date||!String(input.number||'').trim())throw new ValidationError('Накладная raqami va sanasini tekshiring');
  input={...input,id:input.id.toLowerCase()};
  const b=pdfContent(input.contentBase64);
  const linked=shipments.filter(s=>s.dispatchId===input.id);
  if(!linked.length)throw new ValidationError('Накладная jo‘natish bilan bog‘lanmagan');
  const existing=await one('SELECT * FROM dispatch_documents WHERE id=$1',[input.id],c);
  if(existing) {
   if(existing.factoryId!==req.factoryId||existing.contentBase64!==input.contentBase64)throw new ConflictError('Накладная allaqachon boshqa holatda saqlangan');
  } else {
   await c.query('INSERT INTO dispatch_documents(id,factory_id,number,date,receiver,vehicle,name,content_base64,size_bytes,payload,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[input.id,req.factoryId,String(input.number).trim().slice(0,80),date,String(input.receiver||'').slice(0,160),String(input.vehicle||'').slice(0,40),String(input.name||'Nakladnaya.pdf').slice(0,160),input.contentBase64,b.length,JSON.stringify({shipments:linked}),actor(req)]);
  }
 }
 const ids=[...new Set(shipments.map(s=>s.dispatchId).filter(Boolean))];
 if(ids.length) {
  const docs=await rows('SELECT id,number,date,payload FROM dispatch_documents WHERE factory_id=$1 AND id=ANY($2::uuid[])',[req.factoryId,ids],c);
  if(docs.length!==ids.length)throw new ValidationError('Накладная topilmadi yoki boshqa zavodga tegishli');
  for(const s of shipments)if(s.dispatchId){const d=docs.find(d=>d.id===s.dispatchId);if(d.date!==date)throw new ValidationError('Накладная sanasi mos emas');
   const remaining=d._remaining||(d._remaining=[...(d.payload.shipments||[])]);
   const idx=remaining.findIndex(x=>x.productId===s.productId&&+x.qty===+s.qty&&(x.orderId||null)===(s.orderId||null)&&(x.customer||'')===(s.customer||'')&&(x.vehicle||'')===(s.vehicle||''));
   if(idx<0)throw new ValidationError('Jo‘natish tafsilotlari saqlangan накладнаяga mos emas. Yangi накладная tayyorlang');remaining.splice(idx,1);s.dispatchNo=d.number;}
 }
}
