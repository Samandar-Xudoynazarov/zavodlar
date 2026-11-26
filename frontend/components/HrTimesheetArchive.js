"use client";
import { useCallback,useEffect,useRef,useState } from 'react';
import { createPortal } from 'react-dom';
import { api,getToken,getFactory } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useUser } from '@/lib/role';
import { today } from '@/lib/calc';
import { deliverBlob } from '@/lib/share';
import { pct } from '@/lib/hr-ui';
import Icon from './Icon';
const MONTHS=['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'];
const FIRST_YEAR=2025;
const MONTH_STATUS={draft:'Qoralama',approved:'Tasdiqlangan',closed:'Yopilgan'};
const size=n=>n>=1048576?`${(n/1048576).toFixed(1)} MB`:`${Math.max(1,Math.round(n/1024))} KB`;
const isPdf=f=>!!f&&(f.type==='application/pdf'||(!f.type&&/\.pdf$/i.test(f.name)));
// Tasdiqlangan va imzolangan oylik tabellar (PDF) arxivi: yil kartochkalari -> 12 oy kartochkasi, har oyga bir nechta fayl
export default function HrTimesheetArchive({notify,onOpenMonth}){
 const t=useT(),{user}=useUser(),current=today().slice(0,7),thisYear=+current.slice(0,4);
 const [year,setYear]=useState(String(thisYear)),[files,setFiles]=useState(null),[appMonths,setAppMonths]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [filter,setFilter]=useState('all'),[upload,setUpload]=useState(null),[preview,setPreview]=useState(null),[over,setOver]=useState('');
 const operation=useRef(false),generation=useRef(0),previewUrl=useRef('');
 const editor=['admin','kadrlar'].includes(user.role);
 const years=[];for(let y=Math.max(thisYear,FIRST_YEAR);y>=FIRST_YEAR;y--)years.push(String(y));
 const load=useCallback(async()=>{const id=++generation.current;try{
  const [lists,ms]=await Promise.all([Promise.all(years.map(y=>api('/hr/personnel-documents/timesheets?year='+y))),api('/hr/months').catch(()=>[])]);
  if(id!==generation.current)return;setFiles(lists.flat());setAppMonths(ms);setError('');
 }catch(e){if(id===generation.current)setError(e.message);}},[years.join(),user.factory?.id]);
 useEffect(()=>{setFiles(null);load();return()=>generation.current++;},[load]);
 const closePreview=useCallback(()=>{if(previewUrl.current)URL.revokeObjectURL(previewUrl.current);previewUrl.current='';setPreview(null);},[]);
 useEffect(()=>closePreview,[closePreview]);
 useEffect(()=>{if(!preview&&!upload)return;const key=e=>{if(e.key==='Escape'){closePreview();setUpload(null);}};document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);},[preview,upload,closePreview]);
 async function run(fn){if(operation.current)return;operation.current=true;setBusy(true);try{await fn();}catch(e){notify(e.message);}finally{operation.current=false;setBusy(false);}}
 const fetchPdf=async f=>new Blob([await (await api('/hr/personnel-documents/timesheets/'+f.id,{raw:true})).blob()],{type:'application/pdf'});
 const download=f=>run(async()=>{await deliverBlob(await fetchPdf(f),f.name,'application/pdf');});
 const open=f=>run(async()=>{const blob=await fetchPdf(f);closePreview();previewUrl.current=URL.createObjectURL(blob);setPreview({file:f,url:previewUrl.current,blob});});
 const remove=f=>run(async()=>{if(!window.confirm(`${t('Faylni o‘chirasizmi?')}\n${f.name}`))return;await api('/hr/personnel-documents/timesheets/'+f.id,{method:'DELETE'});closePreview();await load();notify('O‘chirildi');});
 function startUpload(month,file=null){if(!editor||month>current)return;if(file&&!isPdf(file)){notify('Faqat PDF fayl tanlang (3 MB gacha)');return;}setUpload({month,file,title:''});}
 async function save(event){event.preventDefault();await run(async()=>{
  const {month,file,title}=upload;
  if(!isPdf(file)||file.size>3145728)throw new Error('Faqat PDF fayl tanlang (3 MB gacha)');
  const params=new URLSearchParams({month,name:file.name,title});
  const response=await fetch((process.env.NEXT_PUBLIC_API_URL||'http://localhost:4000').replace(/\/+$/,'')+'/api/hr/personnel-documents/timesheets?'+params,{method:'POST',headers:{'Content-Type':'application/octet-stream',Authorization:`Bearer ${getToken()}`,...(getFactory()?{'X-Factory':getFactory()}:{})},body:file});
  if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.error||'Fayl yuklanmadi');}
  setUpload(null);await load();notify('Saqlandi');
 });}
 const monthLabel=m=>`${t(MONTHS[+m.slice(5)-1])} ${m.slice(0,4)}`;
 const stats=y=>{const due=MONTHS.map((_,i)=>`${y}-${String(i+1).padStart(2,'0')}`).filter(m=>m<=current);const done=due.filter(m=>files?.some(f=>f.month===m)).length;return {due:due.length,done};};
 const monthList=MONTHS.map((label,i)=>{const month=`${year}-${String(i+1).padStart(2,'0')}`,list=(files||[]).filter(f=>f.month===month),inApp=appMonths.find(m=>m.month===month);return {month,label,list,inApp,future:month>current};})
  .filter(m=>filter==='all'||(filter==='done'?m.list.length>0:!m.future&&!m.list.length));
 const drop=month=>({
  onDragOver:e=>{if(!editor||month>current)return;e.preventDefault();setOver(month);},
  onDragLeave:()=>setOver(o=>o===month?'':o),
  onDrop:e=>{if(!editor||month>current)return;e.preventDefault();setOver('');startUpload(month,e.dataTransfer.files?.[0]||null);},
 });
 return <section className="hr-timesheet-archive" aria-busy={busy}>
  <header className="hr-heading"><div><h3>{t('Tasdiqlangan tabellar arxivi')}</h3><p className="hint">{t('Imzolangan oylik tabelning PDF nusxasini oy bo‘yicha saqlang. Kartochkani bosing — PDF shu yerda ochiladi.')}</p></div></header>
  {error&&<p className="hint">{t(error)} <button className="btn" onClick={load}>{t('Qayta yuklash')}</button></p>}
  {!files&&!error&&<p>{t('Yuklanmoqda…')}</p>}
  {files&&<>
   <div className="hrx-years" role="group" aria-label={t('Yil')}>{years.map(y=>{const s=stats(y),p=pct(s.done,s.due);return <button key={y} className="hrx-card hrx-year" aria-pressed={year===y} onClick={()=>setYear(y)}>
    <b>{y}</b><small>{t('{d} / {n} oy yuklangan',{d:s.done,n:s.due})}</small><div className={`hrx-bar ${p>=100?'ok':p>=50?'warn':'bad'}`} aria-hidden="true"><b style={{width:p+'%'}}/></div></button>;})}</div>
   <div className="hrx-chips" role="group" aria-label={t('Filtr')} style={{marginBottom:12}}>{[['all','Hammasi'],['done','Yuklangan'],['miss','Yetishmaydi']].map(([k,l])=><button key={k} className="hrx-chip" aria-pressed={filter===k} onClick={()=>setFilter(k)}>{t(l)}</button>)}</div>
   <div className="hrx-months">{monthList.map(({month,label,list,inApp,future})=><article key={month} className={`hrx-card hrx-month ${future?'fut':list.length?'app':'miss'}`} {...drop(month)}>
    <div className="mh"><b>{t(label)}</b>{future?<span className="hrx-pill">{t('Hali kelmagan')}</span>:list.length?<span className="hrx-pill ok">{t('PDF bor')}{list.length>1?` · ${list.length}`:''}</span>:<span className="hrx-pill bad">{t('Yuklanmagan')}</span>}</div>
    {list.map(f=><button key={f.id} className="hrx-file" disabled={busy} onClick={()=>open(f)} title={t('Ko‘rish')}><i className="hrx-pdf" aria-hidden="true">PDF</i><span>{f.title||f.name}<small>{size(f.sizeBytes)} · {String(f.uploadedAt).slice(0,10)}{f.uploadedBy?.name?` · ${f.uploadedBy.name}`:''}</small></span></button>)}
    {inApp&&onOpenMonth&&<button className="btn sm" onClick={()=>onOpenMonth(month)}><Icon name="moves"/>{t('Dasturdagi tabel')} · {t(MONTH_STATUS[inApp.status])}</button>}
    {editor&&!future&&<button type="button" className={`hrx-drop${over===month?' over':''}`} disabled={busy} onClick={()=>startUpload(month)}><Icon name="upload" size={15}/> {t('PDF yuklash yoki shu yerga tashlang')}</button>}
    {!editor&&!future&&!list.length&&!inApp&&<p className="hint" style={{margin:0}}>{t('Kadrlar bo‘limi hali yuklamagan')}</p>}
   </article>)}</div>
   {!monthList.length&&<div className="hrx-empty">{t(filter==='done'?'Bu yil uchun yuklangan tabel yo‘q':'Barcha oylar yuklangan')}</div>}
  </>}
  {preview&&createPortal(<div className="hrx-modal" role="dialog" aria-modal="true" aria-label={preview.file.title||preview.file.name} onClick={e=>{if(e.target===e.currentTarget)closePreview();}}><div className="hrx-card">
   <div className="mh"><div><b>{monthLabel(preview.file.month)}</b> · {preview.file.title||preview.file.name}<div className="hint">{size(preview.file.sizeBytes)} · {String(preview.file.uploadedAt).slice(0,10)}{preview.file.uploadedBy?.name?` · ${preview.file.uploadedBy.name}`:''}</div></div>
    <div className="acts"><button className="btn primary" disabled={busy} onClick={()=>run(()=>deliverBlob(preview.blob,preview.file.name,'application/pdf'))}><Icon name="download"/>{t('Yuklab olish')}</button>{editor&&<button className="btn" disabled={busy} onClick={()=>remove(preview.file)}><Icon name="trash"/>{t('O‘chirish')}</button>}<button className="btn" autoFocus onClick={closePreview}>{t('Yopish')}</button></div></div>
   <iframe src={preview.url} title={preview.file.title||preview.file.name}/>
   <p className="hint" style={{margin:0}}>{t('PDF ko‘rinmasa, «Yuklab olish» tugmasini bosing.')}</p>
  </div></div>,document.body)}
  {upload&&createPortal(<div className="hrx-modal" role="dialog" aria-modal="true" aria-label={t('PDF yuklash')} onClick={e=>{if(e.target===e.currentTarget)setUpload(null);}}><form className="hrx-card hrx-upload" style={{height:'auto',width:'min(520px,100%)'}} onSubmit={save}>
   <b>{t('PDF yuklash')} · {monthLabel(upload.month)}</b>
   <label>{t('PDF fayl')}<input type="file" accept="application/pdf,.pdf" required={!upload.file} onChange={e=>setUpload(u=>({...u,file:e.target.files?.[0]||null}))}/>{upload.file&&<small>{upload.file.name} · {size(upload.file.size)}</small>}</label>
   <label>{t('Izoh (ixtiyoriy)')}<input value={upload.title} maxLength={200} placeholder={t('Masalan: 1-sex tabeli')} onChange={e=>setUpload(u=>({...u,title:e.target.value}))}/></label>
   <p className="hint" style={{margin:0}}>{t('Faqat PDF, 3 MB gacha. Imzo va muhr qo‘yilgan nusxani skanerlab yuklang.')}</p>
   <div className="acts"><button className="btn primary" disabled={busy||!upload.file}><Icon name="upload"/>{t('Saqlash')}</button><button type="button" className="btn" onClick={()=>setUpload(null)}>{t('Bekor qilish')}</button></div>
  </form></div>,document.body)}
 </section>;
}
