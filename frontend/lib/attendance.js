export const workingDay=v=>['work','trip'].includes(v?.status);
export const oppositeShift=s=>s==='night'?'day':'night';
const round=n=>Math.round((Number(n)||0)*100)/100;
export function shiftEntries(v){return v?.shiftCount===2&&Array.isArray(v.shifts)?v.shifts:[{hours:Number(v?.hours)||0,shift:v?.shift||'day'}];}
export function emptyAttendance(count=1){return count===2?{status:'',hours:0,shift:'day',shiftCount:2,shifts:[{shift:'day',hours:0},{shift:'night',hours:0}]}:{status:'',hours:0,shift:'day'};}
export function updateAttendance(value,key,input){
 let v={...value};const entries=shiftEntries(v).map(s=>({...s}));
 if(key==='shiftCount'){
  if(+input===2){const first={shift:v.shift||'day',hours:Number(v.hours)||0};return {...v,shiftCount:2,shifts:[first,{shift:oppositeShift(first.shift),hours:0}]};}
  delete v.shiftCount;delete v.shifts;return v;
 }
 if(key==='status'){
  v.status=input;
  if(!workingDay(v)){v.hours=0;if(v.shiftCount===2)v.shifts=entries.map(s=>({...s,hours:0}));return v;}
  if(!v.hours){v.hours=8;if(v.shiftCount===2)v.shifts=[{...entries[0],hours:8},{...entries[1],hours:0}];}return v;
 }
 if(key==='shift'){
  v.shift=input;if(v.shiftCount===2)v.shifts=[{...entries[0],shift:input},{...entries[1],shift:oppositeShift(input)}];return v;
 }
 if(key==='firstHours'||key==='secondHours'){
  const index=key==='secondHours'?1:0;entries[index]={...entries[index],hours:input===''?0:Number(input)};
  if(v.shiftCount===2){v.shifts=entries;v.hours=round(entries.reduce((sum,s)=>sum+(Number(s.hours)||0),0));}else v.hours=entries[0].hours;return v;
 }
 if(key==='hours')return updateAttendance(v,'firstHours',input);
 return {...v,[key]:input};
}
