"use client";
// Oy bo'yicha hisob-kitob: mijoz × oy — jo'natildi, faktura, to'lov, qarz. Eski oylarni tekshirib tuzatish uchun.
import { show } from '@/lib/i18n';
import { matches } from '@/lib/script';
import { useEffect,useRef,useState } from 'react';
import { api } from '@/lib/api';
import { fmt,today } from '@/lib/calc';
export default function SalesMonthly({onClose}) {
 const ref=useRef(null);
 const [from,setFrom]=useState('2025-01'),[to,setTo]=useState(()=>today().slice(0,7)),[q,setQ]=useState('');
 const [data,setData]=useState(null),[error,setError]=useState('');
 useEffect(()=>{ref.current?.showModal();},[]);
 useEffect(()=>{let live=true;setError('');api(`/finance/archive/monthly?from=${from}&to=${to}`).then(d=>{if(live)setData(d);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[from,to]);
 const s=q.trim().toLowerCase();
 const list=(data?.customers||[]).filter(c=>!s||matches(c.customer,s));
 return <dialog ref={ref} className="wide-dlg finance-dialog" onClose={onClose} onCancel={onClose}>
  <div className="finance-dialog-head"><div><span className="finance-eyebrow">SOTUV · OY OXIRI</span><h2>Oy bo‘yicha hisob-kitob</h2><p>Kunlik hisobot va eski jo‘natmalar, fakturalar va to‘lovlar asosida.</p></div><button className="btn" onClick={()=>ref.current.close()} aria-label="Yopish">✕</button></div>
  <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'end'}}>
   <label className="field">Oydan<input type="month" min="2025-01" value={from} onChange={e=>e.target.value&&setFrom(e.target.value)}/></label>
   <label className="field">Oygacha<input type="month" min="2025-01" value={to} onChange={e=>e.target.value&&setTo(e.target.value)}/></label>
   <label className="field" style={{minWidth:220}}>Mijoz<input type="search" value={q} onChange={e=>setQ(e.target.value)} placeholder="Qidirish"/></label>
  </div>
  {error&&<p className="err" role="alert">{error}</p>}{!data&&!error&&<p className="loading">Yuklanmoqda…</p>}
  {data?.undatedShippedBefore>0&&<p className="notice">Buyurtmalarda sanasiz «oldin jo‘natilgan» {fmt(data.undatedShippedBefore)} dona bor. Ular bu jadvalga kirmaydi. Ularni eski jo‘natma sifatida sanasi va накладнаяsi bilan kiritsangiz, shu yerda ko‘rinadi.</p>}
  {data&&!list.length&&<div className="empty">Bu oraliqda ma’lumot yo‘q.</div>}
  {list.map(c=><div key={c.customer} style={{marginTop:12}}><h3>{show(c.customer)}</h3><div className="tbl-wrap"><table><thead><tr>{['Oy','Jo‘natildi, dona','Jo‘natildi, so‘m','Faktura, so‘m','To‘lov, so‘m','Fakturasiz jo‘natma','Qarz (oy oxiri)'].map(h=><th key={h}>{h}</th>)}</tr></thead>
   <tbody>{c.months.map(m=><tr key={m.month}><td>{m.month}</td><td className="n">{fmt(m.shippedQty)}{m.unpricedQty>0&&<span className="muted" title="Buyurtmada narx kiritilmagan"> ({fmt(m.unpricedQty)} narxsiz)</span>}</td><td className="n">{fmt(m.shipped)}</td><td className="n">{fmt(m.invoiced)}</td><td className="n">{fmt(m.paid)}</td><td className="n">{m.notInvoiced>0?<strong>{fmt(m.notInvoiced)}</strong>:'—'}</td><td className="n"><strong>{fmt(m.debt)}</strong></td></tr>)}</tbody></table></div></div>)}
  <p className="hint">Qarz = shu oy oxirigacha yozilgan fakturalar − to‘lovlar (oraliqdan oldingi oylar ham hisobga olinadi). «Fakturasiz jo‘natma» = jo‘natilgan, lekin hali faktura yozilmagan summa. Mijozlarning boshlang‘ich qarzi va avansi moliya bo‘limida kiritilgach, shu hisobga qo‘shiladi.</p>
 </dialog>;
}
