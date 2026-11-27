"use client";
import { show } from '@/lib/i18n';
import { matches } from '@/lib/script';
import { useEffect,useState,useRef } from 'react';
import { api } from '@/lib/api';
import { fmtN,fmtDate,today } from '@/lib/calc';
import { fileBase64,openPdf } from '@/lib/finance-files';
import { exportSheets } from '@/lib/xlsx-export';
import ContractReview from './ContractReview';
import OrderShipmentsDialog from './OrderShipmentsDialog';
import './finance-ledger.css';
import { Pipe, Legend, short } from './FinanceUi';
const cno=c=>String(c||'').replace(/^№\s*/,'').trim(),n=v=>fmtN(v,2),sum=(rows,k)=>rows.reduce((s,r)=>s+(+r[k]||0),0);
export default function FinanceOrders({data,notify,openForm,onImported}) {
 const [ledger,setLedger]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[version,setVersion]=useState(0),[query,setQuery]=useState(''),[selected,setSelected]=useState(''),[invoice,setInvoice]=useState(false),[shipment,setShipment]=useState(null),[exporting,setExporting]=useState(false);
 const [review,setReview]=useState(false);
 const refresh=()=>setVersion(v=>v+1);
 useEffect(()=>{let live=true;setLoading(true);setError('');api('/finance/orders').then(d=>{if(live){setLedger(d);setSelected(id=>d.orders.some(o=>o.id===id)?id:(d.orders[0]?.id||''));}}).catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[version]);
 // Sotuv narxi faqat buyurtmadan olinadi. Narx 0 bo'lsa tannarx ishlatilmaydi — «Sotuv narxi kiritilmagan» deb ko'rsatiladi.
 const price=it=>+it.price||0;
 const models=(ledger?.orders||[]).map(o=>{
  const invoices=ledger.invoices.filter(x=>x.orderId===o.id),receipts=ledger.receipts.filter(x=>x.orderId===o.id),active=invoices.filter(x=>!x.voidedAt);
  const lines=o.items.map(it=>{const unitPrice=price(it);return {...it,code:data.prods.get(it.productId)?.code||'O‘chirilgan mahsulot',unit:'шт',price:unitPrice,unpriced:!(unitPrice>0),amount:it.qty*unitPrice,shippedAmount:it.shipped*unitPrice,invoicedQty:active.reduce((s,x)=>s+x.items.filter(i=>i.productId===it.productId).reduce((a,i)=>a+i.qty,0),0)};});
  const total=sum(lines,'amount'),shippedAmount=sum(lines,'shippedAmount'),invoiced=sum(active,'amount'),received=sum(receipts.filter(x=>!x.voidedAt),'amount');
  // Bitta «Qarz / Avans»: faktura − tushum (musbat — qarz, manfiy — avans). Fakturasiz jo'natma alohida.
  return {...o,contract:ledger.contracts?.find(c=>c.orderId===o.id),lines,invoices,receipts,total,shippedAmount,invoiced,received,debt:invoiced-received,notInvoiced:Math.max(0,shippedAmount-invoiced),unpriced:lines.filter(l=>l.unpriced).length};
 });
 const filtered=models.filter(o=>matches([o.customer,o.contractNo,o.no],query));
 const order=filtered.find(o=>o.id===selected)||filtered[0];const totals=Object.fromEntries(['total','shippedAmount','invoiced','received','debt','notInvoiced'].map(k=>[k,sum(filtered,k)]));
 function receipt(){openForm(receiptForm({order,invoices:order.invoices,receipts:order.receipts,onSubmit:async body=>{await api('/finance/orders/'+order.id+'/receipts',{method:'POST',body});refresh();notify('To‘lov saqlandi');}}));}
 function voidEntry(kind,entry){openForm({title:kind==='invoices'?'Fakturani bekor qilish':'To‘lovni bekor qilish',fields:[{name:'reason',label:'Bekor qilish sababi',req:true,wide:true}],onSubmit:async v=>{await api('/finance/orders/'+order.id+'/'+kind+'/'+entry.id+'/void',{method:'POST',body:v});refresh();notify('Bekor qilindi');}});}
 async function excel(){setExporting(true);try{await exportSheets({filename:'Buyurtmalar_moliyasi_'+today()+'.xlsx',company:data.settings?.company,sheets:[{name:'Buyurtmalar',title:'Buyurtmalar moliyaviy holati',columns:[{key:'customer',header:'Buyurtmachi',width:28},{key:'contractNo',header:'Shartnoma',width:20},...[['total','Shartnoma summasi'],['shippedAmount','Jo‘natilgan summa'],['invoiced','Faktura summasi (QQS bilan)'],['received','Kelib tushgan'],['debt','Qarz (+) / Avans (−)'],['notInvoiced','Fakturasiz jo‘natma']].map(([key,header])=>({key,header,type:'money',total:'sum',width:24}))],rows:filtered},...(order?[{name:'Mahsulotlar',title:order.customer+' · '+order.contractNo,columns:[{key:'code',header:'Mahsulot',width:24},...lineColumns.map(([key,header])=>({key,header,type:key.includes('Amount')||key==='amount'||key==='price'?'money':'num',total:key==='price'?undefined:'sum',width:21}))],rows:order.lines}]:[])]});}catch(e){notify(e.message);}finally{setExporting(false);}}
 return <section className="sheet finance-module"><div className="finance-heading"><div><span className="finance-eyebrow">FINANSIVIY / BUYURTMALAR</span><h2>Buyurtma moliyasi</h2><p>Jo‘natish, faktura va tushumlarni har bir buyurtma bo‘yicha kuzating.</p></div><div className="acts"><button className="btn primary" onClick={()=>setReview(true)}>+ Shartnoma qo‘shish</button><button className="btn" disabled={loading} onClick={refresh}>Yangilash</button><button className="btn" disabled={loading||!!error||!filtered.length||exporting} onClick={excel}>Excel yuklash</button></div></div>
 {error&&<p className="err" role="alert">{error}</p>}{loading?<p className="loading">Moliyaviy ma’lumotlar yuklanmoqda…</p>:!error&&<><div className="finance-toolbar"><input type="search" placeholder="Buyurtmachi, shartnoma, buyurtma №…" aria-label="Buyurtma qidirish" value={query} onChange={e=>setQuery(e.target.value)}/><span className="muted">{filtered.length} ta buyurtma</span></div><div className="finance-kpis"><div><span>Shartnomalar summasi</span><strong>{n(totals.total)}</strong><small>so‘m</small></div><div><span>Jo‘natilgan mahsulot</span><strong>{n(totals.shippedAmount)}</strong><small>Faktura: {n(totals.invoiced)}</small></div><div className="is-green"><span>Kelib tushgan</span><strong>{n(totals.received)}</strong><small>avans va to‘lovlar</small></div><div className="is-amber"><span>{totals.debt<0?'Avans':'Qarz'}</span><strong>{n(Math.abs(totals.debt))}</strong><small>faktura − tushum · fakturasiz: {n(totals.notInvoiced)}</small></div></div>
 <div className="fo-grid" role="list" aria-label="Buyurtmalar">{filtered.map(o=>{const st=orderStatus(o);return <button type="button" role="listitem" key={o.id} className="fo-card" aria-pressed={order?.id===o.id} onClick={()=>{setSelected(o.id);setTimeout(()=>document.getElementById('fo-detail')?.scrollIntoView({behavior:'smooth',block:'start'}),50);}}>
  <div className="fo-head"><div><b>{show(o.customer)}</b><small>{o.contractNo?'№ '+cno(o.contractNo):'№'+o.no+' · Shartnomasiz'}</small></div><span className={'fl-tag '+st[0]}>{st[1]}</span></div>
  <div className="fo-total"><span>Shartnoma summasi</span><strong>{n(o.total)}</strong></div>
  <Pipe total={o.total} done={o.shippedAmount} paid={o.received}/>
  <div className="fo-nums"><div><span>Jo‘natildi</span><b>{short(o.shippedAmount)}</b></div><div><span>Faktura</span><b>{short(o.invoiced)}</b></div><div><span>To‘landi</span><b className="fl-plus">{short(o.received)}</b></div><div><span>{o.debt<0?'Avans':'Qarz'}</span><b className={o.debt>0?'fl-minus':''}>{short(Math.abs(o.debt))}</b></div></div>
  {o.unpriced>0&&<p className="fl-warn">Sotuv narxi kiritilmagan · {o.unpriced} ta mahsulot</p>}
 </button>;})}</div>{filtered.length>0&&<Legend/>}{!filtered.length&&<p className="empty">Buyurtmalar topilmadi.</p>}
 {order&&<article className="finance-detail" id="fo-detail"><div className="finance-heading"><div><span className="finance-eyebrow">{order.contractNo?'SHARTNOMA № '+cno(order.contractNo):'BUYURTMA №'+order.no}</span><h3>{show(order.customer)}</h3><p>{order.contractNo?'':'Shartnomasiz · '}{fmtDate(order.date)}</p></div><div className="acts">{order.contract&&<button className="btn" onClick={()=>openPdf('/finance/contracts/'+order.contract.id+'/pdf',order.contract.name).catch(e=>notify(e.message))}>Shartnoma PDF</button>}
 <select aria-label="Buyurtma holati" value={order.status} onChange={async e=>{try{await api('/finance/orders/'+order.id+'/status',{method:'PUT',body:{status:e.target.value}});refresh();await onImported?.();}catch(err){notify(err.message);}}}><option value="yangi">Yangi</option><option value="jarayonda">Jarayonda</option>{order.status==='tayyor'&&<option value="tayyor">Tayyor</option>}<option value="topshirildi">Yakunlangan</option><option value="bekor">Bekor qilingan</option></select>
 <button className="btn" onClick={()=>setInvoice(true)}>+ Faktura PDF</button><button className="btn primary" onClick={receipt}>+ To‘lov qabul qilish</button></div></div>
 <div className="finance-order-metrics">{order.contract&&<span>Asl shartnoma jami: <strong>{n(order.contract.originalTotal)}</strong></span>}<span>{order.debt<0?'Avans':'Qarz'}: <strong>{n(Math.abs(order.debt))}</strong></span><span>Fakturasiz jo‘natma: <strong>{n(order.notInvoiced)}</strong></span><span>Jo‘natildi: <strong>{fmtN(order.shipped)} / {fmtN(order.qty)} dona</strong></span></div>
 {order.unpriced>0&&<p className="fl-warn" role="alert">Sotuv narxi kiritilmagan: {order.lines.filter(l=>l.unpriced).map(l=>l.code).join(', ')}. Bu mahsulotlar summalarga kirmaydi (tannarx bilan hisoblanmaydi). Narxni «Buyurtmalar» bo‘limida kiriting.</p>}
 <div className="fo-items">{order.lines.map(l=><div className="fl-ord" key={l.productId}>
  <div className="l"><button className="linkbtn" style={{fontSize:14,fontWeight:700,color:'var(--ink)'}} onClick={()=>setShipment({order,item:l})}>{l.code} ↗</button><span className="fl-money">{l.unpriced?<span className="fl-tag sig">Sotuv narxi kiritilmagan</span>:n(l.amount)}</span></div>
  <div className="l sub"><span>Buyurtma {fmtN(l.qty)} · jo‘natildi {fmtN(l.shipped)} · qoldi {fmtN(l.left)} dona</span><span>Faktura qilingan {fmtN(l.invoicedQty)} · narx {l.unpriced?'—':n(l.price)}</span></div>
  <Pipe total={l.qty} done={l.shipped} paid={Math.min(l.invoicedQty,l.shipped)}/>
 </div>)}</div>
 <p className="hint">Buyurtma qoldig‘i = buyurtma − jo‘natilgan. Narx faqat buyurtmadan olinadi; narx kiritilmagan mahsulot summalarga kirmaydi.</p>
 <h3 className="finance-section-title">Fakturalar va PDF hujjatlar</h3><div className="fo-items">{order.invoices.map(x=>{const paid=sum(order.receipts.filter(p=>p.invoiceId===x.id&&!p.voidedAt),'amount'),late=!x.voidedAt&&x.dueDate&&x.dueDate<today()&&x.amount-paid>0;return <div className={'fl-ord'+(x.voidedAt?' finance-void':'')} key={x.id}>
  <div className="l"><b>Faktura № {x.number} · {fmtDate(x.date)}</b><span className="fl-money" style={{fontWeight:700}}>{n(x.amount)}</span></div>
  <div className="l sub"><span>QQSsiz {n(x.net??x.amount)} · QQS {n(x.vat||0)} · {fmtN(sum(x.items,'qty'))} dona</span><span>{x.voidedAt?<span className="fl-tag mut">Bekor qilingan</span>:x.amount-paid>0?<>Qoldiq {n(x.amount-paid)}{x.dueDate&&<> · muddat {fmtDate(x.dueDate)}</>} {late&&<span className="fl-tag bad">Muddati o‘tgan</span>}</>:<span className="fl-tag ok">To‘langan</span>}</span></div>
  {(x.voidedAt||x.note)&&<small className="fl-note">{x.voidedAt?'Sabab: '+x.voidReason:x.note}</small>}
  <div className="fl-acts"><button className="btn sm" onClick={()=>openPdf('/finance/invoices/'+x.id+'/pdf',x.name).catch(e=>notify(e.message))}>Ochish ↗</button><button className="btn sm" onClick={()=>openPdf('/finance/invoices/'+x.id+'/pdf',x.name,true).catch(e=>notify(e.message))}>Yuklash</button>{!x.voidedAt&&<button className="btn sm" onClick={()=>voidEntry('invoices',x)}>Bekor qilish</button>}</div>
 </div>;})}</div>{!order.invoices.length&&<p className="finance-empty">Faktura hali yuklanmagan. Jo‘natilgan mahsulotlarga faktura qo‘shing.</p>}
 <h3 className="finance-section-title">Kelib tushgan to‘lovlar</h3><div className="fo-items">{order.receipts.map(p=><div className={'fl-ord'+(p.voidedAt?' finance-void':'')} key={p.id}>
  <div className="l"><b>{fmtDate(p.date)} · {METHOD_LABEL[p.method]||'Bank'}</b><span className="fl-money fl-plus" style={{fontWeight:700}}>{n(p.amount)}</span></div>
  <div className="l sub"><span>{p.invoiceId?'Faktura № '+(order.invoices.find(i=>i.id===p.invoiceId)?.number||'—'):'Avans / umumiy to‘lov'}{p.docNumber&&' · hujjat № '+p.docNumber}{p.note&&' · '+p.note}</span><span>{p.voidedAt?<span className="fl-tag mut">Bekor qilingan</span>:<button className="btn sm" onClick={()=>voidEntry('receipts',p)}>Bekor qilish</button>}</span></div>
  {p.voidReason&&<small className="fl-note">Sabab: {p.voidReason}</small>}
 </div>)}</div>{!order.receipts.length&&<p className="finance-empty">To‘lov hali yozilmagan.</p>}<p className="hint">Fakturaga bog‘lanmagan avans umumiy qoldiqdan ayiriladi. Faktura qatorida faqat o‘sha fakturaga bog‘langan to‘lovlar ko‘rsatiladi. Manfiy qoldiq — oldindan yoki ortiqcha to‘lov.</p>
 </article>}</>}
 {review&&<ContractReview data={data} onClose={()=>setReview(false)} onSaved={async result=>{setReview(false);await onImported?.();setSelected(result.orderId||'');refresh();notify(result.orderId?'Buyurtma va shartnoma saqlandi':'Xarid shartnomasi ta’minotchi hisobiga saqlandi');}}/>}
 {invoice&&order&&<InvoiceDialog order={order} notify={notify} onClose={()=>setInvoice(false)} onSaved={()=>{setInvoice(false);refresh();}}/>}
 {shipment&&<OrderShipmentsDialog {...shipment} product={data.prods.get(shipment.item.productId)} onClose={()=>setShipment(null)} notify={notify}/>}
 </section>;
}
/** Buyurtma holati: muddati o'tgan faktura, qarz/fakturasiz jo'natma, avans yoki yopilgan */
function orderStatus(o){
 const late=o.invoices.some(x=>!x.voidedAt&&x.dueDate&&x.dueDate<today()&&x.amount-sum(o.receipts.filter(p=>p.invoiceId===x.id&&!p.voidedAt),'amount')>0.004);
 if(late)return ['bad','Muddati o‘tgan'];
 if(o.debt>0.004||o.notInvoiced>0.004)return ['sig','To‘lov kutilmoqda'];
 if(o.debt<-0.004)return ['acc','Avans'];
 if(!o.shippedAmount&&!o.received)return ['mut','Yangi'];
 return ['ok','Yopilgan'];
}
const lineColumns=[['qty','Buyurtma'],['shipped','Jo‘natildi'],['left','Buyurtma qoldig‘i'],['invoicedQty','Faktura qilingan'],['price','Dona narxi'],['amount','Jami summa'],['shippedAmount','Jo‘natilgan summa']];
export const METHOD_LABEL={bank:'Bank o‘tkazmasi',naqd:'Naqd',karta:'Karta'};
/** To'lov formasi (buyurtma yoki mijoz bo'yicha). Faktura tanlansa, summa uning qoldig'idan oshmasligi kerak — server ham tekshiradi. */
export function receiptForm({title='Buyurtmachidan to‘lov qabul qilish',invoices=[],receipts=[],extraFields=[],values={},onSubmit}){
 const requestId=crypto.randomUUID();
 const open=invoices.filter(x=>!x.voidedAt).map(x=>({...x,left:x.remaining??Math.round((x.amount-sum(receipts.filter(p=>p.invoiceId===x.id&&!p.voidedAt),'amount'))*100)/100})).filter(x=>x.left>0);
 return {title,values:{date:today(),method:'bank',invoiceId:'',...values},description:open.length?'Fakturaga bog‘langan to‘lov uning qoldig‘idan oshmasin. Ortig‘ini «Avans» qilib alohida kiriting.':'',
  fields:[...extraFields,{name:'date',label:'To‘lov sanasi',type:'date',req:true},{name:'method',label:'To‘lov turi',type:'select',options:Object.entries(METHOD_LABEL)},{name:'docNumber',label:'To‘lov topshiriqnomasi / chek №'},{name:'amount',label:'Kelib tushgan summa',type:'number',min:.01,step:.01,req:true,unit:'so‘m'},{name:'invoiceId',label:'Qaysi faktura uchun',type:'select',raw:true,wide:true,options:[['','Avans / umumiy to‘lov (faktura yo‘q)'],...open.map(x=>[x.id,'№ '+x.number+' · qoldiq '+n(x.left)+(x.dueDate?' · muddat '+fmtDate(x.dueDate):'')])]},{name:'note',label:'Izoh',wide:true}],
  onSubmit:async v=>{const inv=open.find(x=>x.id===v.invoiceId);if(inv&&v.amount>inv.left+.001)throw new Error('Summa faktura №'+inv.number+' qoldig‘idan ('+n(inv.left)+' so‘m) oshmasin. Ortig‘ini avans sifatida alohida kiriting');await onSubmit({...v,requestId});}};
}
/** QQS hisobi (serverdagi vatLine bilan bir xil) */
const vatOf=(qty,price,rate,inclusive)=>{const r2=x=>Math.round(x*100)/100;if(inclusive){const amount=r2(qty*price),vat=r2(amount*rate/(100+rate));return {net:r2(amount-vat),vat,amount};}const net=r2(qty*price),vat=r2(net*rate/100);return {net,vat,amount:r2(net+vat)};};
export function InvoiceDialog({order,notify,onClose,onSaved}) {
 const ref=useRef(null);const [number,setNumber]=useState(''),[date,setDate]=useState(today()),[dueDate,setDueDate]=useState(''),[note,setNote]=useState(''),[file,setFile]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [vatRate,setVatRate]=useState(12),[inclusive,setInclusive]=useState(false);
 const [items,setItems]=useState(()=>order.lines.map(l=>({...l,qty:Math.max(0,l.shipped-l.invoicedQty),available:Math.max(0,l.shipped-l.invoicedQty)})));const [requestId]=useState(()=>crypto.randomUUID());
 useEffect(()=>{ref.current?.showModal();},[]);
 const rows=items.map(it=>({...it,...vatOf(+it.qty||0,+it.price||0,+vatRate,inclusive)}));
 const total=k=>rows.filter(r=>+r.qty>0).reduce((s,r)=>s+r[k],0);
 const noPrice=rows.filter(r=>+r.qty>0&&!(+r.price>0));
 async function save(e){e.preventDefault();if(busy)return;if(noPrice.length){setError('Sotuv narxi kiritilmagan: '+noPrice.map(r=>r.code).join(', '));return;}setBusy(true);setError('');try{const contentBase64=await fileBase64(file);await api('/finance/orders/'+order.id+'/invoices',{method:'POST',body:{number,date,dueDate:dueDate||null,note,requestId,name:file.name,contentBase64,vatRate:+vatRate,priceIncludesVat:inclusive,items:items.filter(i=>+i.qty>0).map(i=>({productId:i.productId,qty:+i.qty,price:+i.price}))}});notify('Faktura va PDF saqlandi');onSaved();}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <dialog ref={ref} className="wide-dlg finance-dialog" onCancel={e=>{if(busy)e.preventDefault();}} onClose={onClose}><form onSubmit={save}><div className="finance-dialog-head"><div><span className="finance-eyebrow">SOTUV FAKTURASI</span><h2>{show(order.customer)}</h2><p>{order.contractNo?'Shartnoma № '+cno(order.contractNo):'Buyurtma №'+order.no+' · Shartnomasiz'}</p></div><button className="btn" type="button" disabled={busy} onClick={()=>ref.current.close()}>✕</button></div>
 <div className="form-grid"><label>Faktura raqami<input required maxLength={80} value={number} onChange={e=>setNumber(e.target.value)}/></label><label>Sana<input required type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label>To‘lov muddati<input type="date" min={date} value={dueDate} onChange={e=>setDueDate(e.target.value)}/></label>
 <label>QQS stavkasi<select value={vatRate} onChange={e=>setVatRate(e.target.value)}><option value={12}>12%</option><option value={0}>QQSsiz (0%)</option></select></label>
 <label className="span2 finance-detail-toggle"><input type="checkbox" checked={inclusive} onChange={e=>setInclusive(e.target.checked)}/> Narxga QQS kiritilgan (shartnoma narxi QQS bilan)</label>
 <label className="span2">Fakturaning asl PDF fayli · 8 MB gacha<input required type="file" accept="application/pdf,.pdf" onChange={e=>setFile(e.target.files[0]||null)}/></label><label className="span2">Izoh<input maxLength={1000} value={note} onChange={e=>setNote(e.target.value)}/></label></div>
 <p className="hint">Faktura soni jo‘natilgan va hali faktura qilinmagan miqdordan oshmaydi. PDFdagi QQSsiz summa, QQS va jami quyidagilar bilan mos bo‘lsin.</p>
 <div className="tbl-wrap"><table><thead><tr><th>Mahsulot</th><th>Mavjud</th><th>Soni</th><th>Narx</th><th className="n">QQSsiz</th><th className="n">QQS</th><th className="n">Jami</th></tr></thead><tbody>{rows.map((it,i)=><tr key={it.productId}><td>{it.code}{!(+it.price>0)&&<small className="pay-due">Sotuv narxi kiritilmagan</small>}</td><td>{fmtN(it.available)}</td><td><input aria-label={it.code+' faktura soni'} type="number" min={0} max={it.available} step="1" value={it.qty} onChange={e=>setItems(xs=>xs.map((x,j)=>i===j?{...x,qty:e.target.value}:x))}/></td><td><input aria-label={it.code+' dona narxi'} type="number" min={0} step=".01" value={it.price} onChange={e=>setItems(xs=>xs.map((x,j)=>i===j?{...x,price:e.target.value}:x))}/></td><td className="n">{n(it.net)}</td><td className="n">{n(it.vat)}</td><td className="n">{n(it.amount)}</td></tr>)}</tbody>
 <tfoot><tr><th colSpan={4}>Faktura jami</th><td className="n">{n(total('net'))}</td><td className="n">{n(total('vat'))}</td><td className="n">{n(total('amount'))}</td></tr></tfoot></table></div>
 {error&&<p role="alert" className="err">{error}</p>}<div className="finance-dialog-actions"><button type="button" className="btn" disabled={busy} onClick={()=>ref.current.close()}>Bekor qilish</button><button className="btn primary" disabled={busy||!items.some(i=>i.available>0)}>{busy?'Saqlanmoqda…':'Faktura va PDFni saqlash'}</button></div></form></dialog>;
}
