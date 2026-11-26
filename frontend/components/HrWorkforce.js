"use client";
import { show } from '@/lib/i18n';
import { matches } from '@/lib/script';
import HrNavigation from './HrNavigation';
import HrDeadlineNotice from './HrDeadlineNotice';
import HrDashboard from './HrDashboard';
import { useCallback,useEffect,useRef,useState } from 'react';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useUser } from '@/lib/role';
import { today, fmtDate } from '@/lib/calc';
import { downloadRecordOrderPdf, downloadLeaveSchedulePdf } from '@/lib/hr-documents';
import { hasRecordOrder } from '@/lib/hr-record-orders';

const TYPES={leaves:['leave','Ta’tillar'],shifts:['shift','Smena rejasi'],orders:['order','Buyruqlar'],documents:['document','Hujjat muddatlari'],equipment:['equipment','Himoya vositalari']};
const STATES={draft:'Qoralama',approved:'Tasdiqlangan',cancelled:'Bekor qilingan',completed:'Yakunlangan'};
const LEAVE=[['annual','Yillik ta’til'],['unpaid','Ish haqi saqlanmaydigan ta’til']];
const DOCS=[['contract','Mehnat shartnomasi'],['medical','Tibbiy ko‘rik'],['safety','Xavfsizlik yo‘riqnomasi'],['qualification','Malaka guvohnomasi'],['other','Boshqa']];
const ORDERS=[['hire','Ishga qabul qilish'],['transfer','Lavozimga o‘tkazish'],['salary','Maosh o‘zgarishi'],['termination','Mehnat shartnomasini bekor qilish'],['reward','Rag‘batlantirish'],['penalty','Intizomiy jazo'],['other','Boshqa']];
const REWARDS=[['gratitude','Tashakkur e’lon qilish'],['bonus','Pul mukofoti'],['gift','Qimmatbaho sovg‘a'],['honor','Faxriy yorliq'],['other','Boshqa']];
const PENALTIES=[['reprimand','Hayfsan'],['fine','Jarima'],['other','Boshqa']];
const EXPLAIN=[['received','Yozma tushuntirish olindi'],['refused','Tushuntirishdan bosh tortdi, dalolatnoma tuzildi']];
const pad=n=>String(n).padStart(2,'0');
const yearLater=d=>{const [y,m,dd]=d.split('-').map(Number);return new Date(Date.UTC(y+1,m-1,dd-1)).toISOString().slice(0,10);};
function usedDays(r,year){
 if(r.kind!=='leave'||r.status!=='approved'||r.detail.leaveType!=='annual')return 0;
 const a=r.startDate>`${year}-01-01`?r.startDate:`${year}-01-01`,b=r.endDate<`${year}-12-31`?r.endDate:`${year}-12-31`;
 return a>b?0:Math.round((Date.parse(b)-Date.parse(a))/86400000)+1;
}
export default function HrWorkforce({view,onViewChange,notify,openForm,canWrite,tabs}) {
 const t=useT(),{user}=useUser();const decide=['admin','rahbar','kadrlar'].includes(user.role);
 const [data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [query,setQuery]=useState(''),[status,setStatus]=useState('all'),[year,setYear]=useState(()=>+today().slice(0,4));
 const request=useRef(0),alive=useRef(true),operation=useRef(false);
 const load=useCallback(async()=>{
  const id=++request.current;setLoading(true);setError('');setData(null);
  try{const result=await api('/hr/workforce');if(id===request.current&&alive.current)setData(result);}
  catch(e){if(id===request.current&&alive.current)setError(e.message);}
  finally{if(id===request.current&&alive.current)setLoading(false);}
 },[user.factory?.id]);
 useEffect(()=>{alive.current=true;load();return()=>{alive.current=false;request.current++;};},[load]);
 useEffect(()=>{setQuery('');setStatus('all');},[view]);
 const run=async(fn)=>{if(operation.current)return;operation.current=true;setBusy(true);setError('');try{await fn();await load();notify('Saqlandi');}catch(e){if(alive.current){setError(e.message);notify(e.message);}}finally{operation.current=false;if(alive.current)setBusy(false);}};
 const employees=data?.employees||[],records=data?.records||[],date=data?.date||today();
 const name=id=>employees.find(e=>e.id===id)?.name||'—';
 const kind=TYPES[view]?.[0];
 const searched=e=>matches([e.name,e.code,e.department],query);
 const filtered=records.filter(r=>r.kind===kind&&(status==='all'||r.status===status)&&matches([r.title,r.detail.number,name(r.employeeId)],query));
 function recordForm(existing,preset=''){
  const k=existing?.kind||kind,detail=existing?.detail||{},orderType=detail.orderType||preset||'other',penalty=k==='order'&&orderType==='penalty',special=k==='order'&&['reward','penalty'].includes(orderType);
  const fields=[{name:'employeeId',label:'Xodim',type:'select',req:true,raw:true,options:[['','—'],...employees.map(e=>[e.id,`${e.code} · ${e.name}`])]},
   {name:'title',label:'Nomi',req:true,wide:true},{name:'number',label:['leave','order'].includes(k)?'Buyruq raqami':'Hujjat raqami'},
   ...(['leave','order'].includes(k)?[{name:'orderDate',label:'Buyruq sanasi',type:'date'}]:[]),
   {name:'startDate',label:penalty?'Jazo qo‘llangan sana':'Boshlanish sanasi',type:'date',req:true},{name:'endDate',label:penalty?'Jazo amal qiladi (odatda 1 yil)':'Tugash sanasi',type:'date',req:true}];
  if(k==='leave')fields.push({name:'leaveType',label:'Ta’til turi',type:'select',options:LEAVE});
  if(k==='shift')fields.push({name:'shift',label:'Smena',type:'select',options:[['day','Kunduzgi'],['night','Tungi']]},{name:'hours',label:'Ish soati',type:'number',min:.25,step:.25,req:true},{name:'workDays',label:'Hafta kunlari (1=Du, 0=Ya)',req:true});
  if(k==='order'&&orderType==='reward')fields.push({name:'rewardType',label:'Rag‘batlantirish turi',type:'select',options:REWARDS},{name:'basis',label:'Nima uchun rag‘batlantiriladi',req:true,wide:true,hint:'Masalan: oylik rejani muddatidan oldin bajargani. Pul mukofoti summasini buxgalter oylikdagi «Qo‘shimcha haq»ga kiritadi.'});
  else if(penalty)fields.push({name:'penaltyType',label:'Jazo turi',type:'select',options:PENALTIES},{name:'violationDate',label:'Qoidabuzarlik sanasi',type:'date',req:true},{name:'explanation',label:'Xodimning yozma tushuntirishi',type:'select',req:true,options:[['','Tanlang'],...EXPLAIN]},{name:'basis',label:'Qoidabuzarlik mazmuni',req:true,wide:true,hint:'Jazo berishdan oldin xodimdan yozma tushuntirish olinadi. Muddatlarni Mehnat kodeksi bo‘yicha tekshiring. Jarima summasini buxgalter oylikdagi «Boshqa ushlanmalar»ga kiritadi.'});
  else if(k==='order')fields.push({name:'orderType',label:'Buyruq turi',type:'select',options:ORDERS.filter(([x])=>!['reward','penalty'].includes(x))});
  if(k==='document')fields.push({name:'docType',label:'Hujjat turi',type:'select',options:DOCS});
  if(k==='equipment')fields.push({name:'quantity',label:'Miqdor',type:'number',min:.01,step:.01,req:true});
  fields.push({name:'note',label:'Izoh',wide:true});
  const factoryId=user.factory?.id;
  openForm({key:crypto.randomUUID(),title:existing?'Yozuvni tahrirlash':orderType==='reward'&&k==='order'?'Rag‘batlantirish buyrug‘i':penalty?'Intizomiy jazo buyrug‘i':'Yangi yozuv',values:{employeeId:'',title:k==='order'&&orderType==='reward'?'Rag‘batlantirish':penalty?'Intizomiy jazo':k==='leave'?'Yillik ta’til':'',startDate:date,endDate:penalty?yearLater(date):date,orderDate:date,rewardType:'gratitude',penaltyType:'reprimand',explanation:'',leaveType:'annual',shift:'day',hours:8,workDays:'1,2,3,4,5',docType:'contract',orderType:'other',quantity:1,...existing,...detail,workDays:(detail.workDays||[1,2,3,4,5]).join(',')},fields,onSubmit:async v=>{
   if(factoryId!==user.factory?.id)throw new Error('Zavod o‘zgargan. Qayta yuklang');
   const {employeeId,title,startDate,endDate,...d}=v;
   if(k==='shift')d.workDays=v.workDays.split(',').map(x=>Number(x.trim()));
   if(special)d.orderType=orderType;
   await api('/hr/workforce/records'+(existing?'/'+existing.id:''),{method:existing?'PUT':'POST',body:{employeeId,kind:k,title,startDate,endDate,detail:d,...(existing?{version:existing.version}:{})}});
   await load();notify('Saqlandi');
  }});
 }
 function decision(r,next){
  if(next==='cancelled')return openForm({title:'Bekor qilish sababi',fields:[{name:'reason',label:'Bekor qilish sababi',req:true,wide:true}],onSubmit:async v=>{await api(`/hr/workforce/records/${r.id}/decision`,{method:'POST',body:{version:r.version,status:next,reason:v.reason}});await load();notify('Saqlandi');}});
  if(window.confirm(t(next==='approved'?'Yozuvni tasdiqlaysizmi?':'Yozuv yakunlandimi?')))run(()=>api(`/hr/workforce/records/${r.id}/decision`,{method:'POST',body:{version:r.version,status:next}}));
 }
 function allowance(e){
  const a=data.allowances.find(a=>a.employeeId===e.id&&a.year===year);
  openForm({title:'Ta’til limitini belgilash',values:{days:a?.days??0,usedBefore:a?.usedBefore??0},fields:[{name:'days',label:'Yillik ta’til limiti (kalendar kun)',type:'number',min:0,step:1,req:true},{name:'usedBefore',label:'Dasturga kiritishdan oldin ishlatilgan',type:'number',min:0,step:1,req:true}],onSubmit:async v=>{
   await api(`/hr/workforce/allowances/${e.id}/${year}`,{method:'PUT',body:{...v,version:a?.version||0}});await load();notify('Saqlandi');
  }});
 }
 function details(r){
  const d=r.detail;
  if(r.kind==='leave')return t(LEAVE.find(x=>x[0]===d.leaveType)?.[1]||'');
  if(r.kind==='shift')return `${t(d.shift==='night'?'Tungi':'Kunduzgi')} · ${d.hours} ${t('soat')}`;
  if(r.kind==='order'&&d.orderType==='reward')return `${t('Rag‘batlantirish')} · ${t(REWARDS.find(x=>x[0]===d.rewardType)?.[1]||'')}`;
  if(r.kind==='order'&&d.orderType==='penalty')return `${t('Intizomiy jazo')} · ${t(PENALTIES.find(x=>x[0]===d.penaltyType)?.[1]||'')} · ${t('qoidabuzarlik')} ${fmtDate(d.violationDate)}`;
  if(r.kind==='order')return t(ORDERS.find(x=>x[0]===d.orderType)?.[1]||'');
  if(r.kind==='document')return t(DOCS.find(x=>x[0]===d.docType)?.[1]||'');
  return `${d.quantity} ${t('dona')}`;
 }
 const quiet=async fn=>{if(operation.current)return;operation.current=true;setBusy(true);try{await fn();}catch(e){if(alive.current)notify(e.message);}finally{operation.current=false;if(alive.current)setBusy(false);}};
 const orderPdf=r=>quiet(async()=>{const employee=employees.find(e=>e.id===r.employeeId);if(!employee)throw new Error('Xodim topilmadi');await downloadRecordOrderPdf({record:r,employee,employer:await api('/factory-profile')});});
 const yStart=`${year}-01-01`,yEnd=`${year}-12-31`;
 const planFrom=year>=+date.slice(0,4)?date:yStart;
 const plans=view==='leaves'?employees.filter(e=>e.hireDate&&e.hireDate<=yEnd&&(!e.endDate||e.endDate>=planFrom)).map(e=>({employee:e,allowance:(data?.allowances||[]).find(a=>a.employeeId===e.id&&a.year===year),leaves:records.filter(r=>r.employeeId===e.id&&r.kind==='leave'&&r.status!=='cancelled'&&r.startDate<=yEnd&&r.endDate>=yStart).sort((a,b)=>a.startDate.localeCompare(b.startDate))})):[];
 const noPlan=plans.filter(p=>!p.leaves.length),noLimit=plans.filter(p=>!p.allowance);
 const byMonth=Array.from({length:12},(_,m)=>{const ms=`${year}-${pad(m+1)}-01`,me=`${year}-${pad(m+1)}-${pad(new Date(Date.UTC(year,m+1,0)).getUTCDate())}`;return plans.filter(p=>p.leaves.some(r=>r.startDate<=me&&r.endDate>=ms)).length;}),peak=Math.max(1,...byMonth);
 const schedulePdf=()=>quiet(async()=>downloadLeaveSchedulePdf({year,rows:plans,employer:await api('/factory-profile')}));
 return <section className="sheet hr-workforce" aria-busy={loading}>
  <div className="hr-heading"><div><span className="hr-eyebrow">{t('Kadrlar bo‘limi')}</span><h2>{t(view==='overview'?'Kadrlar nazorati':TYPES[view]?.[1]||'Kadrlar nazorati')}</h2></div><button className="btn" disabled={busy||loading} onClick={load}>{t('Yangilash')}</button></div>
  {view!=='overview'&&<HrDeadlineNotice onOpen={()=>onViewChange('reminders')}/>}
  <HrNavigation view={view} onChange={onViewChange} tabs={tabs} />
  {error&&<p className="err" role="alert">{t(error)}</p>}
  {loading?<p className="loading">{t("Ma'lumotlar yuklanmoqda…")}</p>:data&&<>
   {view==='overview'?<HrDashboard data={data} onViewChange={onViewChange}/>:<>
    <div className="hr-toolbar"><input type="search" aria-label={t('Qidirish')} placeholder={t('Qidirish')} value={query} onChange={e=>setQuery(e.target.value)}/><label>{t('Holat')}<select value={status} onChange={e=>setStatus(e.target.value)}><option value="all">{t('Barchasi')}</option>{Object.entries(STATES).map(([k,l])=><option key={k} value={k}>{t(l)}</option>)}</select></label>{canWrite&&(view==='orders'?<><button className="btn primary" disabled={busy||!employees.length} onClick={()=>recordForm(null,'reward')}>{t('Rag‘batlantirish buyrug‘i')}</button><button className="btn" disabled={busy||!employees.length} onClick={()=>recordForm(null,'penalty')}>{t('Intizomiy jazo buyrug‘i')}</button><button className="btn" disabled={busy||!employees.length} onClick={()=>recordForm()}>{t('Boshqa buyruq')}</button></>
     :<button className="btn primary" disabled={busy||!employees.length} onClick={()=>recordForm()}>{t(view==='leaves'?'Ta’til qo‘shish':'Yangi yozuv')}</button>)}</div>
    {view==='leaves'&&<>
     <p className="hint">{t('Ta’til limiti har yil uchun qo‘lda belgilanadi. Qoldiqdan tasdiqlangan ta’tillar, kelajakdagilari ham, ayriladi. Hisob kalendar kunlarda yuritiladi.')}</p>
     <label>{t('Yil')} <input type="number" min="1900" max="2200" value={year} onChange={e=>setYear(+e.target.value)}/></label>
     <article className="hrx-card" style={{margin:'12px 0'}}>
      <div style={{display:'flex',justifyContent:'space-between',gap:10,flexWrap:'wrap',alignItems:'center'}}><div><h3 style={{margin:0}}>{t('Yillik ta’tillar jadvali')} · {year}</h3><p className="hint" style={{margin:'4px 0 0'}}>{t('Har bir xodimning yillik ta’tili qaysi oyga rejalashtirilgani. Qoralama ta’til — reja, tasdiqlangani — buyruq chiqarilgan.')}</p></div><button className="btn primary" disabled={busy||!plans.length} onClick={schedulePdf}>{t('Ta’tillar jadvali')} · PDF</button></div>
      <div className="hrx-kpis" style={{gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',margin:'12px 0'}}>
       <div className="hrx-card hrx-kpi"><span>{t('Xodimlar')}</span><strong>{plans.length}</strong></div>
       <div className="hrx-card hrx-kpi ok"><span>{t('Ta’til rejalashtirilgan')}</span><strong>{plans.length-noPlan.length}</strong></div>
       <div className={`hrx-card hrx-kpi ${noPlan.length?'warn':''}`}><span>{t('Rejasiz xodimlar')}</span><strong>{noPlan.length}</strong><small>{noPlan.slice(0,3).map(p=>show(p.employee.name)).join(', ')}{noPlan.length>3?' …':''}</small></div>
       <div className={`hrx-card hrx-kpi ${noLimit.length?'warn':''}`}><span>{t('Limit belgilanmagan')}</span><strong>{noLimit.length}</strong></div>
      </div>
      <div className="hrx-mbars" role="img" aria-label={t('Oylar bo‘yicha ta’tildagi xodimlar')}>{byMonth.map((n,m)=><div key={m} title={`${n} ${t('kishi')}`}><em>{n||''}</em><b style={{height:`${Math.round(n/peak*72)}%`}}/><span>{t(['Yan','Fev','Mar','Apr','May','Iyn','Iyl','Avg','Sen','Okt','Noy','Dek'][m])}</span></div>)}</div>
     </article>
     <div className="tbl-wrap"><table><thead><tr>{['Xodim','Yillik limit','Avval ishlatilgan','Tasdiqlangan kunlar','Qoldiq','Amallar'].map(x=><th key={x}>{t(x)}</th>)}</tr></thead><tbody>{employees.filter(searched).map(e=>{
      const a=data.allowances.find(a=>a.employeeId===e.id&&a.year===year),used=records.filter(r=>r.employeeId===e.id).reduce((s,r)=>s+usedDays(r,year),0);
      return <tr key={e.id}><td>{show(e.name)}</td><td>{a?.days??t('Belgilanmagan')}</td><td>{a?.usedBefore??'—'}</td><td>{used}</td><td>{a?a.days-a.usedBefore-used:'—'}</td><td>{decide&&<button className="btn sm" disabled={busy} onClick={()=>allowance(e)}>{t('Limitni belgilash')}</button>}</td></tr>;
     })}</tbody></table></div>
    </>}
    {view==='shifts'&&<p className="hint">{t('Smena rejasi haqiqiy davomatdan alohida yuritiladi. Tasdiqlangach bo‘sh tabelga namuna sifatida qo‘llanadi; haqiqiy soatlar tekshirib saqlanadi.')}</p>}
    {view==='orders'&&<p className="hint">{t('Buyruqlar reyestri. Rag‘batlantirish va intizomiy jazo buyrug‘ini shu yerda yarating va PDF qilib chop eting. Lavozim, ish sanalari va maoshdagi o‘zgarishlar tegishli xodim kartochkasida alohida qayd etiladi.')}</p>}
    <div className="tbl-wrap"><table className="hr-records-table"><thead><tr>{['Xodim','Nomi','Davr','Holat','Amallar'].map(x=><th key={x}>{t(x)}</th>)}</tr></thead><tbody>{filtered.map(r=><tr key={r.id}><td>{name(r.employeeId)}</td><td><strong>{r.title}</strong><div className="hint">{details(r)}{r.detail.number&&` · ${r.detail.number}`}</div>{r.detail.note&&<div className="hint">{show(r.detail.note)}</div>}</td><td>{r.startDate}<br/>{r.endDate}</td><td><span className="pill">{t(STATES[r.status])}</span>{r.detail.appliedAt&&<p className="hint">{t('Tabelga qo‘llangan')}</p>}{r.reason&&<p className="hint">{r.reason}</p>}</td><td><div className="acts">
     {hasRecordOrder(r)&&<button className="btn sm" disabled={busy} onClick={()=>orderPdf(r)}>{t('Buyruq')} · PDF</button>}
     {canWrite&&r.status==='draft'&&<button className="btn sm" disabled={busy} onClick={()=>recordForm(r)}>{t('Tahrirlash')}</button>}
     {decide&&r.status==='draft'&&<button className="btn sm primary" disabled={busy} onClick={()=>decision(r,'approved')}>{t('Tasdiqlash')}</button>}
     {decide&&r.status==='approved'&&['leave','shift'].includes(r.kind)&&!r.detail.appliedAt&&<button className="btn sm" disabled={busy} onClick={()=>{if(window.confirm(t('Tasdiqlangan davrni tabelga qo‘llaysizmi?')))run(()=>api(`/hr/workforce/records/${r.id}/apply`,{method:'POST',body:{version:r.version}}));}}>{t('Tabelga qo‘llash')}</button>}
     {decide&&r.status==='approved'&&['order','document','equipment'].includes(r.kind)&&<button className="btn sm" disabled={busy} onClick={()=>decision(r,'completed')}>{t('Yakunlash')}</button>}
     {decide&&['draft','approved'].includes(r.status)&&<button className="btn sm" disabled={busy} onClick={()=>decision(r,'cancelled')}>{t('Bekor qilish')}</button>}
    </div></td></tr>)}</tbody></table></div>
    {!filtered.length&&<p className="empty">{t('Yozuvlar hali kiritilmagan')}</p>}
   </>}
  </>}
 </section>;
}
