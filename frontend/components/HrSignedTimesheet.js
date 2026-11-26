"use client";
import { useCallback,useEffect,useRef,useState } from 'react';
import { api,getToken,getFactory } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useUser } from '@/lib/role';
import { deliverBlob } from '@/lib/share';
import Icon from './Icon';
const READERS=['admin','rahbar','buxgalter','kadrlar'],EDITORS=['admin','kadrlar'];
const size=n=>n>=1048576?`${(n/1048576).toFixed(1)} MB`:`${Math.max(1,Math.round(n/1024))} KB`;
const isPdf=f=>!!f&&(f.type==='application/pdf'||(!f.type&&/\.pdf$/i.test(f.name)));
// Tabel bo'limida: oy tugagach tabelni chop etish -> direktor va kadrlar boshlig'i imzo/muhr qo'yadi -> skaner PDF shu oyga biriktiriladi.
// Fayllar «Tasdiqlangan tabellar arxivi» bilan bir joyda saqlanadi (hr_timesheet_files).
export default function HrSignedTimesheet({month,status,onPrint,onOpenArchive,notify}){
 const t=useT(),{user}=useUser(),editor=EDITORS.includes(user?.role);
 const [files,setFiles]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const input=useRef(null),gen=useRef(0);
 const load=useCallback(async()=>{const id=++gen.current;try{const list=await api('/hr/personnel-documents/timesheets?year='+month.slice(0,4));if(id===gen.current){setFiles(list.filter(f=>f.month===month));setError('');}}catch(e){if(id===gen.current)setError(e.message);}},[month]);
 useEffect(()=>{setFiles(null);load();return()=>{gen.current++;};},[load]);
 if(!READERS.includes(user?.role))return null;
 async function run(fn){if(busy)return;setBusy(true);try{await fn();}catch(e){notify?.(e.message);}finally{setBusy(false);}}
 const download=f=>run(async()=>{const res=await api('/hr/personnel-documents/timesheets/'+f.id,{raw:true});await deliverBlob(new Blob([await res.blob()],{type:'application/pdf'}),f.name,'application/pdf');});
 const upload=file=>run(async()=>{
  if(!isPdf(file)||file.size>3145728)throw new Error(t('Faqat PDF fayl tanlang (3 MB gacha)'));
  const params=new URLSearchParams({month,name:file.name,title:t('Imzolangan tabel')});
  const res=await fetch((process.env.NEXT_PUBLIC_API_URL||'http://localhost:4000').replace(/\/+$/,'')+'/api/hr/personnel-documents/timesheets?'+params,{method:'POST',headers:{'Content-Type':'application/octet-stream',Authorization:`Bearer ${getToken()}`,...(getFactory()?{'X-Factory':getFactory()}:{})},body:file});
  if(!res.ok){const body=await res.json().catch(()=>({}));throw new Error(body.error||t('Fayl yuklanmadi'));}
  await load();notify?.('Saqlandi');
 });
 const has=files?.length>0,ready=status&&status!=='draft';
 return <div className="hr-card hr-signed-timesheet hr-no-print">
  <div className="hr-heading"><div><h3>{t('Imzolangan tabel')}</h3><p className="hint">{t('1) Tabelni chop eting. 2) Direktor va kadrlar bo‘limi boshlig‘i imzo va muhr qo‘yadi. 3) Skanerlangan PDF’ni shu yerga yuklang.')}</p></div>
   <span className={`hrx-pill ${has?'ok':'bad'}`}>{files===null?t('Yuklanmoqda…'):has?t('PDF bor'):t('Yuklanmagan')}</span></div>
  {error&&<p className="err">{t(error)}</p>}
  {status==='draft'&&<p className="hint">{t('Tabel hali tasdiqlanmagan. Avval oyni tasdiqlang, keyin imzoga chop eting.')}</p>}
  {files?.map(f=><button key={f.id} className="hrx-file" disabled={busy} onClick={()=>download(f)} title={t('Yuklab olish')}><i className="hrx-pdf" aria-hidden="true">PDF</i><span>{f.title||f.name}<small>{size(f.sizeBytes)} · {String(f.uploadedAt).slice(0,10)}{f.uploadedBy?.name?` · ${f.uploadedBy.name}`:''}</small></span></button>)}
  <div className="acts" style={{flexWrap:'wrap'}}>
   {onPrint&&<button className="btn" disabled={busy} onClick={onPrint}><Icon name="print"/>{t('Imzo uchun chop etish')}</button>}
   {editor&&<><button className={`btn ${ready&&!has?'primary':''}`} disabled={busy} onClick={()=>input.current?.click()}><Icon name="upload"/>{t('Imzolangan PDF yuklash')}</button>
    <input ref={input} type="file" accept="application/pdf,.pdf" hidden onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)upload(f);}}/></>}
   {onOpenArchive&&<button className="btn" onClick={onOpenArchive}><Icon name="acct"/>{t('Barcha oylar arxivi')}</button>}
  </div>
 </div>;
}
