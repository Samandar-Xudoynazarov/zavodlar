"use client";
import { useEffect,useRef,useState } from 'react';
import { api } from '@/lib/api';
import { openPdf } from '@/lib/finance-files';
import { fmtN,fmtDate } from '@/lib/calc';
export default function OrderShipmentsDialog({order,item,product,onClose,notify}) {
 const ref=useRef(null);const [data,setData]=useState(null),[error,setError]=useState('');
 useEffect(()=>{ref.current?.showModal();let live=true;api(`/orders/${order.id}/products/${item.productId}/shipments`).then(d=>{if(live)setData(d);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[order.id,item.productId]);
 return <dialog ref={ref} className="wide-dlg finance-dialog" onClose={onClose} onCancel={onClose}><div className="finance-dialog-head"><div><span className="finance-eyebrow">BUYURTMA №{order.no} · {order.contractNo||'Shartnomasiz'}</span><h2>{product?.code||'Mahsulot'} — jo‘natish tarixi</h2><p>{order.customer}</p></div><button className="btn" onClick={()=>ref.current.close()} aria-label="Yopish">✕</button></div><div className="finance-kpis"><div><span>Buyurtma</span><strong>{fmtN(item.qty)} dona</strong></div><div><span>Jo‘natildi</span><strong>{fmtN(item.shipped)} dona</strong></div><div><span>Qoldi</span><strong>{fmtN(item.left)} dona</strong></div></div>
 {error&&<p className="err" role="alert">{error}</p>}{!data&&!error&&<p className="loading">Jo‘natishlar yuklanmoqda…</p>}
 {data&&<>{data.shippedBefore>0&&<p className="notice">Tizimdan oldin jo‘natilgan: {fmtN(data.shippedBefore)} dona. Sana, mashina va накладная tafsilotlari tizimga kiritilmagan.</p>}
 <div className="tbl-wrap"><table><thead><tr>{['Sana','Miqdor','Qayerga / qabul qiluvchi','Mashina','Накладная'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{data.shipments.map((s,i)=><tr key={i}><td>{fmtDate(s.date)}</td><td className="n"><strong>{fmtN(s.qty)}</strong></td><td>{s.customer||order.customer||'—'}</td><td>{s.vehicle||'Kiritilmagan'}</td><td>{s.dispatchId?<button className="linkbtn" onClick={()=>openPdf('/dispatch-documents/'+s.dispatchId+'/pdf').catch(e=>notify(e.message))}>№ {s.dispatchNo} · PDF ↗</button>:<span className="muted">{s.dispatchNo?('№ '+s.dispatchNo+' · '):''}PDF saqlanmagan</span>}</td></tr>)}</tbody></table></div>{!data.shipments.length&&<div className="empty">Bu mahsulot uchun tizimda jo‘natish yozuvi yo‘q.</div>}</>}
 </dialog>;
}
