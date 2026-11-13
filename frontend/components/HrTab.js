"use client";
import HrEmployeeImport from './HrEmployeeImport';
import HrStaff from './HrStaff';
import HrAttendanceFields from './HrAttendanceFields';
import {emptyAttendance,updateAttendance} from '@/lib/attendance';
import HrDeadlineNotice from './HrDeadlineNotice';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useUser } from '@/lib/role';
import { useT } from '@/lib/i18n';
import { today, fmtN } from '@/lib/calc';
import { setUnsaved, confirmLeave } from '@/lib/dirty';
import { exportSheets } from '@/lib/xlsx-export';
import Icon from './Icon';
import HrWorkforce from './HrWorkforce';
import HrNavigation from './HrNavigation';
import HrEmployeeProfile from './HrEmployeeProfile';
import HrDocuments from './HrDocuments';
import { exportTimesheet } from '@/lib/hr-timesheet';

const PAY=['admin','rahbar','buxgalter'];
const STATUS=[['work','Ishda'],['off','Dam olish'],['leave',"Ta'til"],['sick','Kasallik'],['absent','Kelmagan'],['trip','Xizmat safari']];
const MONTH_STATUS={draft:'Qoralama',approved:'Tasdiqlangan',closed:'Yopilgan'};
const sum=(list,key)=>list.reduce((s,r)=>s+(+r[key]||0),0);
const endOf=m=>new Date(+m.slice(0,4),+m.slice(5),0).getDate();
const employed=(e,date)=>!!e.hireDate&&e.hireDate<=date&&(!e.endDate||e.endDate>=date);
const monthEmployees=(list,month)=>list.filter(e=>e.hireDate&&e.hireDate<=`${month}-${endOf(month)}`&&(!e.endDate||e.endDate>=month+'-01'));

