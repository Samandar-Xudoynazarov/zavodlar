import { Router } from 'express';
import { one, rows, tx } from '../db.js';
import { isId, validDate, ValidationError, ConflictError } from '../valid.js';
import { actor } from '../dispatch.js';
import { number, text } from '../payroll.js';
import { notFound, todayTashkent } from '../common.js';
import { audit } from '../audit.js';

import {supplierMaterials,matchReceipt} from '../supplier-materials.js';
const r = Router();
const columns = 'id,kind,date,number,amount,due_date,remaining';

r.get('/', async (req, res) => {
  res.json(await rows(`SELECT s.id,s.name,s.archived,
      coalesce(sum(l.remaining) FILTER (WHERE l.kind IN ('invoice','opening_debt')),0) AS debt,
      coalesce(sum(l.remaining) FILTER (WHERE l.kind IN ('payment','opening_advance')),0) AS advance,
      coalesce(sum(l.remaining) FILTER (WHERE l.due_date < $2),0) AS overdue
    FROM suppliers s LEFT JOIN supplier_ledger l ON l.factory_id=s.factory_id AND l.supplier_id=s.id
    WHERE s.factory_id=$1 GROUP BY s.id HAVING NOT s.archived OR count(l.id)>0
    ORDER BY overdue DESC, debt DESC, lower(s.name)`, [req.factoryId,todayTashkent()]));
});

r.post('/', async (req, res) => {
  const name = text(req.body?.name,160).replace(/\s+/g,' ');
  if (!name) throw new ValidationError('Ta’minotchi nomini kiriting');
  const supplier = await one('INSERT INTO suppliers(factory_id,name) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING id,name',[req.factoryId,name]);
  if (!supplier) throw new ConflictError('Bu ta’minotchi katalogda bor. Uni nomi bo‘yicha qidiring.');
  await audit(req,{action:'create',entity:'supplier',entityId:supplier.id,label:name,after:supplier});
  res.status(201).json(supplier);
});

r.use('/:id', async (req,res,next) => {
  if (!isId(req.params.id)) return notFound(res);
  req.party = await one('SELECT id,name FROM suppliers WHERE factory_id=$1 AND id=$2',[req.factoryId,req.params.id]);
  return req.party ? next() : notFound(res);
});

r.get('/:id', async (req,res) => {
  const params=[req.factoryId,req.party.id];
  res.json(await tx(async c => {
    await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
    const ledger = await rows('SELECT '+columns+' FROM supplier_ledger WHERE factory_id=$1 AND supplier_id=$2 ORDER BY date,kind,id',params,c);
    const allocations = await rows(`SELECT a.id,a.source_id,coalesce(a.invoice_id,a.opening_id) AS target_id,a.amount
      FROM supplier_allocations a JOIN supplier_entries e ON e.id=a.source_id
      WHERE a.factory_id=$1 AND e.supplier_id=$2 AND a.voided_at IS NULL ORDER BY a.created_at`,params,c);
    return {supplier:req.party, ledger, allocations,materials:await supplierMaterials(c,req.factoryId,req.party)};
  }));
});

function edit(label, action) {
  return async (req,res) => {
    const b=req.body || {};
    const result=await tx(async c=>{
      // Same lock as invoice creation/void: a payment cannot be attached to a disappearing invoice.
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,9473))',[req.factoryId]);
      return action(c,req,b,[req.factoryId,req.party.id]);
    });
    await audit(req,{action:'update',entity:'supplierSettlement',entityId:req.party.id,label,after:result});
    res.json(result);
  };
}
function requestKey(key) {
  if (!isId(key)) throw new ValidationError('So‘rov raqami noto‘g‘ri');
  return key;
}
function amount(value, min=0.01) {
  const n=number(value,'Summa',min,1e12);
  if (n!==Number(value) || !String(value).trim()) throw new ValidationError('Summani ikki xonagacha aniqlikda kiriting');
  return n;
}

async function allocate(c, req, sourceId, targetId, value, key) {
  if (!isId(sourceId) || !isId(targetId)) throw new ValidationError('To‘lov va hujjatni tanlang');
  const params=[req.factoryId,req.party.id];
  const items=await rows('SELECT '+columns+' FROM supplier_ledger WHERE factory_id=$1 AND supplier_id=$2 AND id IN ($3,$4)',[...params,sourceId,targetId],c);
  const source=items.find(i=>i.id===sourceId && ['payment','opening_advance'].includes(i.kind));
  const target=items.find(i=>i.id===targetId && ['invoice','opening_debt'].includes(i.kind));
  if (!source || !target || value>source.remaining || value>target.remaining) {
    throw new ConflictError('Summa mavjud avans yoki hujjat qoldig‘idan katta. Hisobni yangilang.');
  }
  return one(`INSERT INTO supplier_allocations(factory_id,request_id,source_id,invoice_id,opening_id,amount,created_by)
    VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,amount`,[req.factoryId,key,sourceId,target.kind==='invoice'?targetId:null,target.kind==='opening_debt'?targetId:null,value,actor(req)],c);
}

