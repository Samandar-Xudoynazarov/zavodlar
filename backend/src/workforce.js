import { ValidationError } from './valid.js';
export const KINDS=['leave','shift','order','document','equipment'];
export const DECIDERS=['admin','rahbar','kadrlar'];
export function datesBetween(start,end) {
 const dates=[];
 for(let d=new Date(start+'T00:00:00Z');d.toISOString().slice(0,10)<=end;d.setUTCDate(d.getUTCDate()+1)) dates.push(d.toISOString().slice(0,10));
 return dates;
}
export function annualDays(record,year) {
 if(record.kind!=='leave'||record.status!=='approved'||record.detail.leaveType!=='annual')return 0;
 const start=record.startDate>`${year}-01-01`?record.startDate:`${year}-01-01`;
 const end=record.endDate<`${year}-12-31`?record.endDate:`${year}-12-31`;
 return start>end?0:Math.round((Date.parse(end)-Date.parse(start))/86400000)+1;
}
export function plannedDays(record) {
 if(!['leave','shift'].includes(record.kind))throw new ValidationError('Bu yozuv tabelga qo‘llanmaydi');
 return datesBetween(record.startDate,record.endDate).map(date=>({date,value:record.kind==='leave'
  ?{status:'leave',hours:0,shift:'day'}
  :record.detail.workDays.includes(new Date(date+'T00:00:00Z').getUTCDay())
   ?{status:'work',hours:record.detail.hours,shift:record.detail.shift}
   :{status:'off',hours:0,shift:'day'}}));
}
