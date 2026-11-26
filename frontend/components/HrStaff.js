"use client";
import { show } from '@/lib/i18n';
import {useEffect,useState,useCallback} from 'react';import {api} from '@/lib/api';import {useUser} from '@/lib/role';import {useT} from '@/lib/i18n';import HrNavigation from './HrNavigation';import {exportSheets} from '@/lib/xlsx-export';import {fmtDate} from '@/lib/calc';import {pct} from '@/lib/hr-ui';
export default function HrStaff({view,tabs,company,onViewChange,openForm,notify,onOpenEmployee}){
 const t=useT(),{user}=useUser(),can=['admin','kadrlar'].includes(user?.role),[items,setItems]=useState([]),[departments,setDepartments]=useState([]),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const load=useCallback(async()=>{setLoading(true);setError('');try{if(view==='staff'){const [list,d]=await Promise.all([api('/hr/staff-positions'),api('/hr/departments')]);setItems(list);setDepartments(d);}else setItems((await api('/hr/reminders')).items);}catch(e){setError(e.message);}finally{setLoading(false);}},[view,user?.factory?.id]);useEffect(()=>{load();},[load]);
 function form(d){openForm({title:d?'Shtatni tahrirlash':'Yangi shtat',values:d||{slots:1},fields:[{name:'department',label:'Bo‘lim',type:'select',options:[['','Bo‘limsiz'],...departments.map(d=>[d.name,d.name])],raw:true},{name:'position',label:'Lavozim',req:true},{name:'slots',label:'Shtat soni',type:'number',min:0,step:1,req:true}],onSubmit:async v=>{await api('/hr/staff-positions'+(d?'/'+d.id:''),{method:d?'PUT':'POST',body:{...v,...(d?{version:d.version}:{})}});await load();notify('Saqlandi');}});}
 async function remove(d){if(!window.confirm(t('Shtat qatori o‘chirilsinmi? Xodimlar o‘chmaydi.')))return;try{await api('/hr/staff-positions/'+d.id,{method:'DELETE',body:{version:d.version}});await load();}catch(e){setError(e.message);}}
 return <section className="sheet hr-module"><h2>{t(view==='staff'?'Shtat jadvali':'Hujjat muddatlari bo‘yicha eslatmalar')}</h2><HrNavigation view={view} onChange={onViewChange} tabs={tabs}/><div className="hr-toolbar">{view==='staff'&&can&&<button className="btn primary" onClick={()=>form()}>{t('Yangi shtat')}</button>}<button className="btn" disabled={loading} onClick={load}>{t('Qayta yuklash')}</button>{view==='staff'&&<button className="btn" onClick={()=>exportSheets({filename:'Shtat_jadvali.xlsx',company,sheets:[{name:'Shtat',title:'Shtat jadvali',columns:[{key:'department',header:'Bo‘lim'},{key:'position',header:'Lavozim'},{key:'slots',header:'Shtat',type:'int'},{key:'occupied',header:'Band',type:'int'},{key:'vacancies',header:'Bo‘sh',type:'int'}],rows:items.map(d=>({...d,vacancies:Math.max(0,d.slots-d.occupied)}))}]}).catch(e=>setError(e.message))}>Excel</button>}</div>{error&&<p className="err">{t(error)}</p>}{loading?<p>{t('Yuklanmoqda…')}</p>:view==='staff'?<StaffCards items={items} can={can} onEdit={form} onRemove={remove}/>:<><p className="hint">{t('Muddati o‘tgan va keyingi 30 kun ichida tugaydigan pasport, muddatli shartnoma hamda tasdiqlangan hujjatlar. Faqat faol xodimlar ko‘rsatiladi.')}</p>
  <div className="hrx-dues">{items.map(d=><article key={d.id} className={`hrx-card hrx-due ${d.days<0?'bad':d.days<=7?'warn':''}`}><span className={`hrx-pill ${d.days<0?'bad':d.days<=7?'warn':'info'}`}>{d.days<0?Math.abs(d.days)+' '+t('kun o‘tgan'):d.days===0?t('Bugun tugaydi'):d.days+' '+t('kun qoldi')}</span><b>{show(d.name)}</b><small>№ {d.code} · {t(d.title)} · {fmtDate(d.date)}</small>{['admin','rahbar','kadrlar'].includes(user.role)&&<div style={{marginTop:10}}><button className="btn sm" onClick={()=>onOpenEmployee(d.employeeId)}>{t('Xodimni ochish')}</button></div>}</article>)}</div></>}{!loading&&!items.length&&<p className="empty">{t(view==='staff'?'Shtat jadvali hali kiritilmagan':'Yaqinlashayotgan hujjat muddati yo‘q')}</p>}</section>;
}

