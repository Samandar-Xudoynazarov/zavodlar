import {cleanAttendance} from './attendance.js';
// Rules mirror the referenced payroll sheet. Rates and month norm are explicit,
// not a statement of statutory tax/leave/overtime entitlements.
import { ValidationError, validDate, validMonth } from './valid.js';
export const PAY_ROLES = ['admin','rahbar','buxgalter'];
export const HR_ROLES = [...PAY_ROLES,'kadrlar'];
export const TIME_ROLES = [...HR_ROLES,'usta'];
export const money = n => {
  const value=Math.round((Number(n)+Number.EPSILON)*100);
  if(!Number.isSafeInteger(value))throw new ValidationError("Hisob summasi juda katta");
  return value/100;
};
const cents=n=>BigInt(Math.round(Number(n)*100));
function divideMoney(numerator,denominator) {
  const result=(numerator+denominator/2n)/denominator;
  if(result>BigInt(Number.MAX_SAFE_INTEGER))throw new ValidationError("Hisob summasi juda katta");
  return Number(result)/100;
}
export const today = () => new Date(Date.now()+5*3600000).toISOString().slice(0,10);
export const monthEnd = month => {
  if (!validMonth(month)) throw new ValidationError("Oy formati YYYY-MM");
  const [y,m] = month.split('-').map(Number);
  return `${month}-${String(new Date(Date.UTC(y,m,0)).getUTCDate()).padStart(2,'0')}`;
};
export function number(v,label,min=0,max=1e10) {
  if ((typeof v!=='number' && typeof v!=='string') || v==='' || !Number.isFinite(Number(v)) || +v<min || +v>max)
    throw new ValidationError(`${label}: qiymat noto'g'ri`);
  return money(+v);
}
export function text(v,max=120) { return String(v??'').trim().slice(0,max); }
export function employment(e,date) { return validDate(e.hireDate) && e.hireDate<=date && (!e.endDate || e.endDate>=date); }
export function inMonth(e,month) { return validDate(e.hireDate) && e.hireDate<=monthEnd(month) && (!e.endDate || e.endDate>=`${month}-01`); }
export function cleanDays(days,month,e) {
  if (!days || typeof days!=='object' || Array.isArray(days)) throw new ValidationError("Tabel noto'g'ri");
  const out={};
  for (const [key,v] of Object.entries(days)) {
    if (!/^([1-9]|[12]\d|3[01])$/.test(key)) throw new ValidationError("Tabel kuni noto'g'ri");
    const date=`${month}-${key.padStart(2,'0')}`;
    if (!validDate(date) || !employment(e,date)) throw new ValidationError("Sana xodimning ish davriga mos emas");
    out[key]=cleanAttendance(v);
  }
  return out;
}
export function calculatePayroll(month,employees,rates,previous=[],payments=[]) {
  const prior=new Map(previous.map(r=>[r.employeeId,r.balance]));
  const ids=new Set([...employees.filter(e=>inMonth(e,month.month)).map(e=>e.id),...[...prior].filter(([,v])=>v!==0).map(([id])=>id),...Object.keys(month.adjustments),...payments.filter(p=>!p.voidedAt).map(p=>p.employeeId)]);
  return [...ids].map(id=>{
    const e=employees.find(e=>e.id===id);
    if (!e) throw new ValidationError("Xodim topilmadi");
    const history=rates.filter(r=>r.employeeId===id).sort((a,b)=>a.effectiveDate.localeCompare(b.effectiveDate));
    const days=month.attendance[id]||{}; let hours=0,workedDays=0,baseNumerator=0n,coefNumerator=0n; const missingRates=[]; const segments={};
    for (const [day,d] of Object.entries(days)) {
      const date=`${month.month}-${day.padStart(2,'0')}`;
      if (!employment(e,date)) throw new ValidationError("Tabel ish davriga mos emas");
      if (!['work','trip'].includes(d.status) || !d.hours) continue;
      hours+=d.hours; workedDays++;
      const rate=history.filter(r=>r.effectiveDate<=date).at(-1);
      if (!rate) { missingRates.push(date); continue; }
      baseNumerator+=cents(rate.salary)*cents(d.hours); coefNumerator+=cents(rate.coefficient)*cents(d.hours);
      segments[rate.id]||={effectiveDate:rate.effectiveDate,salary:rate.salary,coefficient:rate.coefficient,grade:rate.grade,hours:0};
      segments[rate.id].hours+=d.hours;
    }
    const a=month.adjustments[id]||{};
    const opening=prior.has(id)?prior.get(id):(a.openingBalance||0);
    const extra=a.extra||0,tripPay=a.tripPay||0,deductions=a.deductions||0;
    const base=divideMoney(baseNumerator,cents(month.normHours)),coef=divideMoney(coefNumerator,cents(month.normHours));
    const gross=money(base+coef+extra+tripPay), tax=divideMoney(cents(gross)*cents(month.taxRate),10000n), net=money(gross-tax-deductions);
    const pays=payments.filter(p=>p.employeeId===id&&!p.voidedAt);
    const cash=money(pays.filter(p=>p.method==='cash').reduce((s,p)=>s+p.amount,0));
    const card=money(pays.filter(p=>p.method==='card').reduce((s,p)=>s+p.amount,0));
    return {employeeId:id,code:e.code,name:e.name,position:e.position,department:e.department,hours:money(hours),workedDays,base,coefficient:coef,extra,tripPay,deductions,openingBalance:opening,openingCarried:prior.has(id),gross,tax,net,cash,card,balance:money(opening+net-cash-card),note:a.note||'',segments:Object.values(segments),missingRates};
  });
}
export function withPayments(snapshot,payments) {
  return snapshot.map(row=>{
    const pays=payments.filter(p=>p.employeeId===row.employeeId&&!p.voidedAt);
    const cash=money(pays.filter(p=>p.method==='cash').reduce((s,p)=>s+p.amount,0)),card=money(pays.filter(p=>p.method==='card').reduce((s,p)=>s+p.amount,0));
    return {...row,cash,card,balance:money(row.openingBalance+row.net-cash-card)};
  });
}