r.post('/:id/entries', edit('Ta’minotchi hisobidagi yozuv', async(c,req,b,params)=>{
  const key=requestKey(b.requestId);
  const old=await one('SELECT id FROM supplier_entries WHERE factory_id=$1 AND supplier_id=$2 AND request_id=$3',[...params,key],c);
  if (old) return old;
  const kind=b.kind;
  if (!['payment','opening_debt','opening_advance'].includes(kind) || !validDate(b.date) || b.date>todayTashkent()) {
    throw new ValidationError('Yozuv turi yoki sana noto‘g‘ri');
  }
  const opening=await one("SELECT date FROM supplier_entries WHERE factory_id=$1 AND supplier_id=$2 AND kind!='payment' AND voided_at IS NULL",params,c);
  const isPayment=kind==='payment';
  if (opening && (!isPayment || b.date<opening.date)) throw new ConflictError('Boshlang‘ich qoldiq allaqachon kiritilgan. To‘lov sanasi undan oldin bo‘la olmaydi.');
  if (!isPayment) {
    const earlier=await one(`SELECT 1 FROM supplier_entries
      WHERE factory_id=$1 AND supplier_id=$2 AND date<$3 AND voided_at IS NULL
      UNION ALL SELECT 1 FROM supplier_allocations a JOIN material_invoices i ON i.id=a.invoice_id
      WHERE a.factory_id=$1 AND i.supplier_id=$2 AND i.date<$3 AND a.voided_at IS NULL LIMIT 1`,[...params,b.date],c);
    if (earlier) throw new ConflictError('Boshlang‘ich qoldiq sanasini avvalgi to‘lov va bog‘langan fakturalardan oldin yoki o‘sha kunga qo‘ying.');
  }
  const value=amount(b.amount,isPayment?0.01:0);
  const docNo=text(b.number,100);
  if (isPayment && !docNo) throw new ValidationError('To‘lov hujjati raqamini kiriting');
  if (isPayment && await one("SELECT id FROM supplier_entries WHERE factory_id=$1 AND supplier_id=$2 AND date=$3 AND lower(number)=lower($4) AND kind='payment' AND voided_at IS NULL",[...params,b.date,docNo],c)) {
    throw new ConflictError('Shu sana va raqamdagi to‘lov kiritilgan.');
  }
  const entry=await one(`INSERT INTO supplier_entries(factory_id,supplier_id,request_id,kind,date,amount,number,created_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,kind,date,number,amount`,[...params,key,kind,b.date,value,docNo,actor(req)],c);
  if(isPayment && b.contractId){
    if(!isId(b.contractId)||!isId(b.materialId))throw new ValidationError('Shartnoma materialini tanlang');
    const contract=await one('SELECT items FROM finance_contracts WHERE factory_id=$1 AND supplier_id=$2 AND id=$3',[...params,b.contractId],c);
    const line=contract?.items.find(l=>l.materialId===b.materialId);
    if(!line)throw new ValidationError('Material shartnomada topilmadi');
    const qty=Math.round(value*line.qty*line.factor/line.total*1e6)/1e6;
    if(!(qty>0))throw new ValidationError('Avans miqdori juda kichik');
    await c.query('UPDATE supplier_entries SET contract_id=$2,advance_material_id=$3,advance_qty=$4 WHERE id=$1',[entry.id,b.contractId,b.materialId,qty]);
  }
  if (isPayment && b.targetId) await allocate(c,req,entry.id,b.targetId,value,key);
  return entry;
}));

r.post('/:id/allocations', edit('Avansni hujjatga bog‘lash',async(c,req,b,params)=>{
  const key=requestKey(b.requestId);
  const old=await one(`SELECT a.id FROM supplier_allocations a JOIN supplier_entries e ON e.id=a.source_id
    WHERE a.factory_id=$1 AND e.supplier_id=$2 AND a.request_id=$3`,[...params,key],c);
  return old || allocate(c,req,b.sourceId,b.targetId,amount(b.amount),key);
}));

r.post('/:id/cancel',edit('Ta’minotchi yozuvini bekor qilish',async(c,req,b,params)=>{
  const reason=text(b.reason,500);
  if (!reason || !isId(b.id)) throw new ValidationError('Yozuv va sababni kiriting');
  if (b.kind==='allocation') {
    const changed=await one(`UPDATE supplier_allocations a SET voided_at=now(),void_reason=$4 FROM supplier_entries e
      WHERE a.source_id=e.id AND a.factory_id=$1 AND e.supplier_id=$2 AND a.id=$3 AND a.voided_at IS NULL RETURNING a.id`,[...params,b.id,reason],c);
    if (!changed) throw new ConflictError('Bog‘lanish topilmadi');
  } else {
    const active=await one('SELECT id FROM supplier_allocations WHERE factory_id=$1 AND (source_id=$2 OR opening_id=$2) AND voided_at IS NULL LIMIT 1',[req.factoryId,b.id],c);
    if (active) throw new ConflictError('Avval hujjatga bog‘langan summani ajrating.');
    const changed=await one('UPDATE supplier_entries SET voided_at=now(),void_reason=$4 WHERE factory_id=$1 AND supplier_id=$2 AND id=$3 AND voided_at IS NULL RETURNING id',[...params,b.id,reason],c);
    if (!changed) throw new ConflictError('Yozuv topilmadi');
  }
  return {id:b.id,reason};
}));
r.post('/:id/due-date',edit('Fakturaning to‘lov muddati',async(c,req,b,params)=>{
  if (!isId(b.invoiceId) || !validDate(b.dueDate)) throw new ValidationError('Faktura va muddatni tanlang');
  const invoice=await one(`UPDATE material_invoices SET due_date=$4 WHERE factory_id=$1 AND supplier_id=$2
    AND id=$3 AND date<=$4 AND type='in' AND voided_at IS NULL RETURNING id,due_date`,[...params,b.invoiceId,b.dueDate],c);
  if (!invoice) throw new ValidationError('Faktura yoki muddat noto‘g‘ri');
  return invoice;
}));
r.post('/:id/material-matches',edit('Fakturani kirimga bog‘lash',(c,req,b)=>matchReceipt(c,req.factoryId,req.party,b)));
export default r;
