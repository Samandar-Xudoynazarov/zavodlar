import crypto from 'node:crypto';
import { ValidationError,validDate,validMonth } from './valid.js';
export const LEGACY_TABLES={materials:'materials',products:'products',targets:'targets',orders:'orders',days:'days',suppliers:'suppliers',inventories:'inventories',movements:'movements',productMoves:'product_moves',acctReports:'acct_reports',monthPlans:'month_plans',vehicleLogs:'vehicle_logs'};
export const OPERATION_TABLES=[...Object.values(LEGACY_TABLES),'settings','counters'];
const idOf=v=>v&&typeof v==='object'?v.$oid:String(v??'');
export function validateLegacyBackup(backup){
 if(!backup||backup.app!=='pto'||backup.format!==1||!backup.data||typeof backup.data!=='object'||Array.isArray(backup.data))throw new ValidationError('Eski ПТО JSON zaxira faylini tanlang (app: pto, format: 1)');
 const D=backup.data;let count=0;
 for(const key of [...Object.keys(LEGACY_TABLES),'settings','users','hrEmployees']){if(D[key]!==undefined&&!Array.isArray(D[key]))throw new ValidationError(key+' ro‘yxati noto‘g‘ri');if((D[key]?.length||0)>50000)throw new ValidationError(key+' ro‘yxati juda katta');count+=D[key]?.length||0;}
 if(!Array.isArray(D.materials)||!Array.isArray(D.products)||!D.materials.length&&!D.products.length)throw new ValidationError('Faylda material yoki mahsulotlar bo‘lishi kerak');
 if(count>100000||Buffer.byteLength(JSON.stringify(backup))>8388608)throw new ValidationError('Fayl juda katta (8 MB gacha)');
 const employeeCodes=new Set(),employeeIds=new Set();
 for(const e of D.hrEmployees||[]){
  if(!e||typeof e!=='object'||Array.isArray(e)||!String(e.name||'').trim()||String(e.name).length>120||!String(e.code||'').trim()||String(e.code).length>40)throw new ValidationError('Xodimning ismi va tabel raqamini tekshiring');
  const id=idOf(e._id);if(!/^(?:[a-f0-9]{24}|[a-f0-9-]{36})$/i.test(id)||employeeIds.has(id)||employeeCodes.has(e.code))throw new ValidationError('Xodim IDsi yoki tabel raqami takrorlangan');employeeIds.add(id);employeeCodes.add(e.code);
  if(e.hireDate&&!validDate(e.hireDate)||e.endDate&&(!validDate(e.endDate)||!e.hireDate||e.endDate<e.hireDate))throw new ValidationError('Xodim ish sanalarini tekshiring');
 }
 const known={};const seen=new Set();
 for(const key of Object.keys(LEGACY_TABLES)){known[key]=new Set();for(const row of D[key]||[]){if(!row||typeof row!=='object'||Array.isArray(row))throw new ValidationError(key+': qator noto‘g‘ri');const id=idOf(row._id);if(!/^(?:[a-f0-9]{24}|[a-f0-9-]{36})$/i.test(id)||seen.has(id))throw new ValidationError(key+': yozuv IDsi yo‘q yoki takrorlangan');seen.add(id);known[key].add(id);for(const [field,v] of Object.entries(row)){if(typeof v==='number'&&!Number.isFinite(v))throw new ValidationError(key+': son noto‘g‘ri');}if(['days','movements','inventories','productMoves','vehicleLogs'].includes(key)&&!validDate(row.date))throw new ValidationError(key+': sana noto‘g‘ri');if(['acctReports','monthPlans'].includes(key)&&!validMonth(row.month))throw new ValidationError(key+': oy noto‘g‘ri');}}
 const ref=(type,id,label,optional=false)=>{if(optional&&!id)return;if(!known[type]?.has(idOf(id)))throw new ValidationError(label+': bog‘langan '+type+' topilmadi');};
 for(const m of D.materials){if(!String(m.name||'').trim())throw new ValidationError('Material nomi kiritilmagan');for(const h of [m,...(m.history||[])])for(const l of [...(h.recipe||[]),...(h.writeoff||[])])ref('materials',l.materialId,m.name);}
 for(const p of D.products){if(!String(p.code||'').trim())throw new ValidationError('Mahsulot markasi kiritilmagan');for(const l of [...(p.norms||[]),...(p.calc?.items||[])])ref('materials',l.materialId,p.code);}
 for(const o of D.orders||[])for(const l of o.items?.length?o.items:o.lines?.length?o.lines:[{productId:o.productId}])ref('products',l.productId,'Buyurtma №'+o.no);
 for(const d of D.days||[]){for(const l of [...(d.production||[]),...(d.shipments||[])])ref('products',l.productId,d.date);for(const l of d.materials||[])ref('materials',l.materialId,d.date);}
 for(const m of D.movements||[]){ref('materials',m.materialId,'Ombor harakati');ref('targets',m.departmentId,'Sex',true);ref('targets',m.vehicleId,'Mashina',true);ref('inventories',m.inventoryId,'Inventarizatsiya',true);}
 for(const inv of D.inventories||[])for(const l of inv.lines||[])ref('materials',l.materialId,'Inventarizatsiya');
 for(const p of D.productMoves||[]){ref('products',p.productId,'Tayyor mahsulot');if(p.type==='fix')ref('products',p.toProductId,'Marka almashtirish');}
 for(const l of D.vehicleLogs||[])ref('targets',l.vehicleId,'Texnika jurnali');
 for(const s of D.settings||[]){for(const id of Object.keys(s.opening?.materials||{}))ref('materials',id,'Boshlang‘ich qoldiq');for(const id of Object.keys(s.opening?.products||{}))ref('products',id,'Boshlang‘ich qoldiq');}
 return {counts:Object.fromEntries([...Object.keys(LEGACY_TABLES),'settings',...(D.hrEmployees?['hrEmployees']:[])].map(k=>[k,D[k]?.length||0])),skippedUsers:D.users?.length||0};
}
export async function prepareLegacyImport(backup){
 validateLegacyBackup(backup);const D=backup.data;const orderIds=new Set((D.orders||[]).map(x=>idOf(x._id)));
const ids = new Map();
const oid = (v) => (v && typeof v === "object" ? v.$oid || String(v) : v);
const U = (v) => {
  const k = oid(v);
  if (k === null || k === undefined || k === "") return null;
  if (!ids.has(String(k))) ids.set(String(k), crypto.randomUUID());
  return ids.get(String(k));
};
const ts = (v) => {const date=v?new Date(v.$date||v):new Date();if(!Number.isFinite(date.getTime()))throw new ValidationError('Yozuv vaqti noto‘g‘ri');return date;};
const mapLines = (arr, key) => (arr || []).map((l) => ({ ...l, [key]: U(l[key]) }));
const mapKeys = (o) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [U(k), v]));
const who = (w) => (w ? { id: U(w.id) || "", username: w.username || "", name: w.name || "" } : null);