// Shtat jadvali: bo'lim kartochkalari, har birida lavozimlar va bo'sh o'rinlar
function StaffCards({items,can,onEdit,onRemove}){
 const t=useT(),groups=[];
 for(const d of items){const name=d.department||'';let g=groups.find(x=>x.name===name);if(!g)groups.push(g={name,list:[],slots:0,occupied:0});g.list.push(d);g.slots+=+d.slots||0;g.occupied+=+d.occupied||0;}
 const slots=groups.reduce((s,g)=>s+g.slots,0),occupied=groups.reduce((s,g)=>s+g.occupied,0),free=items.reduce((s,d)=>s+Math.max(0,d.slots-d.occupied),0),over=items.reduce((s,d)=>s+Math.max(0,d.occupied-d.slots),0);
 return <>
  <p className="hint">{t('Band shtat shu bo‘lim va lavozimdagi faol xodimlar bo‘yicha avtomatik hisoblanadi. Bo‘lim va lavozim nomlarini kartochkada bir xil tanlang.')}</p>
  {!!items.length&&<div className="hrx-kpis" style={{gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))'}}>
   <div className="hrx-card hrx-kpi"><span>{t('Jami shtat')}</span><strong>{slots}</strong><small>{groups.length} {t('bo‘lim')}</small></div>
   <div className="hrx-card hrx-kpi ok"><span>{t('Band')}</span><strong>{occupied}</strong><small>{pct(occupied,slots)}%</small></div>
   <div className={`hrx-card hrx-kpi ${free?'warn':''}`}><span>{t('Bo‘sh o‘rin')}</span><strong>{free}</strong><small>{t('ishga olish kerak')}</small></div>
   <div className={`hrx-card hrx-kpi ${over?'bad':''}`}><span>{t('Ortiqcha')}</span><strong>{over}</strong><small>{t('shtatdan tashqari')}</small></div>
  </div>}
  <div className="hrx-depts">{groups.map(g=>{const p=pct(g.occupied,g.slots);return <article key={g.name} className="hrx-card hrx-dept">
   <div className="top"><b>{g.name?show(g.name):t('Bo‘limsiz')}</b><span className={`hrx-pill ${g.occupied>g.slots?'bad':p>=100?'ok':'warn'}`}>{p}%</span></div>
   <div className="num">{g.occupied} <small>/ {g.slots} {t('band')}</small></div>
   <div className={`hrx-bar ${g.occupied>g.slots?'bad':p>=100?'ok':'warn'}`}><b style={{width:Math.min(100,p)+'%'}}/></div>
   <ul>{g.list.map(d=>{const free=d.slots-d.occupied;return <li key={d.id}><span>{show(d.position)} · {d.occupied}/{d.slots}</span><span className="acts">{free>0&&<span className="hrx-pill warn">{free} {t('bo‘sh')}</span>}{free<0&&<span className="hrx-pill bad">+{-free}</span>}{can&&<><button className="btn sm" aria-label={`${t('Tahrirlash')}: ${d.position}`} onClick={()=>onEdit(d)}>{t('Tahrirlash')}</button><button className="btn sm" aria-label={`${t('O‘chirish')}: ${d.position}`} onClick={()=>onRemove(d)}>×</button></>}</span></li>;})}</ul>
  </article>;})}</div>
 </>;
}