export default function HrTab({notify,openForm,initialView,onViewChange}) {
  const t=useT();const {user}=useUser();const pay=PAY.includes(user?.role),manage=user?.role!=='usta';
  const [view,setView]=useState(initialView||(user?.role==='usta'?'time':'employees'));
  const [entryShiftCount,setEntryShiftCount]=useState(1);
  const [timeMode,setTimeMode]=useState('list'),[listDay,setListDay]=useState(1),[listEdits,setListEdits]=useState({});
  const [month,setMonth]=useState(()=>today().slice(0,7));
  const [employees,setEmployees]=useState([]),[months,setMonths]=useState([]),[doc,setDoc]=useState(null);
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [query,setQuery]=useState(''),[selected,setSelected]=useState(''),[days,setDays]=useState({}),[dirty,setDirty]=useState(false);
  const [profileId,setProfileId]=useState('');
  const [departments,setDepartments]=useState([]),[departmentFilter,setDepartmentFilter]=useState('');
  const employeeAdmin=['admin','kadrlar'].includes(user?.role);
  const [rates,setRates]=useState(null),[history,setHistory]=useState(null);
  useEffect(()=>{if(initialView){setView(initialView);setDirty(false);setListEdits({});setDays(doc?.attendance?.[selected]||{});}},[initialView]);
  useEffect(()=>{setListDay(day=>Math.min(day,endOf(month)));},[month]);
  const request=useRef(0),ratesRequest=useRef(0);
  const load=useCallback(async()=>{
    const id=++request.current;setLoading(true);setError('');setDoc(null);
    try {
      const [es,ms,ds]=await Promise.all([api('/hr/employees'),api('/hr/months'),api('/hr/departments')]);
      const m=ms.some(x=>x.month===month)?await api(`/hr/months/${month}`):null;
      if(id!==request.current)return;
      setEmployees(es);setDepartments(ds);setMonths(ms);setDoc(m);setDirty(false);
    } catch(e){if(id===request.current)setError(e.message);}
    finally {if(id===request.current)setLoading(false);}
  },[month]);
  useEffect(()=>{load();return()=>{request.current++;ratesRequest.current++;};},[load]);
  useEffect(()=>{setUnsaved(dirty);return()=>setUnsaved(false);},[dirty]);
  useEffect(()=>{setDays(doc?.attendance?.[selected]||{});setListEdits({});setDirty(false);},[selected,doc]);
  useEffect(()=>{
    setRates(null);setHistory(null);const id=++ratesRequest.current;
    if(selected&&pay&&view==='employees') api(`/hr/rates/${selected}`).then(list=>{if(id===ratesRequest.current)setRates(list);}).catch(e=>{if(id===ratesRequest.current)notify(e.message);});
    return()=>{ratesRequest.current++;};
  },[selected,month,pay,view,notify]);
  const askLeave=()=>!dirty||confirmLeave(t("Saqlanmagan o'zgarishlar bor. Ularni tashlab ketasizmi?"));
  const run=async(fn)=>{if(busy)return;setBusy(true);setError('');try{await fn();}catch(e){setError(e.message);notify(e.message);}finally{setBusy(false);}};
  const refresh=()=>{if(askLeave())load();};
  const changeView=v=>{if(askLeave()){setProfileId('');if(onViewChange){onViewChange(v);return;}setView(v);setDirty(false);setDays(doc?.attendance?.[selected]||{});}};
  const choose=id=>{if(askLeave()){setSelected(id);setDirty(false);}};
  const visible=employees.filter(e=>`${e.name} ${e.code} ${e.position} ${e.department}`.toLowerCase().includes(query.toLowerCase())&&(!departmentFilter||(departmentFilter==='__none'? !e.department:e.department===departmentFilter)));
  const eligible=useMemo(()=>monthEmployees(employees,month),[employees,month]);
  const employee=employees.find(e=>e.id===selected);
  const payroll=doc?.payroll||[];const person=payroll.find(p=>p.employeeId===selected);
  const editable=doc?.status==='draft'&&!loading&&!busy;
  const dayList=Array.from({length:endOf(month)},(_,i)=>i+1);
  const tabs=[...(manage?[['overview','Kadrlar nazorati'],['leaves','Ta’tillar'],['shifts','Smena rejasi'],['orders','Buyruqlar'],['documents','Hujjat muddatlari'],['equipment','Himoya vositalari']]:[]),['employees','Xodimlar'],...(['admin','rahbar','kadrlar'].includes(user?.role)?[['staff','Shtat jadvali'],['reminders','Muddat eslatmalari']]:[]),['time','Tabel'],...(['admin','rahbar','kadrlar'].includes(user?.role)?[['archive','Hujjatlar']]:[]),...(pay?[['payroll','Oylik hisoblash'],['payments',"To'lovlar"]]:[]),['reports','Hisobotlar']];
  const checkReady=()=>{if(loading||error)throw new Error(t("Avval ma'lumotlarni qayta yuklang"));};

  function employeeForm(e) {
    if(!askLeave())return;
    const fields=[['birthDate','Tug‘ilgan sana','date'],['passport','Pasport / ID raqami'],['pinfl','JShShIR'],['passportIssued','Berilgan sana','date'],['passportExpiry','Amal qilish muddati','date'],['passportIssuer','Kim tomonidan berilgan'],['phone2','Ikkinchi telefon'],['birthPlace','Tug‘ilgan joy'],['citizenship','Fuqaroligi'],['gender','Jinsi'],['maritalStatus','Oilaviy holati'],['address','Doimiy manzil'],['currentAddress','Hozirgi manzil'],['education','Ma’lumoti'],['specialty','Mutaxassisligi'],['diplomaNumber','Diplom raqami'],['previousEmployment','Avvalgi ish joyi va staji'],['emergencyName','Yaqin kishisi'],['emergencyPhone','Yaqin kishisining telefoni']];
    openForm({title:e?'Xodim kartochkasi':'Yangi xodim',description:'Avval ish ma’lumotlarini kiriting, keyin pasport va aloqalarni to‘ldiring. Qolgan ma’lumotlarni keyin ham tahrirlash mumkin.',values:e?{...e,...e.profile}:{hireDate:today()},fields:[
      {name:'code',label:'Tabel raqami',req:true},{name:'name',label:'F.I.Sh.',req:true},
      {name:'position',label:'Lavozim'},
      {name:'department',label:'Sex / bo‘lim',type:'select',raw:true,options:[['','Bo‘limsiz'],...Array.from(new Set([...departments.map(d=>d.name),...employees.map(x=>x.department)].filter(Boolean))).sort().map(n=>[n,n])]},
      {name:'phone',label:'Telefon'},...fields.map(([name,label,type])=>({name,label,type})),
      {name:'hireDate',label:'Ishga kirish sanasi',type:'date',req:true},...(employeeAdmin?[{name:'endDate',label:'Oxirgi ish kuni',type:'date'}]:[]),{name:'notes',label:'Izoh',wide:true}].map(f=>({...f,section:['code','name','position','department','hireDate','endDate','notes'].includes(f.name)?'1. Ish ma’lumotlari':['phone','phone2','emergencyName','emergencyPhone'].includes(f.name)?'3. Aloqa ma’lumotlari':['education','specialty','diplomaNumber','previousEmployment'].includes(f.name)?'4. Ma’lumoti va tajribasi':'2. Shaxsiy ma’lumotlar'})).sort((a,b)=>a.section.localeCompare(b.section)),onSubmit:async v=>{
        const profile={...e?.profile,...Object.fromEntries(fields.map(([key])=>[key,v[key]]))};
        const saved=await api(e?`/hr/employees/${e.id}`:'/hr/employees',{method:e?'PUT':'POST',body:{...v,...(e?{endDate:employeeAdmin?v.endDate:e.endDate,version:e.version}:{}),profile}});
        await load();if(['admin','rahbar','kadrlar'].includes(user?.role))setProfileId(saved.id);notify('Saqlandi');
      }});
  }
  function departmentForm(d=null){
    openForm({title:d?'Bo‘limni tahrirlash':'Yangi bo‘lim',values:d||{},fields:[{name:'name',label:'Bo‘lim nomi',req:true}],onSubmit:async v=>{
      await api(d?'/hr/departments/'+d.id:'/hr/departments',{method:d?'PUT':'POST',body:{...v,...(d?{version:d.version}:{})}});
      if(d&&departmentFilter===d.name)setDepartmentFilter(v.name);await load();notify('Saqlandi');
    }});
  }
  function assignDepartment(){
    openForm({title:'Xodimni bo‘limga biriktirish',values:{department:departmentFilter==='__none'?'':departmentFilter},fields:[
      {name:'employeeId',label:'Xodim',type:'select',req:true,raw:true,options:[['','Tanlang'],...employees.map(e=>[e.id,e.name+' · '+e.code])]},
      {name:'department',label:'Bo‘lim',type:'select',raw:true,options:[['','Bo‘limsiz'],...departments.map(d=>[d.name,d.name])]}
    ],onSubmit:async v=>{const e=employees.find(e=>e.id===v.employeeId);if(!e)throw new Error('Xodim topilmadi');await api('/hr/employees/'+e.id,{method:'PUT',body:{...e,department:v.department}});await load();notify('Saqlandi');}});
  }
  function deleteEmployee(e){
    openForm({title:'Xodimni butunlay o‘chirish',description:e.name+' — kartochka, shaxsiy fayllar, kadrlar hujjatlari, maosh tarixi va qoralama tabel yozuvlari o‘chadi. Amal qaytarilmaydi. Tasdiqlangan hisob yoki amaldagi to‘lov bo‘lsa o‘chirish bloklanadi.',submitLabel:'Butunlay o‘chirish',fields:[{name:'confirmName',label:'Tasdiqlash uchun xodimning to‘liq F.I.Sh.ini kiriting',req:true,wide:true}],onSubmit:async v=>{
      await api('/hr/employees/'+e.id,{method:'DELETE',body:{version:e.version,confirmName:v.confirmName}});
      if(selected===e.id)setSelected('');setProfileId('');await load();notify('Xodim o‘chirildi');
    }});
  }
  function newMonth() {
    const workDays=dayList.filter(d=>{const wd=new Date(`${month}-${String(d).padStart(2,'0')}T00:00:00Z`).getUTCDay();return wd>0&&wd<6;}).length;
    openForm({title:'Hisob oyini ochish',values:{month,normHours:workDays*8},fields:[
      {name:'month',label:'Oy (YYYY-MM)',req:true},
      {name:'normHours',label:'Oy ish soati normasi',type:'number',min:.01,step:.01,req:true},
    ],onSubmit:async v=>{await api('/hr/months',{method:'POST',body:v});if(v.month!==month)setMonth(v.month);else await load();notify('Saqlandi');}});
  }
  function settings() {
    openForm({title:'Oy sozlamalari',values:{...doc,workDays:doc.workDays.join(','),holidays:doc.holidays.join(',')},fields:[
      {name:'normHours',label:'Oy ish soati normasi',type:'number',min:.01,step:.01,req:true},
      ...(pay?[{name:'taxRate',label:'Daromad solig‘i, %',type:'number',min:0,step:.01,req:true}]:[]),
      {name:'workDays',label:'Ish haftasi (1=Du, 7 o‘rniga 0=Ya)',req:true,wide:true},
      {name:'holidays',label:'Dam olish sanalari (vergul bilan)',wide:true}
    ],onSubmit:async v=>{await api(`/hr/months/${month}/settings`,{method:'PUT',body:{...v,version:doc.version,workDays:v.workDays.split(',').map(x=>Number(x.trim())),holidays:v.holidays.split(',').map(x=>x.trim()).filter(Boolean)}});await load();notify('Saqlandi');}});
  }
  function showRates(e) { choose(e.id); }
  function rateForm(e,editing=null) {
    const latest=editing||rates?.[0];
    openForm({title:'Maosh belgilash',values:{effectiveDate:editing?editing.effectiveDate:latest?(e.hireDate>today()?e.hireDate:today()):e.hireDate,salary:latest?.salary||0,coefficient:latest?.coefficient??247500,grade:latest?.grade||''},fields:[
      {name:'effectiveDate',label:'Amal qilish sanasi',type:'date',req:true},
      {name:'salary',label:'Lavozim maoshi',type:'number',min:0,step:.01,req:true},
      {name:'coefficient',label:'To‘liq oy uchun koeffitsiyent haqi',type:'number',min:0,step:.01,req:true},
      {name:'grade',label:'Razryad'}, {name:'reason',label:'O‘zgarish sababi',wide:true}
    ],onSubmit:async v=>{await api(`/hr/rates/${editing?editing.id:e.id}`,{method:editing?'PUT':'POST',body:{...v,...(editing?{version:editing.version}:{})}});await load();setRates(await api(`/hr/rates/${e.id}`));notify('Saqlandi');}});
  }
  function adjustment(row) {
    openForm({title:'Oylik qo‘shimchalari',values:{extra:0,tripPay:0,deductions:0,openingBalance:0,...doc.adjustments[row.employeeId]},fields:[
      {name:'extra',label:'Qo‘shimcha haq',type:'number',min:0,step:.01},
      {name:'tripPay',label:'Xizmat safari haqi',type:'number',min:0,step:.01},
      {name:'deductions',label:'Boshqa ushlanmalar',type:'number',min:0,step:.01},
      ...(!row.openingCarried?[{name:'openingBalance',label:'Boshlang‘ich qarzdorlik',type:'number',step:.01}]:[]),
      {name:'note',label:'Hisob izohi',wide:true}
    ],onSubmit:async v=>{await api(`/hr/months/${month}/adjustments/${row.employeeId}`,{method:'PUT',body:{...v,openingBalance:v.openingBalance||0,version:doc.version}});await load();notify('Saqlandi');}});
  }
  function paymentForm() {
    const requestId=crypto.randomUUID();
    openForm({title:'To‘lov yozish',values:{employeeId:person?.employeeId||payroll[0]?.employeeId,date:today(),method:'card',kind:'advance'},fields:[
      {name:'employeeId',label:'Xodim',type:'select',options:payroll.map(p=>[p.employeeId,p.name]),req:true,wide:true},
      {name:'date',label:'To‘lov sanasi',type:'date',req:true},
      {name:'amount',label:'Summa',type:'number',min:.01,step:.01,req:true},
      {name:'method',label:'To‘lov usuli',type:'select',options:[['cash','Naqd'],['card','Bank kartasi']]},
      {name:'kind',label:'To‘lov maqsadi',type:'select',options:[['advance','Avans'],['salary','Oylik']]},
      {name:'note',label:'Izoh',wide:true}
    ],onSubmit:async v=>{await api(`/hr/months/${month}/payments`,{method:'POST',body:{...v,requestId,version:doc.version}});await load();notify('Saqlandi');}});
  }
  function voidPayment(p) {
    openForm({title:'To‘lovni bekor qilish',fields:[{name:'reason',label:'Bekor qilish sababi',req:true,wide:true}],onSubmit:async v=>{
      await api(`/hr/months/${month}/payments/${p.id}/void`,{method:'POST',body:{...v,version:doc.version}});await load();notify('Saqlandi');
    }});
  }
  function fillSchedule() {
    if(Object.keys(days).length&&!window.confirm(t('Mavjud tabelni ish jadvali bilan almashtirasizmi?')))return;
    const out={};dayList.forEach(d=>{const date=`${month}-${String(d).padStart(2,'0')}`;if(!employed(employee,date))return;
      const work=doc.workDays.includes(new Date(date+'T00:00:00Z').getUTCDay())&&!doc.holidays.includes(date);
      out[d]=updateAttendance(emptyAttendance(entryShiftCount),'status',work?'work':'off');
    });setDays(out);setDirty(true);
  }
  function changeDay(d,key,value) {
    const old=days[d]||emptyAttendance(entryShiftCount);
    const v=updateAttendance(old,key,value);
    const next={...days};if(key==='status'&&value==='')delete next[d];else next[d]=v;
    setDays(next);setDirty(true);
  }
  async function exportReport(onlyPerson=false) {
    checkReady();if(!doc)return; if(dirty)throw new Error(t('Avval tabelni saqlang'));
    const timeRows=eligible.filter(e=>!onlyPerson||e.id===selected).map(e=>{
      const ds=doc.attendance[e.id]||{};const vals=Object.values(ds);return {name:e.name,code:e.code,department:e.department,...Object.fromEntries(dayList.map(d=>{const v=ds[d];return [`d${d}`,v?(['work','trip'].includes(v.status)?v.hours:t(STATUS.find(x=>x[0]===v.status)?.[1])):''];})),workedDays:vals.filter(v=>v.hours>0).length,hours:vals.reduce((s,v)=>s+v.hours,0)};
    });
    const sheets=[{name:t('Tabel'),title:`${t('Tabel')} - ${month}`,columns:[{key:'code',header:t('Tabel raqami'),width:14},{key:'name',header:t('F.I.Sh.'),width:28},{key:'department',header:t('Sex / bo‘lim')},...dayList.map(d=>({key:`d${d}`,header:String(d),width:11})),{key:'workedDays',header:t('Ish kuni'),type:'num',total:'sum'},{key:'hours',header:t('Ish soati'),type:'num',total:'sum'}],rows:timeRows}];
    if(pay)sheets.unshift({name:t('Oylik'),title:`${t('Oylik hisoblash')} - ${month}`,subtitle:t(MONTH_STATUS[doc.status]),columns:[{key:'code',header:t('Tabel raqami')},{key:'name',header:t('F.I.Sh.'),width:28},{key:'department',header:t('Sex / bo‘lim')},...['hours','openingBalance','base','coefficient','extra','tripPay','gross','tax','deductions','net','cash','card','balance'].map(key=>({key,header:t(labels[key]),type:key==='hours'?'num':'money',total:'sum'}))],rows:payroll.filter(p=>!onlyPerson||p.employeeId===selected)});
    await exportSheets({filename:`Kadrlar_${month}${onlyPerson?'_'+person?.code:''}.xlsx`,sheets,company:user.factory?.name});
  }
  const labels={hours:'Ish soati',openingBalance:'Oldingi qarz',base:'Ishlangan vaqt haqi',coefficient:'Koeffitsiyent haqi',extra:'Qo‘shimcha haq',tripPay:'Xizmat safari haqi',gross:'Jami hisoblandi',tax:'Daromad solig‘i',deductions:'Boshqa ushlanmalar',net:'Sof hisoblangan',cash:'Naqd',card:'Bank kartasi',balance:'To‘lanishi lozim'};

  if(view==='employees'&&profileId)return <HrEmployeeProfile employeeId={profileId} refreshKey={employees.find(e=>e.id===profileId)?.version} onBack={()=>setProfileId('')} onEdit={employeeForm} onOpenArchive={()=>changeView('archive')} notify={notify} openForm={openForm}/>;
  if(['staff','reminders'].includes(view)&&['admin','rahbar','kadrlar'].includes(user?.role))return <HrStaff view={view} tabs={tabs} onViewChange={changeView} openForm={openForm} notify={notify} onOpenEmployee={id=>{changeView('employees');setProfileId(id);}}/>;
  if(view==='archive'&&['admin','rahbar','kadrlar'].includes(user?.role))return <HrDocuments notify={notify} openForm={openForm} onViewChange={changeView} tabs={tabs} onOpenEmployee={id=>{changeView('employees');setProfileId(id);}}/>;
  if(manage&&['overview','leaves','shifts','orders','documents','equipment'].includes(view))return <HrWorkforce view={view} onViewChange={changeView} notify={notify} openForm={openForm}/>;
  return <section className="sheet hr-module" aria-busy={loading}>
    <div className="hr-heading hr-no-print"><div><span className="hr-eyebrow">{t('Xodimdan to‘lovgacha')}</span><h2>{t('Kadrlar bo‘limi')}</h2><p className="hint">{t('Xodimlar → tabel → hisoblash → to‘lov → oy yopish')}</p></div><button className="btn" disabled={busy} onClick={refresh}><Icon name="moves"/>{t('Qayta yuklash')}</button></div>
    <HrDeadlineNotice onOpen={()=>changeView('reminders')}/>
    <HrNavigation view={view} onChange={changeView} tabs={tabs}/>
    {view!=='employees'&&<div className="hr-toolbar hr-no-print"><label>{t('Hisob oyi')}<input type="month" min="2000-01" max="2100-12" value={month} onChange={e=>{if(/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value)&&askLeave()){setDoc(null);setLoading(true);setMonth(e.target.value);setDirty(false);}}}/></label>
      {doc&&<span className={`hr-state ${doc.status}`}>{t(MONTH_STATUS[doc.status])}</span>}
      {manage&&!loading&&!doc&&!error&&<button className="btn primary" onClick={newMonth}>{t('Hisob oyini ochish')}</button>}
      {manage&&editable&&<button className="btn" onClick={settings}>{t('Oy sozlamalari')}</button>}
      {months.length>0&&<label>{t('Saqlangan oylar')}<select value={months.some(m=>m.month===month)?month:''} onChange={e=>{if(e.target.value&&e.target.value!==month&&askLeave()){setDoc(null);setLoading(true);setMonth(e.target.value);setDirty(false);}}}><option value="">{t('Tanlang')}</option>{months.map(m=><option key={m.month} value={m.month}>{m.month} · {t(MONTH_STATUS[m.status])}</option>)}</select></label>}
    </div>}
    {error&&<p role="alert" className="err">{t(error)}</p>}
    {loading?<div className="loading">{t("Ma'lumotlar yuklanmoqda…")}</div>:<div role="tabpanel" id="hr-panel" aria-label={t(tabs.find(([id])=>id===view)?.[1]||'Kadrlar bo‘limi')}>
      {view==='employees'&&<>
        {employeeAdmin&&<HrEmployeeImport notify={notify} onDone={load}/>}

        <div className="hr-list-intro"><div><span className="hr-eyebrow">{t('Xodimlar ro‘yxati')}</span><h3>{t('Har bir xodimning ma’lumoti bir joyda')}</h3><p>{t('Kabinet uchun Ko‘rish tugmasini bosing. Shartnoma, buyruq va shaxsiy delo shu yerda.')}</p></div><div className="hr-list-total"><strong>{employees.filter(e=>!e.endDate||e.endDate>today()).length}</strong><span>{t('faol xodim')}</span></div></div>
        <div className="hr-list-guide"><Icon name="inv" size={21}/><p><strong>{t('Yangi xodim olasizmi?')}</strong> {t('Yangi xodim → Ma’lumotlar → Shartnoma → Qabul buyrug‘i')}</p></div>
        <div className="hr-toolbar hr-no-print">{['admin','rahbar','kadrlar'].includes(user?.role)&&<button className="btn" onClick={()=>changeView('archive')}><Icon name="acct"/>{t('Hujjatlar markazi')}</button>}<input type="search" aria-label={t('Xodim qidirish')} placeholder={t('Xodim qidirish')} value={query} onChange={e=>setQuery(e.target.value)}/>{manage&&<button className="btn primary" onClick={()=>employeeForm(null)}><Icon name="plus"/>{t('Yangi xodim')}</button>}</div>
        <div className="hr-toolbar hr-no-print"><label>{t('Bo‘lim bo‘yicha')}<select value={departmentFilter} onChange={e=>setDepartmentFilter(e.target.value)}><option value="">{t('Barcha bo‘limlar')}</option><option value="__none">{t('Bo‘limsiz')}</option>{Array.from(new Set([...departments.map(d=>d.name),...employees.map(e=>e.department)].filter(Boolean))).sort().map(n=><option key={n} value={n}>{n}</option>)}</select></label>{employeeAdmin&&<button className="btn" disabled={busy} onClick={()=>departmentForm()}><Icon name="plus"/>{t('Yangi bo‘lim')}</button>}{employeeAdmin&&<button className="btn" disabled={busy||!employees.length} onClick={assignDepartment}>{t('Bo‘limga biriktirish')}</button>}</div>
        {employeeAdmin&&<details className="hr-card hr-no-print"><summary>{t('Bo‘limlarni boshqarish')} · {departments.length}</summary><div className="tbl-wrap"><table><thead><tr><th>{t('Bo‘lim')}</th><th>{t('Xodimlar')}</th><th>{t('Amallar')}</th></tr></thead><tbody>{departments.map(d=><tr key={d.id}><td>{d.name}</td><td>{d.employeeCount}</td><td><div className="acts"><button className="btn sm" disabled={busy} onClick={()=>departmentForm(d)}>{t('Tahrirlash')}</button><button className="btn sm" disabled={busy||d.employeeCount>0} onClick={()=>{if(window.confirm(d.name+' — '+t('Bo‘lim o‘chirilsinmi?')))run(async()=>{await api('/hr/departments/'+d.id,{method:'DELETE',body:{version:d.version}});if(departmentFilter===d.name)setDepartmentFilter('');await load();});}}>{t('O‘chirish')}</button></div></td></tr>)}</tbody></table></div>{!departments.length&&<p className="hint">{t('Avval bo‘lim yarating, keyin xodim kartochkasida bo‘limni tanlang.')}</p>}</details>}
        <div className="tbl-wrap"><table><thead><tr>{['Tabel raqami','F.I.Sh.','Lavozim','Sex / bo‘lim','Ishga kirish sanasi','Holat','Amallar'].map(x=><th key={x}>{t(x)}</th>)}</tr></thead><tbody>{visible.map(e=><tr key={e.id}><td>{e.code}</td><td><strong>{e.name}</strong>{manage&&e.phone&&<div className="hint">{e.phone}</div>}</td><td>{e.position}</td><td>{e.department}</td><td>{e.hireDate}</td><td><span className={`hr-state ${e.endDate&&e.endDate<=today()?'personnel-inactive':'personnel-active'}`}>{t(!e.hireDate?'Ma’lumotlar to‘ldirilmagan':e.endDate&&e.endDate<=today()?'Ishdan chiqqan':'Faol')}</span></td><td className="hr-no-print"><div className="acts">{['admin','rahbar','kadrlar'].includes(user?.role)&&<button className="btn sm primary" onClick={()=>setProfileId(e.id)}>{t('Ko‘rish')}</button>}{manage&&<button className="btn sm" onClick={()=>employeeForm(e)}>{t('Tahrirlash')}</button>}{employeeAdmin&&<button className="btn sm" disabled={busy} onClick={()=>deleteEmployee(e)}>{t('Butunlay o‘chirish')}</button>}<button className="btn sm" onClick={()=>{choose(e.id);changeView('time');}}>{t('Tabel')}</button>{pay&&<button className="btn sm" onClick={()=>showRates(e)}>{t('Maosh tarixi')}</button>}</div></td></tr>)}</tbody></table></div>
        {!visible.length&&<div className="empty">{t('Xodimlar hali kiritilmagan')}</div>}
        {manage&&employee&&<div className="hr-card"><h3>{employee.name}</h3><p>{employee.position} · {employee.department}</p><p className="hint">{employee.notes}</p>{employee.endDate&&<p>{t('Oxirgi ish kuni')}: {employee.endDate}</p>}</div>}
        {pay&&rates&&employee&&<div className="hr-card"><div className="hr-heading"><h3>{t('Maosh tarixi')} · {employee.name}</h3><button className="btn primary" onClick={()=>rateForm(employee)}>{t('Maosh belgilash')}</button></div><p className="hint">{t('Har bir maosh o‘z sanasidan amal qiladi. Tasdiqlangan davr o‘zgarmaydi.')}</p><div className="tbl-wrap"><table><thead><tr>{['Amal qilish sanasi','Lavozim maoshi','Koeffitsiyent haqi','Razryad','Sabab','Amallar'].map(x=><th key={x}>{t(x)}</th>)}</tr></thead><tbody>{rates.map(r=><tr key={r.id}><td>{r.effectiveDate}</td><td>{fmtN(r.salary,2)}</td><td>{fmtN(r.coefficient,2)}</td><td>{r.grade}</td><td>{r.reason}</td><td><button className="btn sm" disabled={months.some(m=>m.status!=='draft'&&m.month>=r.effectiveDate.slice(0,7))} onClick={()=>rateForm(employee,r)}>{t('Tahrirlash')}</button></td></tr>)}</tbody></table></div>{!rates.length&&<p>{t('Maosh belgilanmagan')}</p>}</div>}
      </>}
      {view!=='employees'&&!doc&&!error&&<div className="empty"><h3>{t('Bu oy hali ochilmagan')}</h3><p>{t('Mas’ul xodim oy normasini tekshirib, hisob oyini ochadi.')}</p></div>}
      {doc&&view==='time'&&<>
        <div className="hr-toolbar"><button className="btn" disabled={busy||loading||dirty||!!error} onClick={()=>run(()=>exportTimesheet({month,employees:eligible,doc,company:user.factory?.name,t}))}><Icon name="download"/>{t('Oylik tabel')} · Excel</button><span className="hint">{t('A4 · Albom · Excel orqali chop etish')}</span></div>
        <div className='hr-toolbar'><label>{t('Yangi yozuvlar rejimi')}<select value={entryShiftCount} onChange={e=>setEntryShiftCount(+e.target.value)}><option value='1'>{t('1 smena')}</option><option value='2'>{t('2 smena')}</option></select></label><span className='hint'>{t('Har bir kun uchun smenalar soni alohida tanlanadi. Ikki smenaning soatlarini alohida kiriting; jami avtomatik hisoblanadi.')}</span></div>
        <div className='hr-view-switch'><button className={`btn ${timeMode==='list'?'primary':''}`} onClick={()=>{if(askLeave()){setTimeMode('list');setListEdits({});setDirty(false);setDays(doc.attendance[selected]||{});}}}>{t('Kunlik ro‘yxat')}</button><button className={`btn ${timeMode==='calendar'?'primary':''}`} onClick={()=>{if(askLeave()){setTimeMode('calendar');setListEdits({});setDirty(false);}}}>{t('Oylik kalendar')}</button></div>
        {timeMode==='list'&&<>
          <div className="hr-toolbar"><button className="btn" disabled={busy} onClick={()=>{if(!askLeave())return;const date=today();setListEdits({});setDirty(false);setListDay(+date.slice(8));if(month!==date.slice(0,7)){setDoc(null);setLoading(true);setMonth(date.slice(0,7));}}}>{t('Bugun')}</button><label>{t('Sana')}<select aria-label={t('Sana')} value={listDay} disabled={busy} onChange={e=>{if(askLeave()){setListDay(+e.target.value);setListEdits({});setDirty(false);}}}>{dayList.map(d=><option key={d} value={d}>{String(d).padStart(2,'0')}.{month.slice(5)}.{month.slice(0,4)}</option>)}</select></label><button className="btn primary" disabled={!editable||!dirty} onClick={()=>run(async()=>{let version=doc.version;for(const [id,value] of Object.entries(listEdits)){const updated={...doc.attendance[id]};if(value.status)updated[listDay]=value;else delete updated[listDay];const result=await api(`/hr/months/${month}/attendance/${id}`,{method:'PUT',body:{version,days:updated}});version=result.version;}await load();notify('Saqlandi');})}>{t('Tabelni saqlash')}</button><span className="hint">{t(dirty?'Saqlanmagan o‘zgarishlar':'Saqlangan')}</span></div>
          <p className="hint">{t('Sanani tanlang, har bir xodimning holati va ishlagan soatini belgilang.')}</p>
          <div className='tbl-wrap hr-daily'><table><thead><tr>{['Xodim','Sex / bo‘lim','Kunlik davomat va smenalar','Jami soat'].map(x=><th key={x}>{t(x)}</th>)}</tr></thead><tbody>{eligible.filter(e=>employed(e,`${month}-${String(listDay).padStart(2,'0')}`)).map(e=>{const v=listEdits[e.id]||doc.attendance[e.id]?.[listDay]||emptyAttendance(entryShiftCount);const update=(key,value)=>{setListEdits(prev=>({...prev,[e.id]:updateAttendance(v,key,value)}));setDirty(true);};return <tr key={e.id}><td><strong>{e.name}</strong><div className='hint'>{e.code} · {e.position}</div></td><td>{e.department||'—'}</td><td><HrAttendanceFields value={v} disabled={!editable} onChange={update} label={e.name}/></td><td>{v.hours||0}</td></tr>;})}</tbody></table></div>
          {!eligible.length&&<p className="empty">{t('Xodimlar hali kiritilmagan')}</p>}
        </>}
        {timeMode==='calendar'&&<>
        <div className="hr-toolbar hr-no-print"><label>{t('Xodim')}<select value={eligible.some(e=>e.id===selected)?selected:''} onChange={e=>choose(e.target.value)}><option value="">{t('Tanlang')}</option>{eligible.map(e=><option value={e.id} key={e.id}>{e.code} · {e.name}</option>)}</select></label><span className="hint">{t('Oy normasi')}: {doc.normHours} {t('soat')}</span></div>
        {employee&&eligible.some(e=>e.id===selected)?<>
          <div className="hr-toolbar hr-no-print"><button className="btn" disabled={!editable} onClick={fillSchedule}>{t(entryShiftCount===2?'Ish jadvalidan to‘ldirish (1-smena 8 soat)':'Ish jadvalidan to‘ldirish (8 soat)')}</button><button className="btn primary" disabled={!editable||!dirty} onClick={()=>run(async()=>{await api(`/hr/months/${month}/attendance/${selected}`,{method:'PUT',body:{version:doc.version,days:Object.fromEntries(Object.entries(days).filter(([,v])=>v.status))}});await load();notify('Saqlandi');})}><Icon name="save"/>{t(dirty?'Tabelni saqlash':'Saqlangan')}</button><span role="status">{t(dirty?'Saqlanmagan o‘zgarishlar':'Saqlangan')}</span></div>
          <p className="hint">{t('Jadvaldan to‘ldirish namuna hisoblanadi. Haqiqiy kelish-ketish va soatlarni tekshirib saqlang.')}</p>
          <div className="hr-time-totals" aria-live="polite"><strong>{t('Ish kuni')}: {Object.values(days).filter(d=>+d.hours>0).length}</strong><strong>{t('Ish soati')}: {fmtN(Object.values(days).reduce((s,d)=>s+(+d.hours||0),0),2)}</strong></div>
          <div className='hr-time-grid'>{dayList.map(d=>{const date=`${month}-${String(d).padStart(2,'0')}`,v=days[d]||emptyAttendance(entryShiftCount),disabled=!editable||!employed(employee,date);return <div key={d} className={`hr-time-day ${v.status||''}`}><strong>{d} <small>{t(['Ya','Du','Se','Ch','Pa','Ju','Sh'][new Date(date+'T00:00:00Z').getUTCDay()])}</small></strong><HrAttendanceFields value={v} disabled={disabled} label={String(d)} onChange={(key,value)=>changeDay(d,key,value)}/></div>;})}</div>
        </>:<p className="empty">{t('Tabel uchun xodimni tanlang')}</p>}
        </>}
      </>}
      {pay&&doc&&view==='payroll'&&<>
        <div className="hr-summary">{['gross','tax','cash','card','balance'].map(k=><div className="hr-card" key={k}><span>{t(labels[k])}</span><strong>{fmtN(sum(payroll,k),2)}</strong></div>)}</div>
        <p className="hint">{t('Ish haqi = lavozim maoshi ÷ oy normasi × ishlangan soat. Koeffitsiyent haqi ham soatga mutanosib.')}</p>
        <p className="hint">{t('Manfiy qoldiq xodimga ortiqcha to‘langan avansni bildiradi. U keyingi oyga ham o‘tadi.')}</p>
        <p className="hint">{t('Ta’til, kasallik, tungi va ortiqcha ish uchun alohida avtomatik ustama hisoblanmaydi. Tegishli summalarni buxgalter tekshirib qo‘shimcha haqda kiritadi.')}</p>
        <div className="hr-toolbar hr-no-print"><span>{t('Oy normasi')}: {doc.normHours} · {t('Daromad solig‘i')}: {doc.taxRate}%</span><button className="btn" disabled={busy||!!error} onClick={()=>run(()=>exportReport())}>Excel</button>
          {doc.status==='draft'&&<button className="btn primary" disabled={busy||!!error||!doc.previousClosed||!payroll.length} onClick={()=>{if(window.confirm(t('Hisob tekshirildimi? Tasdiqlangach tabel va oylik tahrirlanmaydi.')))run(async()=>{await api(`/hr/months/${month}/approve`,{method:'POST',body:{version:doc.version}});await load();});}}>{t('Oylikni tasdiqlash')}</button>}
          {doc.status==='approved'&&<button className="btn primary" disabled={busy||!!error} onClick={()=>{if(window.confirm(t('Oy yopilgach to‘lovlar o‘zgarmaydi, qoldiq keyingi oyga o‘tadi. Davom etasizmi?')))run(async()=>{await api(`/hr/months/${month}/close`,{method:'POST',body:{version:doc.version}});await load();});}}>{t('Oyni yopish')}</button>}</div>
        {!doc.previousClosed&&<p className="notice">{t('Oldingi oy yopilmagan. Qarzni ko‘chirish va tasdiqlash uchun avval uni yoping.')}</p>}
        <div className="tbl-wrap"><table className="hr-pay-table"><thead><tr><th>{t('Xodim')}</th>{Object.keys(labels).map(k=><th className="n" key={k}>{t(labels[k])}</th>)}<th className="hr-no-print">{t('Amallar')}</th></tr></thead><tbody>{payroll.map(row=><tr key={row.employeeId}><td><strong>{row.name}</strong><div className="hint">{row.code} · {row.department}</div>{!!row.missingRates.length&&<span className="err">{t('Maosh belgilanmagan')}</span>}{row.hours>doc.normHours&&<span className="hint">{t('Soat normadan yuqori')}</span>}</td>{Object.keys(labels).map(k=><td className={`n ${k==='balance'?'strong':''}`} key={k}>{fmtN(row[k],2)}</td>)}<td className="hr-no-print"><div className="acts"><button className="btn sm" disabled={!editable} onClick={()=>adjustment(row)}>{t('Qo‘shimchalar')}</button><button className="btn sm" onClick={()=>{choose(row.employeeId);changeView('reports');}}>{t('Hisob varaqasi')}</button></div></td></tr>)}</tbody></table></div>
      </>}
      {pay&&doc&&view==='payments'&&<>
        <div className="hr-toolbar hr-no-print"><button className="btn primary" disabled={doc.status==='closed'||busy||!payroll.length||!!error} onClick={paymentForm}>{t('To‘lov yozish')}</button><p className="hint">{t('To‘lov oyning hisobiga yoziladi. Sana pul berilgan haqiqiy sanadir.')}</p></div>
        <div className="tbl-wrap"><table><thead><tr>{['Sana','Xodim','To‘lov maqsadi','To‘lov usuli','Summa','Izoh','Holat','Amallar'].map(x=><th key={x}>{t(x)}</th>)}</tr></thead><tbody>{doc.payments.map(p=><tr key={p.id} className={p.voidedAt?'hr-void':''}><td>{p.date}</td><td>{payroll.find(r=>r.employeeId===p.employeeId)?.name||employees.find(e=>e.id===p.employeeId)?.name}</td><td>{t(p.kind==='advance'?'Avans':'Oylik')}</td><td>{t(p.method==='cash'?'Naqd':'Bank kartasi')}</td><td>{fmtN(p.amount,2)}</td><td>{p.note}{p.voidReason&&<p>{p.voidReason}</p>}</td><td>{t(p.voidedAt?'Bekor qilingan':'Yozilgan')}</td><td className="hr-no-print">{!p.voidedAt&&doc.status!=='closed'&&<button className="btn sm" disabled={busy} onClick={()=>voidPayment(p)}>{t('Bekor qilish')}</button>}</td></tr>)}</tbody></table></div>{!doc.payments.length&&<p className="empty">{t('To‘lovlar hali kiritilmagan')}</p>}
      </>}
      {doc&&view==='reports'&&<>
        <div className="hr-toolbar hr-no-print"><button className="btn primary" disabled={busy||!!error||dirty} onClick={()=>run(()=>exportReport())}>{t('Tabel va vedomost')} · Excel</button>{pay&&<><label>{t('Xodim')}<select value={person?selected:''} onChange={e=>choose(e.target.value)}><option value="">{t('Tanlang')}</option>{payroll.map(p=><option key={p.employeeId} value={p.employeeId}>{p.name}</option>)}</select></label><button className="btn" disabled={!person||busy||!!error} onClick={()=>run(()=>exportReport(true))}>{t('Hisob varaqasi')} · Excel</button><button className="btn" disabled={!person||!!error} onClick={()=>window.print()}><Icon name="print"/>{t('Chop etish')}</button></>}</div>
        {pay&&person&&<article className="hr-payslip"><span className="hr-eyebrow">{user.factory?.name} · {month}</span><h2>{t('Hisob varaqasi')}</h2><h3>{person.name}</h3><p>{person.code} · {person.position} · {person.department}</p><p>{t(MONTH_STATUS[doc.status])} · {t('Oy normasi')}: {doc.normHours}</p><table><tbody>{Object.keys(labels).map(k=><tr key={k}><th>{t(labels[k])}</th><td className="n">{fmtN(person[k],2)}</td></tr>)}</tbody></table>{person.segments.map((s,i)=><p className="hint" key={i}>{s.effectiveDate} · {t('Lavozim maoshi')}: {fmtN(s.salary,2)} · {t('Koeffitsiyent haqi')}: {fmtN(s.coefficient,2)} · {s.hours} {t('soat')}</p>)}{person.note&&<p>{person.note}</p>}</article>}
        {!pay&&<p className="hint">{t('Tabelni Excel shaklida yuklab olishingiz mumkin. Oylik ma’lumotlari faqat vakolatli xodimlarga ko‘rinadi.')}</p>}
        {pay&&<div className="hr-no-print"><button className="btn" onClick={()=>run(async()=>setHistory(await api('/hr/events')))}>{t('O‘zgarishlar tarixi')}</button>{history&&<div className="tbl-wrap"><table><thead><tr><th>{t('Sana')}</th><th>{t('Mas’ul')}</th><th>{t('Amal')}</th></tr></thead><tbody>{history.map(h=><tr key={h.id}><td>{new Date(h.createdAt).toLocaleString('ru-RU',{timeZone:'Asia/Tashkent'})}</td><td>{h.actor.name}</td><td>{t(eventLabel[h.action]||h.action)}<div className="hint">{employees.find(e=>e.id===h.entityId)?.name||h.entityId}</div></td></tr>)}</tbody></table></div>}</div>}
      </>}
    </div>}
  </section>;
}
const eventLabel={'employee.delete':'Xodim o‘chirildi','department.create':'Bo‘lim yaratildi','department.update':'Bo‘lim o‘zgardi','department.delete':'Bo‘lim o‘chirildi','employee.create':'Xodim qo‘shildi','employee.update':'Xodim kartochkasi o‘zgardi','rate.create':'Maosh belgilandi','rate.update':'Maosh o‘zgartirildi','month.create':'Hisob oyi ochildi','month.settings':'Oy sozlamalari o‘zgardi','attendance.save':'Tabel saqlandi','payroll.adjust':'Oylik qo‘shimchalari o‘zgardi','payroll.approve':'Oylik tasdiqlandi','payroll.close':'Oy yopildi','payment.create':'To‘lov yozildi','payment.void':'To‘lov bekor qilindi','workforce.create':'Kadrlar yozuvi yaratildi','workforce.update':'Kadrlar yozuvi o‘zgardi','workforce.decision':'Kadrlar yozuvi holati o‘zgardi','workforce.apply':'Reja tabelga qo‘llandi','workforce.allowance':'Ta’til limiti o‘zgardi'};