const records={};
 const ins=async(table,obj)=>{(records[table]||=[]).push(obj);};
 const base=x=>({id:U(x._id),createdAt:ts(x.createdAt),updatedAt:ts(x.updatedAt||x.createdAt)});
  for (const m of D.materials)
    await ins("materials", {
      ...base(m), name: m.name, unit: m.unit || "шт", group: m.group || "boshqa", price: +m.price || 0, stock: m.stock !== false, electrodeBase: !!m.electrodeBase,
      isElectrode: !!m.isElectrode, code: m.code || "", minQty: +m.minQty || 0, kgPerM: m.kgPerM ?? null, archived: !!m.archived,
      history: (m.history||[]).map(h=>({...h,recipe:mapLines(h.recipe,"materialId"),writeoff:mapLines(h.writeoff,"materialId")})), recipe: mapLines(m.recipe, "materialId"), writeoff: mapLines(m.writeoff, "materialId"), sort: m.sort || 0,
    });
  for (const p of D.products)
    await ins("products", {
      ...base(p), code: p.code, name: p.name || "", group: p.group || "Бошқа", norms: mapLines(p.norms, "materialId"),
      calc: { ...(p.calc || {}), items: mapLines(p.calc?.items, "materialId") }, notes: p.notes || [], excelPrice: p.excelPrice ?? null,
      forms: +p.forms || 0, cycleDays: +p.cycleDays || 1, sort: p.sort || 0,
    });
  for (const t of D.targets || [])
    await ins("targets", { ...base(t), kind: t.kind, name: t.name, code: t.code || "", archived: !!t.archived, meterUnit: t.meterUnit || "km", fuelNorm: +t.fuelNorm || 0, serviceEvery: +t.serviceEvery || 0 });
  for (const o of D.orders || [])
    await ins("orders", {
      ...base(o), no: o.no, customer: o.customer, contractNo: String(o.contractNo || "").replace(/^№\s*/, "").slice(0, 60),
      // ko'p mahsulotli buyurtma (items); eski ilovaning birinchi versiyasida bitta mahsulot bo'lgan — bitta qator
      items: (o.items?.length ? o.items : o.lines?.length ? o.lines : [{ productId: o.productId, qty: o.qty, price: o.price }]).map((l) => ({
        productId: U(l.productId), qty: +l.qty || 0, price: +l.price || 0, shippedBefore: +l.shippedBefore || 0,
      })),
      date: o.date || "", deadline: o.deadline || "", status: o.status || "yangi", note: o.note || "",
    });
  for (const d of D.days || [])
    await ins("days", {
      ...base(d), date: d.date, note: d.note || "",
      production: mapLines(d.production, "productId"),
      materials: mapLines(d.materials, "materialId"),
      shipments: (d.shipments || []).map((s) => ({ ...s, productId: U(s.productId), orderId: orderIds.has(String(oid(s.orderId))) ? U(s.orderId) : null, dispatchId: null })),
    });
  for (const s of D.suppliers || [])
    await ins("suppliers", { ...base(s), name: s.name, phone: s.phone || "", inn: s.inn || "", contact: s.contact || "", note: s.note || "", archived: !!s.archived });
  for (const i of D.inventories || [])
    await ins("inventories", {
      ...base(i), no: i.no, date: i.date, status: i.status, group: i.group || "", blind: !!i.blind, note: i.note || "",
      lines: mapLines(i.lines, "materialId"), createdBy: who(i.createdBy), approvedBy: i.approvedBy ? { ...who(i.approvedBy), at: i.approvedBy.at } : null,
    });
  for (const m of D.movements || [])
    await ins("movements", {
      ...base(m), type: m.type, date: m.date, materialId: U(m.materialId), qty: m.qty, inputQty: m.inputQty ?? null, inputUnit: m.inputUnit || "", factor: m.factor ?? null,
      price: +m.price || 0, supplier: m.supplier || "", docNumber: m.docNumber || "", departmentId: U(m.departmentId), vehicleId: U(m.vehicleId), person: m.person || "",
      meter: m.meter ?? null, note: m.note || "", reason: m.reason || "", inventoryId: U(m.inventoryId), createdBy: who(m.createdBy),
    });
  for (const p of D.productMoves || [])
    await ins("product_moves", {
      ...base(p), type: p.type === "fix" ? "fix" : "brak", date: p.date, productId: U(p.productId), toProductId: p.type === "fix" ? U(p.toProductId) : null,
      qty: p.qty, reason: p.reason || "boshqa", note: p.note || "", createdBy: who(p.createdBy),
    });
  for (const a of D.acctReports || [])
    await ins("acct_reports", {
      ...base(a), month: a.month, date: a.date || "", rows: (a.rows || []).map((r) => ({ ...r, productId: r.productId ? U(r.productId) : null })),
      otherCosts: +a.otherCosts || 0, director: a.director || "", chief: a.chief || "", accountant: a.accountant || "", updatedBy: who(a.updatedBy),
    });
  for (const m of D.monthPlans || [])
    await ins("month_plans", {
      ...base(m), month: m.month, title: m.title || "", source: m.source || "qolda", fileName: m.fileName || "", note: m.note || "",
      customers: m.customers || [], extraCols: m.extraCols || [], rows: (m.rows || []).map((r) => ({ ...r, productId: r.productId ? U(r.productId) : null })), updatedBy: who(m.updatedBy),
    });
  for (const l of D.vehicleLogs || [])
    await ins("vehicle_logs", { ...base(l), vehicleId: U(l.vehicleId), date: l.date, kind: l.kind || "tamir", cost: +l.cost || 0, meter: l.meter ?? null, note: l.note || "", createdBy: who(l.createdBy) });


 const sourceSettings=(D.settings||[]).find(x=>x.key==='main')||D.settings?.[0];
 const s=sourceSettings||{};
 const opening={date:s.opening?.date||'',materials:mapKeys(s.opening?.materials),products:mapKeys(s.opening?.products)};
 await ins('settings',{electrodePct:s.electrodePct??1.5,company:s.company||'',signers:s.signers||[],opening,calcTemplate:s.calcTemplate?{...s.calcTemplate,items:mapLines(s.calcTemplate.items,'materialId')}:null,costSchemes:s.costSchemes||null,plan:s.plan||{concretePerDay:0,workDays:[1,2,3,4,5,6],holidays:[]}});
 for(const e of D.hrEmployees||[])await ins('hr_employees',{id:U(e._id),code:String(e.code).trim(),name:String(e.name).trim(),position:String(e.position||'').trim().slice(0,120),department:String(e.department||'').trim().slice(0,120),phone:String(e.phone||'').trim().slice(0,40),hireDate:e.hireDate||'',endDate:e.endDate||'',notes:String(e.notes||'').slice(0,1500),profile:{}});
 return records;
}
