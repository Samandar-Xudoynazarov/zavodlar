"use client";
import { useCallback,useEffect,useMemo,useRef,useState } from 'react';
import { api,getToken,getFactory } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useUser } from '@/lib/role';
import { today } from '@/lib/calc';
import { exportTimesheet } from '@/lib/hr-timesheet';
import { exportSheets } from '@/lib/xlsx-export';
import { deliverBlob } from '@/lib/share';
import { DOC_TITLES } from '@/lib/hr-document-definitions';
import { personnelPdfBlob,fetchPersonnelDocument,centerPdfBlob,downloadCenterPdf } from '@/lib/hr-documents';
import HrNavigation from './HrNavigation';
import Icon from './Icon';
const STATES={draft:'Qoralama',issued:'Rasmiylashtirilgan',approved:'Tasdiqlangan',completed:'Yakunlangan',cancelled:'Bekor qilingan',stored:'Yuklangan fayl'};
const RECORDS={leave:'Ta’til kartochkasi',shift:'Smena rejasi',order:'Buyruq reyestridan ko‘chirma',document:'Hujjat muddati kartochkasi',equipment:'Himoya vositalari kartochkasi'};
const CATEGORIES=[['policy','Ichki tartib va nizom'],['job','Lavozim yo‘riqnomasi'],['application','Ariza'],['certificate','Ma’lumotnoma'],['order','Imzolangan buyruq'],['other','Boshqa hujjat']];
const SLOTS={passport:'Pasport nusxasi',residence:'Turar joy ma’lumotnomasi',criminal:'Sudlanmaganlik ma’lumotnomasi',narcology:'Narkologiya ma’lumotnomasi',psych:'Psixonevrologiya ma’lumotnomasi',medical086:'086-shakl tibbiy ma’lumotnoma',photo:'3×4 rasm',diploma:'Diplom nusxasi',experience:'Ish tajribasi',military:'Harbiy hisob hujjati',pinfl:'JShShIR hujjati',signed:'Imzolangan shartnoma va buyruqlar'};
const safe=s=>String(s||'hujjat').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/^[. ]+|[. ]+$/g,'').slice(0,140)||'hujjat';
export default function HrDocuments({notify,openForm,onViewChange,onOpenEmployee,tabs}){
 const t=useT(),{user}=useUser(),[data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[progress,setProgress]=useState('');
 const [query,setQuery]=useState(''),[group,setGroup]=useState('all'),[employeeId,setEmployeeId]=useState(''),[department,setDepartment]=useState(''),[status,setStatus]=useState(''),[year,setYear]=useState(''),[month,setMonth]=useState(()=>today().slice(0,7));
 const [selected,setSelected]=useState([]),[uploadOpen,setUploadOpen]=useState(false),[file,setFile]=useState(null),operation=useRef(false),generation=useRef(0);
 const load=useCallback(async()=>{const id=++generation.current;try{const result=await api('/hr/personnel-documents');if(id!==generation.current)return;setData(result);setSelected([]);setError('');}catch(e){if(id===generation.current)setError(e.message);}},[user.factory?.id]);
 useEffect(()=>{load();return()=>generation.current++;},[load]);
 async function run(fn){if(operation.current)return;operation.current=true;setBusy(true);try{await fn();setError('');}catch(e){setError(e.message);notify(e.message);}finally{operation.current=false;setBusy(false);setProgress('');}}
 const employees=data?.employees||[],byId=useMemo(()=>new Map(employees.map(e=>[e.id,e])),[employees]);
 const rows=useMemo(()=>data?[
  ...data.documents.map(d=>({...d,key:'doc-'+d.id,source:'document',title:DOC_TITLES[d.kind],group:['contract','addendum'].includes(d.kind)?'contracts':'orders',format:'PDF'})),
  ...data.files.map(d=>({...d,key:'file-'+d.id,source:'file',title:SLOTS[d.slot]||d.name,group:'dossier',date:d.uploadedAt.slice(0,10),status:'stored',format:d.mime==='application/pdf'?'PDF':d.mime==='image/png'?'PNG':'JPG'})),
  ...data.records.map(d=>({...d,key:'record-'+d.id,source:'record',recordKind:d.kind,title:d.title,group:'records',date:d.startDate,number:d.detail?.number,format:'PDF'})),
  ...data.companyFiles.map(d=>({...d,key:'company-'+d.id,source:'company',group:'company',date:d.date||d.uploadedAt.slice(0,10),status:'stored',format:d.mime==='application/pdf'?'PDF':d.mime==='image/png'?'PNG':'JPG'})),
 ].sort((a,b)=>b.date.localeCompare(a.date)||a.title.localeCompare(b.title)):[],[data]);
 const filtered=rows.filter(r=>{
  const e=byId.get(r.employeeId),words=[r.title,r.number,r.name,e?.name,e?.code,e?.department].join(' ').toLocaleLowerCase();
  return (group==='all'||r.group===group)&&(!employeeId||r.employeeId===employeeId)&&(!department||e?.department===department)&&(!status||r.status===status)&&(!year||r.date.slice(0,4)===year)&&(!query||words.includes(query.toLocaleLowerCase()));
 });
 const selectedRows=rows.filter(r=>selected.includes(r.key));
 const departments=[...new Set(employees.map(e=>e.department).filter(Boolean))].sort(),years=[...new Set(rows.map(r=>r.date.slice(0,4)))].sort().reverse();
 const scoped=employees.filter(e=>(!employeeId||e.id===employeeId)&&(!department||e.department===department));
 const groups=[['all','Barcha hujjatlar'],['contracts','Shartnomalar'],['orders','Buyruqlar'],['dossier','Shaxsiy delo'],['records','Ta’til, smena va reyestrlar'],['company','Korxona hujjatlari']];
 async function rowFile(row){
  if(row.source==='file'||row.source==='company'){
   const path=row.source==='file'?`/hr/personnel/${row.employeeId}/files/${row.id}`:`/hr/personnel-documents/company-files/${row.id}`;
   const response=await api(path,{raw:true});return {blob:await response.blob(),name:row.name};
  }
  if(row.source==='document'){const d=await fetchPersonnelDocument(row.employeeId,row.id);return {blob:await personnelPdfBlob(d),name:`${safe(row.title)}_${safe(row.number||'qoralama')}.pdf`};}
  const employee=byId.get(row.employeeId);return {blob:await centerPdfBlob({kind:row.recordKind,employee,employer:data.employer,record:row,today:today()}),name:`${safe(RECORDS[row.recordKind])}_${safe(employee.code)}_${row.date}.pdf`};
 }
 async function downloadRow(row){const f=await rowFile(row);await deliverBlob(f.blob,safe(f.name),f.blob.type);}
 async function zip(){
  if(!selectedRows.length)return;if(selectedRows.length>30)throw new Error('Bir safar 30 tagacha hujjat tanlang');
  const module=await import('jszip'),archive=new (module.default||module)();let bytes=0;
  for(let i=0;i<selectedRows.length;i++){setProgress(`${i+1} / ${selectedRows.length}`);const row=selectedRows[i],f=await rowFile(row);bytes+=f.blob.size;if(bytes>30*1024*1024)throw new Error('Jami hajm 30 MB dan oshdi. Kamroq fayl tanlang');const e=byId.get(row.employeeId);archive.file(`${String(i+1).padStart(2,'0')}_${safe(e?.name||'Korxona')}/${safe(f.name)}`,await f.blob.arrayBuffer());}
  const blob=await archive.generateAsync({type:'blob',compression:'DEFLATE'});await deliverBlob(blob,`Kadrlar_hujjatlari_${today()}.zip`,'application/zip');
 }
 async function tabel(blank=false){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new Error('Tabel oyini tanlang');
  const doc=blank?{attendance:{},status:'draft',normHours:0}:await api(`/hr/months/${month}`);
  const end=new Date(+month.slice(0,4),+month.slice(5),0).getDate(),endDate=`${month}-${end}`;
  const list=scoped.filter(e=>e.hireDate<=endDate&&(!e.endDate||e.endDate>=month+'-01'));
  if(!list.length)throw new Error('Tanlangan davrda xodim topilmadi');
  await exportTimesheet({month,employees:list,doc,company:data.employer.company||user.factory?.name,t,blank});
 }
 function certificate(kind){
  openForm({title:kind==='certificate'?'Ish joyidan ma’lumotnoma':'Shaxsiy delo ro‘yxati',values:{employeeId:employeeId||scoped[0]?.id},fields:[{name:'employeeId',label:'Xodim',type:'select',options:scoped.map(e=>[e.id,`${e.code} · ${e.name}`]),req:true}],onSubmit:async v=>{const card=await api(`/hr/personnel/${v.employeeId}`);await downloadCenterPdf({kind,employee:card.employee,employer:data.employer,files:card.files,dossier:card.employee.profile?.dossier,today:today()});}});
 }
 async function register(){await exportSheets({filename:`Kadrlar_reyestri_${today()}.xlsx`,sheets:[{name:t('Hujjatlar'),title:t('Kadrlar hujjatlari reyestri'),columns:[{key:'title',header:t('Hujjat'),width:36},{key:'number',header:t('Raqam')},{key:'date',header:t('Sana')},{key:'employee',header:t('Xodim'),width:28},{key:'department',header:t('Sex / bo‘lim')},{key:'statusText',header:t('Holat')},{key:'format',header:'Format'}],rows:filtered.map(r=>({...r,title:t(r.title),employee:byId.get(r.employeeId)?.name||t('Korxona hujjati'),department:byId.get(r.employeeId)?.department,statusText:t(STATES[r.status])}))}],company:data.employer.company||user.factory?.name});}
 async function upload(event){event.preventDefault();const form=event.currentTarget,values=new FormData(form);await run(async()=>{
  if(!file||file.size>3145728)throw new Error('PDF, JPG yoki PNG fayl tanlang (3 MB gacha)');
  const params=new URLSearchParams({name:file.name,mime:file.type,title:String(values.get('title')),category:String(values.get('category')),date:String(values.get('date')||'')});
  const response=await fetch((process.env.NEXT_PUBLIC_API_URL||'http://localhost:4000').replace(/\/+$/,'')+'/api/hr/personnel-documents/company-files?'+params,{method:'POST',headers:{'Content-Type':'application/octet-stream',Authorization:`Bearer ${getToken()}`,...(getFactory()?{'X-Factory':getFactory()}: {})},body:file});
  if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.error||'Fayl yuklanmadi');}setFile(null);form.reset();setUploadOpen(false);await load();setGroup('company');setEmployeeId('');setDepartment('');setQuery('');setStatus('');setYear('');notify('Saqlandi');
 });}
 if(!data)return <section className="sheet hr-document-center"><p>{error||t('Yuklanmoqda…')}</p>{error&&<button className="btn" onClick={load}>{t('Qayta yuklash')}</button>}</section>;
 return <section className="sheet hr-module hr-document-center" aria-busy={busy}>
  <header className="hr-heading"><div><span className="hr-eyebrow">{t('Kadrlar hujjatlari')}</span><h2>{t('Hujjatlar markazi')}</h2><p className="hint">{t('Tabel, shartnoma, buyruq va fayllar - barchasi bir joyda.')}</p></div><button className="btn" onClick={()=>run(load)} disabled={busy}><Icon name="moves"/>{t('Qayta yuklash')}</button></header>
  <HrNavigation view="archive" onChange={onViewChange} tabs={tabs}/>
  <div className="hr-doc-exports"><article><Icon name="grid" size={28}/><div><h3>{t('Oylik tabel')}</h3><p>{t('Kunlar, holatlar, soatlar va imzolar. A4 albom.')}</p></div><label>{t('Tabel oyi')}<input type="month" aria-label={t('Tabel oyi')} value={month} onChange={e=>setMonth(e.target.value)}/></label><div className="acts"><button className="btn primary" disabled={busy||!data.months.some(m=>m.month===month)} onClick={()=>run(()=>tabel())}><Icon name="download"/>{t('Tabelni yuklab olish')} · Excel</button><button className="btn" disabled={busy} onClick={()=>run(()=>tabel(true))}>{t('Bo‘sh tabel')} · Excel</button></div>{!data.months.some(m=>m.month===month)&&<p className="hint">{t('Bu oy uchun saqlangan tabel yo‘q. Tabel bo‘limida hisob oyini oching.')}</p>}</article>
   <article><Icon name="acct" size={28}/><div><h3>{t('Ma’lumotnoma va ro‘yxatlar')}</h3><p>{t('Xodim yoki bo‘lim filtrini tanlab yuklab oling.')}</p></div><div className="acts"><button className="btn" disabled={busy||!scoped.length} onClick={()=>certificate('certificate')}>{t('Ish joyidan ma’lumotnoma')} · PDF</button><button className="btn" disabled={busy||!scoped.length} onClick={()=>certificate('dossier')}>{t('Delo ro‘yxati')} · PDF</button><button className="btn" disabled={busy} onClick={()=>run(register)}>{t('Hujjatlar reyestri')} · Excel</button><button className="btn" onClick={()=>onViewChange('reports')}>{t('Tabel va hisob hisobotlari')} →</button></div></article></div>
  <div className="hr-doc-groups" role="tablist" aria-label={t('Hujjat turlari')}>{groups.map(([id,label])=><button key={id} role="tab" aria-selected={group===id} onClick={()=>{setGroup(id);setSelected([]);setStatus('');if(id==='company'){setEmployeeId('');setDepartment('');}}}>{t(label)} <span>{id==='all'?rows.length:rows.filter(r=>r.group===id).length}</span></button>)}</div>
  <div className="hr-doc-filters"><label className="doc-search">{t('Hujjat qidirish')}<input type="search" aria-label={t('Hujjat qidirish')} placeholder={t('Ism, raqam yoki hujjat nomi')} value={query} onChange={e=>setQuery(e.target.value)}/></label><label>{t('Xodim')}<select aria-label={t('Hujjatlar xodimi')} value={employeeId} onChange={e=>{setEmployeeId(e.target.value);setSelected([]);}}><option value="">{t('Barcha xodimlar')}</option>{employees.map(e=><option key={e.id} value={e.id}>{e.code} · {e.name}</option>)}</select></label><label>{t('Sex / bo‘lim')}<select aria-label={t('Hujjatlar bo‘limi')} value={department} onChange={e=>setDepartment(e.target.value)}><option value="">{t('Barcha bo‘limlar')}</option>{departments.map(d=><option key={d}>{d}</option>)}</select></label><label>{t('Holat')}<select aria-label={t('Hujjatlar holati')} value={status} onChange={e=>setStatus(e.target.value)}><option value="">{t('Barcha holatlar')}</option>{Object.entries(STATES).map(([id,label])=><option key={id} value={id}>{t(label)}</option>)}</select></label><label>{t('Yil')}<select aria-label={t('Hujjatlar yili')} value={year} onChange={e=>setYear(e.target.value)}><option value="">{t('Barcha yillar')}</option>{years.map(y=><option key={y}>{y}</option>)}</select></label></div>
  <div className="hr-toolbar"><span>{t('Topildi')}: <strong>{filtered.length}</strong></span><button className="btn" disabled={busy||!selectedRows.length} onClick={()=>run(zip)}><Icon name="download"/>{t('Tanlanganlarni yuklash')} · ZIP ({selectedRows.length}) {progress}</button><button className="btn" onClick={()=>setUploadOpen(v=>!v)}><Icon name="upload"/>{t('Korxona hujjatini qo‘shish')}</button><button className="btn" onClick={()=>{setQuery('');setEmployeeId('');setDepartment('');setStatus('');setYear('');setSelected([]);}}>{t('Filtrlarni tozalash')}</button></div>
  {uploadOpen&&<form className="hr-doc-upload" onSubmit={upload}><h3>{t('Korxona hujjatini qo‘shish')}</h3><p className="hint">{t('Ichki nizom, lavozim yo‘riqnomasi, ariza yoki boshqa hujjat nusxasini saqlang.')} PDF / JPG / PNG · 3 MB</p><div className="hr-doc-filters"><label>{t('Hujjat nomi')}<input name="title" required maxLength={200}/></label><label>{t('Hujjat turi')}<select name="category">{CATEGORIES.map(([id,label])=><option key={id} value={id}>{t(label)}</option>)}</select></label><label>{t('Sana')}<input type="date" name="date"/></label><label className="btn">{t('Fayl tanlash')}<input className="sr-only" aria-label={t('Korxona fayli')} type="file" accept="application/pdf,image/jpeg,image/png" onChange={e=>setFile(e.target.files?.[0]||null)}/></label><span>{file?.name}</span><button className="btn primary" disabled={busy||!file}>{t('Saqlash')}</button></div></form>}
  {error&&<p className="err" role="alert">{t(error)}</p>}
  <div className="tbl-wrap"><table className="hr-doc-table"><thead><tr><th><input type="checkbox" aria-label={t('Ko‘rinayotgan hujjatlarni tanlash')} disabled={!filtered.length} checked={!!filtered.length&&filtered.every(r=>selected.includes(r.key))} onChange={e=>setSelected(e.target.checked?filtered.map(r=>r.key):[])}/></th>{['Hujjat','Xodim','Sana','Holat','Yuklab olish'].map(l=><th key={l}>{t(l)}</th>)}</tr></thead><tbody>{filtered.map(r=>{const e=byId.get(r.employeeId);return <tr key={r.key}><td><input type="checkbox" aria-label={`${t('Tanlash')}: ${t(r.title)} ${r.number||r.name||''} ${e?.name||''}`} checked={selected.includes(r.key)} onChange={ev=>setSelected(v=>ev.target.checked?[...v,r.key]:v.filter(k=>k!==r.key))}/></td><td><strong>{t(r.title)}</strong><div className="hint">{r.number?`№ ${r.number}`:r.name||t(RECORDS[r.recordKind]||'Qoralama')}{r.source==='record'&&` · ${t('Reyestr ko‘chirmasi')}`}</div></td><td>{e?<><button className="hr-employee-link" onClick={()=>onOpenEmployee(e.id)}>{e.name}</button><div className="hint">{e.code} · {e.department}</div></>:t('Korxona hujjati')}</td><td>{r.date}</td><td><span className={`document-badge ${r.status}`}>{t(STATES[r.status])}</span></td><td><div className="acts"><button className="btn sm" disabled={busy} onClick={()=>run(()=>downloadRow(r))}><Icon name="download"/>{r.format}</button>{r.source==='company'&&<button className="btn sm" aria-label={`${r.title} · ${t('O‘chirish')}`} disabled={busy} onClick={()=>{if(window.confirm(`${r.title}: ${t('Faylni o‘chirasizmi?')}`))run(async()=>{await api(`/hr/personnel-documents/company-files/${r.id}`,{method:'DELETE'});await load();});}}><Icon name="trash"/></button>}</div></td></tr>;})}</tbody></table></div>
  {!filtered.length&&<div className="empty"><h3>{t('Hujjat topilmadi')}</h3><p>{t('Filtrlarni tekshiring yoki xodim kabinetida hujjat yarating.')}</p><button className="btn primary" onClick={()=>onViewChange('employees')}>{t('Xodimlarga o‘tish')}</button></div>}
  <p className="hint">{t('Rasmiylashtirilgan hujjat - imzolar tekshirilgani qayd etilgan nusxa. Yuklangan fayl - asl yuklangan nusxa. Reyestr ko‘chirmasi imzolangan buyruqning o‘rnini bosmaydi.')}</p>
 </section>;
}
