"use client";
import { useCallback,useEffect,useRef,useState } from 'react';
import { api,getToken,getFactory } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useUser } from '@/lib/role';
import { today } from '@/lib/calc';
import { deliverBlob } from '@/lib/share';
import Icon from './Icon';
const MONTHS=['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'];
const FIRST_YEAR=2025;
const size=n=>n>=1048576?`${(n/1048576).toFixed(1)} MB`:`${Math.max(1,Math.round(n/1024))} KB`;
// Tasdiqlangan va imzolangan oylik tabellar (PDF) arxivi: yil -> 12 oy, har oyga bir nechta fayl
export default function HrTimesheetArchive({notify}){
 const t=useT(),{user}=useUser(),current=today().slice(0,7),thisYear=+current.slice(0,4);
 const [year,setYear]=useState(String(thisYear)),[files,setFiles]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [uploadMonth,setUploadMonth]=useState(''),[file,setFile]=useState(null),[title,setTitle]=useState(''),operation=useRef(false),generation=useRef(0);
 const editor=['admin','kadrlar'].includes(user.role);
 const years=[];for(let y=Math.max(thisYear,FIRST_YEAR);y>=FIRST_YEAR;y--)years.push(String(y));
 const load=useCallback(async()=>{const id=++generation.current;try{const list=await api('/hr/personnel-documents/timesheets?year='+year);if(id!==generation.current)return;setFiles(list);setError('');}catch(e){if(id===generation.current)setError(e.message);}},[year,user.factory?.id]);
 useEffect(()=>{setFiles(null);load();return()=>generation.current++;},[load]);
 async function run(fn){if(operation.current)return;operation.current=true;setBusy(true);try{await fn();}catch(e){notify(e.message);}finally{operation.current=false;setBusy(false);}}
 const download=f=>run(async()=>{const response=await api('/hr/personnel-documents/timesheets/'+f.id,{raw:true});await deliverBlob(await response.blob(),f.name,'application/pdf');});
 const remove=f=>run(async()=>{if(!window.confirm(`${t('Faylni o‘chirasizmi?')}\n${f.name}`))return;await api('/hr/personnel-documents/timesheets/'+f.id,{method:'DELETE'});await load();notify('O‘chirildi');});
 async function upload(event){event.preventDefault();const form=event.currentTarget;await run(async()=>{
  if(!file||file.type&&file.type!=='application/pdf'||file.size>3145728)throw new Error('Faqat PDF fayl tanlang (3 MB gacha)');
  const params=new URLSearchParams({month:uploadMonth,name:file.name,title});
  const response=await fetch((process.env.NEXT_PUBLIC_API_URL||'http://localhost:4000').replace(/\/+$/,'')+'/api/hr/personnel-documents/timesheets?'+params,{method:'POST',headers:{'Content-Type':'application/octet-stream',Authorization:`Bearer ${getToken()}`,...(getFactory()?{'X-Factory':getFactory()}:{})},body:file});
  if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.error||'Fayl yuklanmadi');}
  form.reset();setFile(null);setTitle('');setUploadMonth('');await load();notify('Saqlandi');
 });}
 return <section className="hr-timesheet-archive" aria-busy={busy}>
  <header className="hr-heading"><div><h3>{t('Tasdiqlangan tabellar arxivi')}</h3><p className="hint">{t('Imzolangan oylik tabelning PDF nusxasini oy bo‘yicha saqlang va keyin yuklab oling.')}</p></div>
   <label>{t('Yil')}<select aria-label={t('Yil')} value={year} onChange={e=>{setYear(e.target.value);setUploadMonth('');}}>{years.map(y=><option key={y} value={y}>{y}</option>)}</select></label></header>
  {error&&<p className="hint">{error} <button className="btn" onClick={load}>{t('Qayta yuklash')}</button></p>}
  {!files&&!error&&<p>{t('Yuklanmoqda…')}</p>}
  {files&&<div className="tbl-wrap"><table className="hr-doc-table"><thead><tr><th>{t('Oy')}</th><th>{t('Fayllar')}</th>{editor&&<th>{t('Amallar')}</th>}</tr></thead><tbody>{MONTHS.map((label,i)=>{
   const month=`${year}-${String(i+1).padStart(2,'0')}`,list=files.filter(f=>f.month===month),future=month>current;
   return <tr key={month}><td><strong>{t(label)}</strong> {year}</td>
    <td>{list.length?<ul className="hr-timesheet-files">{list.map(f=><li key={f.id}><button className="btn" disabled={busy} onClick={()=>download(f)}><Icon name="download"/>{f.title||f.name}</button> <small>{size(f.sizeBytes)} · {String(f.uploadedAt).slice(0,10)} · {f.uploadedBy?.name||''}</small>{editor&&<button className="btn" disabled={busy} aria-label={`${t('O‘chirish')}: ${f.name}`} onClick={()=>remove(f)}><Icon name="trash"/></button>}</li>)}</ul>:<span className="hint">{future?'—':t('Yuklanmagan')}</span>}</td>
    {editor&&<td>{!future&&<button className="btn" disabled={busy} onClick={()=>setUploadMonth(uploadMonth===month?'':month)}><Icon name="upload"/>{t('PDF yuklash')}</button>}</td>}
   </tr>;})}</tbody></table></div>}
  {editor&&uploadMonth&&<form className="hr-upload" onSubmit={upload}><strong>{t(MONTHS[+uploadMonth.slice(5)-1])} {uploadMonth.slice(0,4)}</strong>
   <label>{t('Izoh (ixtiyoriy)')}<input value={title} maxLength={200} placeholder={t('Masalan: 1-sex tabeli')} onChange={e=>setTitle(e.target.value)}/></label>
   <label>{t('PDF fayl')}<input type="file" accept="application/pdf,.pdf" required onChange={e=>setFile(e.target.files?.[0]||null)}/></label>
   <div className="acts"><button className="btn primary" disabled={busy||!file}><Icon name="upload"/>{t('Saqlash')}</button><button type="button" className="btn" onClick={()=>{setUploadMonth('');setFile(null);}}>{t('Bekor qilish')}</button></div></form>}
 </section>;
}
