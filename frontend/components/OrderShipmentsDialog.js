"use client";
import { show } from '@/lib/i18n';
import { useCallback,useEffect,useRef,useState } from 'react';
import { api } from '@/lib/api';
import { useUser } from '@/lib/role';
import { fileBase64,openPdf } from '@/lib/finance-files';
import { fmtN,fmtDate,today } from '@/lib/calc';
const FINANCE=['admin','rahbar','buxgalter'];
const ARCHIVE_FROM='2025-01-01';
const blank=()=>({requestId:crypto.randomUUID(),date:'',qty:'',dispatchNo:'',vehicle:'',receiver:'',note:'',file:null});
export default function OrderShipmentsDialog({order,item,product,onClose,notify,reload}) {
 const ref=useRef(null);const {user}=useUser();const canArchive=FINANCE.includes(user?.role);
 const [data,setData]=useState(null),[error,setError]=useState(''),[form,setForm]=useState(null),[busy,setBusy]=useState(false),[formError,setFormError]=useState('');
 const load=useCallback(()=>api(`/orders/${order.id}/products/${item.productId}/shipments`).then(setData).catch(e=>setError(e.message)),[order.id,item.productId]);
 useEffect(()=>{ref.current?.showModal();load();},[load]);
 const after=async msg=>{await load();await reload?.();notify(msg);};
 async function add(e) {
  e.preventDefault();setFormError('');setBusy(true);
  try {
   const body={requestId:form.requestId,productId:item.productId,date:form.date,qty:Number(form.qty),dispatchNo:form.dispatchNo,vehicle:form.vehicle,receiver:form.receiver,note:form.note};
   if(form.file){body.contentBase64=await fileBase64(form.file);body.name=form.file.name;}
   await api('/finance/archive/orders/'+order.id+'/legacy-shipments',{method:'POST',body});
   setForm(null);await after('Eski jo‘natma saqlandi');
  } catch(err){setFormError(err.message);} finally{setBusy(false);}
 }
 async function attach(s,file) {
  if(!file)return;
  try{await api('/finance/archive/legacy-shipments/'+s.id+'/pdf',{method:'POST',body:{name:file.name,contentBase64:await fileBase64(file)}});await after('Накладная biriktirildi');}catch(err){notify(err.message);}
 }
 async function voidIt(s) {
  const reason=window.prompt('Nega bekor qilinmoqda? (sabab majburiy)');if(!reason?.trim())return;
  try{await api('/finance/archive/legacy-shipments/'+s.id+'/void',{method:'POST',body:{reason}});await after('Bekor qilindi');}catch(err){notify(err.message);}
 }
 const set=k=>e=>setForm(f=>({...f,[k]:k==='file'?e.target.files?.[0]||null:e.target.value}));
 const legacy=data?.legacy||[];
 return <dialog ref={ref} className="wide-dlg finance-dialog" onClose={onClose} onCancel={onClose}><div className="finance-dialog-head"><div><span className="finance-eyebrow">BUYURTMA №{order.no} · {order.contractNo||'Shartnomasiz'}</span><h2>{product?.code||'Mahsulot'} — jo‘natish tarixi</h2><p>{show(order.customer)}</p></div><button className="btn" onClick={()=>ref.current.close()} aria-label="Yopish">✕</button></div><div className="finance-kpis"><div><span>Buyurtma</span><strong>{fmtN(item.qty)} dona</strong></div><div><span>Jo‘natildi</span><strong>{fmtN(item.shipped)} dona</strong></div><div><span>Qoldi</span><strong>{fmtN(item.left)} dona</strong></div></div>
 {error&&<p className="err" role="alert">{error}</p>}{!data&&!error&&<p className="loading">Jo‘natishlar yuklanmoqda…</p>}
 {data&&<>{data.shippedBefore>0&&<p className="notice">Tizimdan oldin jo‘natilgan (sanasiz): {fmtN(data.shippedBefore)} dona. Shu jo‘natmalarni pastda накладнаяsi bilan kiritsangiz, buyurtmadagi «oldin jo‘natilgan» sonini shuncha kamaytiring, aks holda ikki marta hisoblanadi.</p>}
 <div className="tbl-wrap"><table><thead><tr>{['Sana','Miqdor','Qayerga / qabul qiluvchi','Mashina','Накладная'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{data.shipments.map((s,i)=><tr key={i}><td>{fmtDate(s.date)}</td><td className="n"><strong>{fmtN(s.qty)}</strong></td><td>{s.customer||order.customer||'—'}</td><td>{s.vehicle||'Kiritilmagan'}</td><td>{s.dispatchId?<button className="linkbtn" onClick={()=>openPdf('/dispatch-documents/'+s.dispatchId+'/pdf').catch(e=>notify(e.message))}>№ {s.dispatchNo} · PDF ↗</button>:<span className="muted">{s.dispatchNo?('№ '+s.dispatchNo+' · '):''}PDF saqlanmagan</span>}</td></tr>)}</tbody></table></div>{!data.shipments.length&&<div className="empty">Bu mahsulot uchun kunlik hisobotda jo‘natish yozuvi yo‘q.</div>}
 <div className="bar" style={{marginTop:16}}><div className="l"><h3>Eski jo‘natmalar (tizimdan oldingi)</h3></div><div className="r">{canArchive&&!form&&<button className="btn primary" onClick={()=>{setForm(blank());setFormError('');}}>+ Eski jo‘natma qo‘shish</button>}</div></div>
 <p className="hint">Omborga va kunlik hisobotga ta’sir qilmaydi, faqat buyurtmaning «jo‘natildi» soniga qo‘shiladi.</p>
 {form&&<form onSubmit={add} className="finance-form" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:8,alignItems:'end'}}>
  <label className="field">Sana *<input type="date" required min={ARCHIVE_FROM} max={today()} value={form.date} onChange={set('date')}/></label>
  <label className="field">Soni (dona) *<input type="number" required min="0.001" step="any" value={form.qty} onChange={set('qty')}/></label>
  <label className="field">Накладная №<input value={form.dispatchNo} maxLength={80} onChange={set('dispatchNo')}/></label>
  <label className="field">Mashina<input value={form.vehicle} maxLength={40} onChange={set('vehicle')}/></label>
  <label className="field">Qabul qiluvchi / obyekt<input value={form.receiver} maxLength={160} onChange={set('receiver')}/></label>
  <label className="field">Izoh<input value={form.note} maxLength={1000} onChange={set('note')}/></label>
  <label className="field">Накладная PDF (8 MB gacha)<input type="file" accept="application/pdf" onChange={set('file')}/></label>
  <div style={{display:'flex',gap:8}}><button className="btn primary" disabled={busy}>{busy?'Saqlanmoqda…':'Saqlash'}</button><button type="button" className="btn" disabled={busy} onClick={()=>setForm(null)}>Bekor</button></div>
  {formError&&<p className="err" role="alert" style={{gridColumn:'1/-1'}}>{formError}</p>}
 </form>}
 {legacy.length>0&&<div className="tbl-wrap"><table><thead><tr>{['Sana','Miqdor','Qabul qiluvchi','Mashina','Накладная','Izoh',''].map((h,i)=><th key={i}>{h}</th>)}</tr></thead><tbody>{legacy.map(s=><tr key={s.id} className={s.voidedAt?'muted':''}><td>{fmtDate(s.date)}</td><td className="n">{s.voidedAt?<s>{fmtN(s.qty)}</s>:<strong>{fmtN(s.qty)}</strong>}</td><td>{s.receiver||'—'}</td><td>{s.vehicle||'—'}</td>
  <td>{s.sizeBytes>0?<button className="linkbtn" onClick={()=>openPdf('/finance/archive/legacy-shipments/'+s.id+'/pdf',s.name).catch(e=>notify(e.message))}>{s.dispatchNo?'№ '+s.dispatchNo+' · ':''}PDF ↗</button>:<span className="muted">{s.dispatchNo?'№ '+s.dispatchNo+' · ':''}PDF yo‘q</span>}
  {canArchive&&!s.voidedAt&&s.sizeBytes===0&&<label className="linkbtn" style={{marginLeft:8,cursor:'pointer'}}>PDF biriktirish<input type="file" accept="application/pdf" hidden onChange={e=>attach(s,e.target.files?.[0])}/></label>}</td>
  <td>{s.voidedAt?<span className="muted">Bekor qilingan: {s.voidReason}</span>:s.note}</td>
  <td>{canArchive&&!s.voidedAt&&<button className="linkbtn" onClick={()=>voidIt(s)}>Bekor qilish</button>}</td></tr>)}</tbody></table></div>}
 {!legacy.length&&!form&&<div className="empty">Eski jo‘natma kiritilmagan.</div>}
 </>}
 </dialog>;
}
