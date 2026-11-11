import { rows } from './db.js';
import { itemsOf,shipKey } from './orders.js';
import { ConflictError } from './valid.js';
export const financeLock=(c,f)=>c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,9473))',[f]);
export async function assertInvoiceCoverage(c,f,change={}) {
 const invoices=await rows('SELECT order_id,items FROM finance_invoices WHERE factory_id=$1 AND voided_at IS NULL',[f],c);
 if(!invoices.length)return;
 const days=await rows('SELECT date,shipments FROM days WHERE factory_id=$1',[f],c);
 const orders=await rows('SELECT id,items FROM orders WHERE factory_id=$1',[f],c);
 const shipped=new Map();
 for(const old of orders){const o=change.order?.id===old.id?change.order:old;for(const it of itemsOf(o))shipped.set(shipKey(o.id,it.productId),+it.shippedBefore||0);}
 const shipments=days.filter(d=>d.date!==change.date).flatMap(d=>d.shipments).concat(change.shipments||[]);
 for(const s of shipments){const k=shipKey(s.orderId,s.productId);shipped.set(k,(shipped.get(k)||0)+(+s.qty||0));}
 const invoiced=new Map();for(const inv of invoices)for(const it of inv.items){const k=shipKey(inv.orderId,it.productId);invoiced.set(k,(invoiced.get(k)||0)+it.qty);}
 for(const [k,qty] of invoiced)if(qty>(shipped.get(k)||0)+.00001)throw new ConflictError('Jo‘natishni kamaytirib bo‘lmaydi: shu mahsulotga faktura yozilgan. Avval fakturani tekshiring');
}
