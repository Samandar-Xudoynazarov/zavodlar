import {ValidationError} from './valid.js';
const value=v=>{if((typeof v!=='number'&&typeof v!=='string')||v===''||!Number.isFinite(+v)||+v<0||+v>24)throw new ValidationError('Ish soati 0–24 oralig‘ida bo‘lsin');return Math.round(+v*100)/100;};
export function cleanAttendance(v){
 if(!['work','off','leave','sick','absent','trip'].includes(v?.status))throw new ValidationError('Davomat holati noto‘g‘ri');
 if(v.shiftCount!==undefined&&![1,2].includes(v.shiftCount))throw new ValidationError('Bir yoki ikki smenani tanlang');
 if(!['day','night'].includes(v.shift))throw new ValidationError('Smena noto‘g‘ri');
 const hours=value(v.hours),working=['work','trip'].includes(v.status);
 if(!working&&hours!==0)throw new ValidationError('Bu holatda ish soati nol bo‘lishi kerak');
 if(v.shiftCount!==2){if(v.shifts!==undefined)throw new ValidationError('Ikki smena soatlari uchun ikki smenali rejimni tanlang');return {status:v.status,hours,shift:v.shift};}
 if(!Array.isArray(v.shifts)||v.shifts.length!==2)throw new ValidationError('Har ikki smenaning soatini kiriting');
 const shifts=v.shifts.map(s=>{if(!['day','night'].includes(s?.shift))throw new ValidationError('Smena noto‘g‘ri');return {shift:s.shift,hours:value(s.hours)};});
 if(shifts[0].shift===shifts[1].shift||v.shift!==shifts[0].shift)throw new ValidationError('Birinchi va ikkinchi smena takrorlanmasin');
 const total=Math.round((shifts[0].hours+shifts[1].hours)*100)/100;
 if(total>24||total!==hours)throw new ValidationError('Ikki smena jami soati noto‘g‘ri yoki 24 soatdan oshgan');
 if(!working&&shifts.some(s=>s.hours!==0))throw new ValidationError('Bu holatda har ikki smena soati nol bo‘lishi kerak');
 return {status:v.status,hours:total,shift:v.shift,shiftCount:2,shifts};
}
