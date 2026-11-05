"use client";
import HrNavigation from './HrNavigation';
import { useCallback,useEffect,useRef,useState } from 'react';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useUser } from '@/lib/role';
import { today } from '@/lib/calc';

const TYPES={leaves:['leave','Ta’tillar'],shifts:['shift','Smena rejasi'],orders:['order','Buyruqlar'],documents:['document','Hujjat muddatlari'],equipment:['equipment','Himoya vositalari']};
const STATES={draft:'Qoralama',approved:'Tasdiqlangan',cancelled:'Bekor qilingan',completed:'Yakunlangan'};
const LEAVE=[['annual','Yillik ta’til'],['unpaid','Ish haqi saqlanmaydigan ta’til']];
const DOCS=[['contract','Mehnat shartnomasi'],['medical','Tibbiy ko‘rik'],['safety','Xavfsizlik yo‘riqnomasi'],['qualification','Malaka guvohnomasi'],['other','Boshqa']];
const ORDERS=[['hire','Ishga qabul qilish'],['transfer','Lavozimga o‘tkazish'],['salary','Maosh o‘zgarishi'],['termination','Mehnat shartnomasini bekor qilish'],['other','Boshqa']];
function usedDays(r,year){
 if(r.kind!=='leave'||r.status!=='approved'||r.detail.leaveType!=='annual')return 0;
 const a=r.startDate>`${year}-01-01`?r.startDate:`${year}-01-01`,b=r.endDate<`${year}-12-31`?r.endDate:`${year}-12-31`;
 return a>b?0:Math.round((Date.parse(b)-Date.parse(a))/86400000)+1;
}
export default function HrWorkforce({view,onViewChange,notify,openForm}) {
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
 const searched=e=>`${e.name} ${e.code} ${e.department}`.toLowerCase().includes(query.toLowerCase());
 const filtered=records.filter(r=>r.kind===kind&&(status==='all'||r.status===status)&&`${r.title} ${r.detail.number||''} ${name(r.employeeId)}`.toLowerCase().includes(query.toLowerCase()));
 const due=records.filter(r=>r.status==='approved'&&['document','equipment'].includes(r.kind)&&r.endDate<=new Date(Date.parse(date)+30*86400000).toISOString().slice(0,10)).sort((a,b)=>a.endDate.localeCompare(b.endDate));
 function recordForm(existing){
  const k=existing?.kind||kind,detail=existing?.detail||{};
  const fields=[{name:'employeeId',label:'Xodim',type:'select',req:true,raw:true,options:[['','—'],...employees.map(e=>[e.id,`${e.code} · ${e.name}`])]},
   {name:'title',label:'Nomi',req:true,wide:true},{name:'number',label:'Hujjat raqami'},
   {name:'startDate',label:'Boshlanish sanasi',type:'date',req:true},{name:'endDate',label:'Tugash sanasi',type:'date',req:true}];
  if(k==='leave')fields.push({name:'leaveType',label:'Ta’til turi',type:'select',options:LEAVE});
  if(k==='shift')fields.push({name:'shift',label:'Smena',type:'select',options:[['day','Kunduzgi'],['night','Tungi']]},{name:'hours',label:'Ish soati',type:'number',min:.25,step:.25,req:true},{name:'workDays',label:'Hafta kunlari (1=Du, 0=Ya)',req:true});
  if(k==='order')fields.push({name:'orderType',label:'Buyruq turi',type:'select',options:ORDERS});
  if(k==='document')fields.push({name:'docType',label:'Hujjat turi',type:'select',options:DOCS});
  if(k==='equipment')fields.push({name:'quantity',label:'Miqdor',type:'number',min:.01,step:.01,req:true});
  fields.push({name:'note',label:'Izoh',wide:true});
  const factoryId=user.factory?.id;
  openForm({key:crypto.randomUUID(),title:existing?'Yozuvni tahrirlash':'Yangi yozuv',values:{employeeId:'',title:'',startDate:date,endDate:date,leaveType:'annual',shift:'day',hours:8,workDays:'1,2,3,4,5',docType:'contract',orderType:'other',quantity:1,...existing,...detail,workDays:(detail.workDays||[1,2,3,4,5]).join(',')},fields,onSubmit:async v=>{
   if(factoryId!==user.factory?.id)throw new Error('Zavod o‘zgargan. Qayta yuklang');
   const {employeeId,title,startDate,endDate,...d}=v;
   if(k==='shift')d.workDays=v.workDays.split(',').map(x=>Number(x.trim()));
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
  if(r.kind==='order')return t(ORDERS.find(x=>x[0]===d.orderType)?.[1]||'');
  if(r.kind==='document')return t(DOCS.find(x=>x[0]===d.docType)?.[1]||'');
  return `${d.quantity} ${t('dona')}`;
 }
 return <section className="sheet hr-workforce" aria-busy={loading}>
  <div className="hr-heading"><div><span className="hr-eyebrow">{t('Kadrlar bo‘limi')}</span><h2>{t(view==='overview'?'Kadrlar nazorati':TYPES[view]?.[1]||'Kadrlar nazorati')}</h2></div><button className="btn" disabled={busy||loading} onClick={load}>{t('Yangilash')}</button></div>
  <HrNavigation view={view} onChange={onViewChange} tabs={[["overview","Kadrlar nazorati"],["employees","Xodimlar"],["time","Tabel"],...(["admin","rahbar","kadrlar"].includes(user.role)?[["archive","Hujjatlar"]]:[]),...Object.entries(TYPES).map(([key,[,label]])=>[key,label])]} />
  {error&&<p className="err" role="alert">{t(error)}</p>}
  {loading?<p className="loading">{t("Ma'lumotlar yuklanmoqda…")}</p>:data&&<>
   {view==='overview'?<>
    <p className="hint">{date} · {t('Rahbar uchun kunlik nazorat')}</p>
    <div className="hr-summary">{[['active','Faol xodimlar'],['atWork','Bugun ishda'],['marked','Davomat belgilangan'],['onLeave','Hozir ta’tilda'],['pending','Tasdiq kutilmoqda']].map(([key,label])=><div className="hr-card" key={key}><span>{t(label)}</span><strong>{data.summary[key]}</strong></div>)}</div>
    <div className="hr-workforce-links">{Object.entries(TYPES).map(([key,[,title]])=><button className="btn" key={key} onClick={()=>onViewChange(key)}>{t(title)}</button>)}</div>
    <h3>{t('Muddati yaqin va o‘tgan yozuvlar')}</h3>
    {!due.length?<p className="empty">{t('Yaqin 30 kunda tugaydigan yozuv yo‘q')}</p>:<div className="tbl-wrap"><table><thead><tr>{['Xodim','Nomi','Tugash sanasi','Holat'].map(x=><th key={x}>{t(x)}</th>)}</tr></thead><tbody>{due.map(r=><tr key={r.id}><td>{name(r.employeeId)}</td><td>{r.title}</td><td>{r.endDate}</td><td><span className={r.endDate<date?'err':'hint'}>{t(r.endDate<date?'Muddati o‘tgan':'30 kun ichida')}</span></td></tr>)}</tbody></table></div>}
    <h3>{t('Tasdiqlash navbati')}</h3>
    <div className="hr-pending-list">{records.filter(r=>r.status==='draft').slice(0,20).map(r=><button className="btn" key={r.id} onClick={()=>onViewChange(Object.keys(TYPES).find(k=>TYPES[k][0]===r.kind))}>{name(r.employeeId)} · {r.title}</button>)}</div>
    {!data.summary.pending&&<p className="empty">{t('Tasdiq kutayotgan yozuv yo‘q')}</p>}
    <h3>{t('Oxirgi amallar')}</h3>
    <div className="tbl-wrap"><table><thead><tr>{['Sana','Mas’ul','Xodim','Amal'].map(x=><th key={x}>{t(x)}</th>)}</tr></thead><tbody>{(data.events||[]).slice(0,15).map(e=><tr key={e.id}><td>{new Date(e.createdAt).toLocaleString('ru-RU',{timeZone:'Asia/Tashkent'})}</td><td>{e.actor.name}</td><td>{name(e.entityId)}</td><td>{t({'workforce.create':'Kadrlar yozuvi yaratildi','workforce.update':'Kadrlar yozuvi o‘zgardi','workforce.decision':'Kadrlar yozuvi holati o‘zgardi','workforce.apply':'Reja tabelga qo‘llandi','workforce.allowance':'Ta’til limiti o‘zgardi'}[e.action]||e.action)}</td></tr>)}</tbody></table></div>
   </>:<>
    <div className="hr-toolbar"><input type="search" aria-label={t('Qidirish')} placeholder={t('Qidirish')} value={query} onChange={e=>setQuery(e.target.value)}/><label>{t('Holat')}<select value={status} onChange={e=>setStatus(e.target.value)}><option value="all">{t('Barchasi')}</option>{Object.entries(STATES).map(([k,l])=><option key={k} value={k}>{t(l)}</option>)}</select></label><button className="btn primary" disabled={busy||!employees.length} onClick={()=>recordForm()}>{t('Yangi yozuv')}</button></div>
    {view==='leaves'&&<>
     <p className="hint">{t('Ta’til limiti har yil uchun qo‘lda belgilanadi. Qoldiqdan tasdiqlangan ta’tillar, kelajakdagilari ham, ayriladi. Hisob kalendar kunlarda yuritiladi.')}</p>
     <label>{t('Yil')} <input type="number" min="1900" max="2200" value={year} onChange={e=>setYear(+e.target.value)}/></label>
     <div className="tbl-wrap"><table><thead><tr>{['Xodim','Yillik limit','Avval ishlatilgan','Tasdiqlangan kunlar','Qoldiq','Amallar'].map(x=><th key={x}>{t(x)}</th>)}</tr></thead><tbody>{employees.filter(searched).map(e=>{
      const a=data.allowances.find(a=>a.employeeId===e.id&&a.year===year),used=records.filter(r=>r.employeeId===e.id).reduce((s,r)=>s+usedDays(r,year),0);
      return <tr key={e.id}><td>{e.name}</td><td>{a?.days??t('Belgilanmagan')}</td><td>{a?.usedBefore??'—'}</td><td>{used}</td><td>{a?a.days-a.usedBefore-used:'—'}</td><td>{decide&&<button className="btn sm" disabled={busy} onClick={()=>allowance(e)}>{t('Limitni belgilash')}</button>}</td></tr>;
     })}</tbody></table></div>
    </>}
    {view==='shifts'&&<p className="hint">{t('Smena rejasi haqiqiy davomatdan alohida yuritiladi. Tasdiqlangach bo‘sh tabelga namuna sifatida qo‘llanadi; haqiqiy soatlar tekshirib saqlanadi.')}</p>}
    {view==='orders'&&<p className="hint">{t('Buyruqlar reyestri. Lavozim, ish sanalari va maoshdagi o‘zgarishlar tegishli xodim kartochkasida alohida qayd etiladi.')}</p>}
    <div className="tbl-wrap"><table className="hr-records-table"><thead><tr>{['Xodim','Nomi','Davr','Holat','Amallar'].map(x=><th key={x}>{t(x)}</th>)}</tr></thead><tbody>{filtered.map(r=><tr key={r.id}><td>{name(r.employeeId)}</td><td><strong>{r.title}</strong><div className="hint">{details(r)}{r.detail.number&&` · ${r.detail.number}`}</div>{r.detail.note&&<div className="hint">{r.detail.note}</div>}</td><td>{r.startDate}<br/>{r.endDate}</td><td><span className="pill">{t(STATES[r.status])}</span>{r.detail.appliedAt&&<p className="hint">{t('Tabelga qo‘llangan')}</p>}{r.reason&&<p className="hint">{r.reason}</p>}</td><td><div className="acts">
     {r.status==='draft'&&<button className="btn sm" disabled={busy} onClick={()=>recordForm(r)}>{t('Tahrirlash')}</button>}
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
