"use client";
import { show } from "@/lib/i18n";
import { matches } from "@/lib/script";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { today, fmtDate, fmtN } from "@/lib/calc";
import { useT } from "@/lib/i18n";
import { exportSheets } from "@/lib/xlsx-export";
import Icon from "./Icon";
import ContractReview from "./ContractReview";
import SupplierMaterials from "./SupplierMaterials";
import "./supplier-settlements.css";

const base = "/finance/supplier-settlements";
const kinds = {invoice:"Faktura",payment:"To‘lov",opening_debt:"Boshlang‘ich qarz",opening_advance:"Boshlang‘ich avans"};
const isDebt = row => row.kind === "invoice" || row.kind === "opening_debt";
const signed = row => isDebt(row) ? row.amount : -row.amount;
const sum = (items, fn) => items.reduce((n,item)=>n+Math.round(fn(item)*100),0)/100;
const display = n => fmtN(n,2);
const rowName = (row,t) => [t(kinds[row.kind]),row.number].filter(Boolean).join(" № ");

function Metric({label,value,tone,icon,t}) {
  return <div className={"settle-metric "+tone}><div><Icon name={icon} size={18}/>{label}</div>
    <strong>{display(value)} <small>{t("so‘m")}</small></strong></div>;
}

function Statement({ledger, company, supplier, notify, t}) {
  // Istalgan davr: oy, chorak, yil yoki o'zingiz tanlagan sanalar
  const [from,setFrom]=useState(()=>today().slice(0,7)+"-01"),[to,setTo]=useState(()=>today());
  const [busy,setBusy]=useState(false);
  const y=today().slice(0,4),m=+today().slice(5,7),q=String(Math.floor((m-1)/3)*3+1).padStart(2,"0");
  const presets=[["Bu oy",today().slice(0,7)+"-01",today()],["Shu chorak",y+"-"+q+"-01",today()],["Shu yil",y+"-01-01",today()],["O‘tgan yil",(+y-1)+"-01-01",(+y-1)+"-12-31"]];
  const beginning=ledger.find(r=>r.kind.startsWith("opening"));
  const tooEarly=!from||!to||from>to||(beginning && to<beginning.date);
  const start=beginning && beginning.date>from ? beginning.date : from;
  const initial=sum(ledger.filter(r=>r.kind.startsWith("opening") || r.date<start),signed);
  const entries=ledger.filter(r=>!r.kind.startsWith("opening") && r.date>=start && r.date<=to);
  const closing=(Math.round(sum(entries,signed)*100)+Math.round(initial*100))/100;
  const balance=n=>display(Math.abs(n))+" "+t("so‘m")+(n?" · "+t(n>0?"Qarz":"Avans"):"");
  async function download(){
    setBusy(true);
    try {
      await exportSheets({filename:"Solishtirma_"+from+"_"+to+".xlsx",company,sheets:[{
        name:t("Hisob-kitob"),title:t("Solishtirma dalolatnoma"),subtitle:supplier+" · "+fmtDate(start)+" – "+fmtDate(to),
        columns:[{key:"date",header:t("Sana"),width:16},{key:"doc",header:t("Hujjat"),width:36},
          {key:"bill",header:t("Qarz oshishi"),width:22,type:"num"},{key:"pay",header:t("Qarz kamayishi"),width:22,type:"num"}],
        rows:[{date:start,doc:t("Boshlang‘ich qoldiq"),bill:Math.max(initial,0),pay:Math.max(-initial,0)},
          ...entries.map(r=>({date:r.date,doc:rowName(r,t),bill:isDebt(r)?r.amount:null,pay:isDebt(r)?null:r.amount})),
          {doc:t("Yakuniy qoldiq"),bill:Math.max(closing,0),pay:Math.max(-closing,0),_style:"bold"}],
        notes:[company+" ____________________",supplier+" ____________________"]
      }]});
    } catch(e){notify(e.message);} finally{setBusy(false);}
  }
  return <section className="settle-statement"><div className="finance-toolbar">{presets.map(([l,a,b])=><button key={l} className="btn sm" aria-pressed={from===a&&to===b} onClick={()=>{setFrom(a);setTo(b);}}>{t(l)}</button>)}
    <label>{t("Boshlanishi")}<input type="date" value={from} max={to} onChange={e=>e.target.value&&setFrom(e.target.value)}/></label>
    <label>{t("Oxiri")}<input type="date" value={to} min={from} onChange={e=>e.target.value&&setTo(e.target.value)}/></label>
    <button className="btn" disabled={busy||tooEarly} onClick={download}><Icon name="download" size={16}/>{t("Dalolatnomani Excelga yuklash")}</button></div>
    {tooEarly?<p className="empty">{t("Bu davr uchun boshlang‘ich qoldiq kiritilmagan yoki sanalar noto‘g‘ri.")}</p>:<>
      <p>{fmtDate(start)} · {t("Boshlang‘ich qoldiq")} <strong>{balance(initial)}</strong></p>
      <div className="tbl-wrap"><table><thead><tr>{["Sana","Hujjat","Qarz oshishi","Qarz kamayishi"].map(k=><th key={k}>{t(k)}</th>)}</tr></thead>
      <tbody>{entries.map(r=><tr key={r.id}><td>{fmtDate(r.date)}</td><td>{rowName(r,t)}</td>
        <td className="n">{isDebt(r)?display(r.amount):"—"}</td><td className="n">{!isDebt(r)?display(r.amount):"—"}</td></tr>)}</tbody></table></div>
      {!entries.length&&<p>{t("Bu davrda harakat yo‘q.")}</p>}<p>{t("Yakuniy qoldiq")} <strong>{balance(closing)}</strong></p></>}
  </section>;
}

export default function SupplierSettlements({company,notify,openForm,factoryData}) {
  const t=useT();
  const [review,setReview]=useState(false);
  const [party,setParty]=useState(""),[query,setQuery]=useState(""),[view,setView]=useState("documents");
  const [result,setResult]=useState(null),[error,setError]=useState(""),[revision,reload]=useState(0);
  useEffect(()=>{
    let live=true;
    setResult(null);setError("");
    api(party?base+"/"+party:base).then(value=>{if(live)setResult({party,revision,value});})
      .catch(e=>{if(live)setError(e.message);});
    return ()=>{live=false;};
  },[party,revision]);
  const data=result?.party===party && result?.revision===revision ? result.value : null;
  const ledger=data?.ledger||[], allocations=data?.allocations||[];
  const debts=ledger.filter(isDebt), credits=ledger.filter(r=>!isDebt(r));
  const unpaid=debts.filter(r=>r.remaining>0);
  const refresh=()=>reload(x=>x+1);
  function select(id){setParty(id);setView("documents");setError("");}
  function form(title,route,fields,values={},fixed={},description=""){
    const requestId=crypto.randomUUID();
    openForm({title,fields,values,description,submitLabel:"Saqlash",onSubmit:async v=>{
      const saved=await api(route,{method:"POST",body:{...v,...fixed,requestId,...(v.contractLine?{contractId:v.contractLine.split('|')[0],materialId:v.contractLine.split('|')[1]}:{})}});
      if(route===base)select(saved.id);
      refresh();notify(t("Saqlandi"));
    }});
  }
  const amountField={name:"amount",label:"Summa",type:"number",min:0.01,step:0.01,unit:"so‘m",req:true};
  const dateField={name:"date",label:"Sana",type:"date",req:true};
  const debtOptions=unpaid.map(r=>[r.id,rowName(r,t)+" · "+display(r.remaining)]);
  const route=base+"/"+party;
  function payment(){
    form("To‘lov kiritish",route+"/entries",[dateField,{name:"number",label:"To‘lov hujjati raqami",req:true},amountField,
      {name:"contractLine",label:"Qaysi shartnoma va material uchun?",type:"select",raw:true,wide:true,options:[["","Umumiy to‘lov"],...(data.materials?.contracts||[]).flatMap(c=>c.items.map(l=>[c.id+"|"+l.materialId,"№ "+c.number+" · "+l.name+" · "+display(l.price)+" / "+l.unit]))]},
      {name:"targetId",label:"Qaysi hujjat uchun?",type:"select",raw:true,wide:true,options:[["",t("Avans sifatida saqlash")],...debtOptions]}],
      {date:today()},{kind:"payment"});
  }
  function opening(){
    form("Boshlang‘ich qoldiq",route+"/entries",[dateField,{name:"kind",label:"Qoldiq turi",type:"select",options:[["opening_debt","Boshlang‘ich qarz"],["opening_advance","Boshlang‘ich avans"]]}, {...amountField,min:0}],
      {date:today()},{},"Shu kun boshidagi qoldiqni kiriting. Oldingi fakturalar ushbu summaga kiradi.");
  }
  function match(credit){
    form("Avansni bog‘lash",route+"/allocations",[{name:"targetId",label:"Hujjat",type:"select",req:true,raw:true,wide:true,options:debtOptions},amountField],
      {amount:Math.min(credit.remaining,unpaid[0].remaining)},{sourceId:credit.id});
  }
  function cancel(kind,id){
    form(kind==="allocation"?"Bog‘lanishni ajratish":"Yozuvni bekor qilish",route+"/cancel",[{name:"reason",label:"Sabab",req:true,wide:true}],{},{kind,id});
  }
  const list=Array.isArray(data)?data:[];
  const visible=list.filter(r=>matches(r.name,query));
  return <section className="sheet finance-module settlements">
    {review&&<ContractReview data={factoryData} initialKind="purchase" lockKind supplier={party?data?.supplier:null} onClose={()=>setReview(false)} onSaved={d=>{setReview(false);select(d.supplierId);setView("materials");refresh();notify("Shartnoma saqlandi");}}/>}
    <header className="finance-heading"><div>{party&&<button className="settle-back" onClick={()=>select("")}>← {t("Barcha ta’minotchilar")}</button>}
      <h2>{party?(data?.supplier.name||t("Ta’minotchi hisobi")):t("Ta’minotchilar")}</h2></div>
      {party?<button className="btn primary" onClick={payment} disabled={!data}>+ {t("To‘lov kiritish")}</button>:
        <div className="acts"><button className="btn primary" onClick={()=>setReview(true)}>+ Ta’minotchi va shartnoma</button><button className="btn" onClick={()=>form("Ta’minotchi qo‘shish",base,[{name:"name",label:"Ta’minotchi nomi",req:true,wide:true}])}>+ {t("Ta’minotchi")}</button></div>}
    </header>
    {error?<p className="err" role="alert">{t(error)} <button className="btn sm" onClick={refresh}>{t("Qayta urinish")}</button></p>:
    !data?<p className="loading" role="status">{t("Yuklanmoqda…")}</p>:<>
    <div className="settle-metrics">
      <Metric label={t("Yopilmagan qarz")} value={party?sum(debts,r=>r.remaining):sum(list,r=>r.debt)} tone="debt" icon="ord" t={t}/>
      <Metric label={t("Bog‘lanmagan avans")} value={party?sum(credits,r=>r.remaining):sum(list,r=>r.advance)} tone="advance" icon="cost" t={t}/>
      <Metric label={t("Muddati o‘tgan qarz")} value={party?sum(debts.filter(r=>r.dueDate&&r.dueDate<today()),r=>r.remaining):sum(list,r=>r.overdue)} tone="late" icon="day" t={t}/>
    </div>
    {!party?<><div className="finance-toolbar"><input type="search" aria-label={t("Ta’minotchini qidirish")} placeholder={t("Ta’minotchini qidirish")} value={query} onChange={e=>setQuery(e.target.value)}/></div>
      {visible.length?<div className="settle-list">{visible.map(p=><button key={p.id} onClick={()=>select(p.id)}>
        <span className="settle-avatar" aria-hidden="true">{p.name.slice(0,1)}</span><span className="settle-name">{show(p.name)}{p.archived&&<small>{t("Arxiv")}</small>}</span>
        <span className="settle-amount">{display(p.debt)} <small>{t("so‘m qarz")}</small>{p.advance>0&&<small>{t("Avans")} · {display(p.advance)}</small>}</span><Icon name="chevR" size={16}/></button>)}</div>:
        <p className="empty">{t(query?"Ta’minotchi topilmadi.":"Ta’minotchi qo‘shing yoki kirim fakturasini kiriting.")}</p>}</>:
      <><div className="settle-tabs">{[["materials","Shartnomalar va materiallar"],["documents","Fakturalar va qarz"],["credits","To‘lov va avanslar"],["statement","Solishtirma dalolatnoma"]].map(([key,label])=>
        <button key={key} aria-pressed={view===key} onClick={()=>setView(key)}>{t(label)}</button>)}</div>
      {view==="materials"?<SupplierMaterials account={data} materials={factoryData.materials} refresh={refresh} notify={notify} openContract={()=>setReview(true)}/>:view==="statement"?<Statement ledger={ledger} company={company} supplier={data.supplier.name} t={t} notify={notify}/>:<>
        {!ledger.some(r=>r.kind.startsWith("opening"))&&<button className="btn sm" onClick={opening}>{t("Boshlang‘ich qoldiq kiritish")}</button>}
        <div className="settle-docs">{(view==="documents"?debts:credits).slice().reverse().map(r=>{
          const related=allocations.filter(a=>a.sourceId===r.id||a.targetId===r.id);
          return <article key={r.id}><div className="settle-line"><div><strong>{rowName(r,t)}</strong><small>{fmtDate(r.date)}
            {r.dueDate&&" · "+t("To‘lov muddati")+" "+fmtDate(r.dueDate)}</small></div>
            <div className="settle-amount">{display(r.amount)} <small>{t("so‘m")}</small><small>{t(isDebt(r)?"Qoldiq":"Bog‘lanmagan")} · {display(r.remaining)}</small></div></div>
            <details><summary>{t("Tafsilotlar")}</summary>{related.map(a=>{
              const other=ledger.find(item=>item.id===(a.sourceId===r.id?a.targetId:a.sourceId));
              return <div className="settle-link" key={a.id}><span>{other&&rowName(other,t)} · {display(a.amount)}</span>
                <button className="btn sm" onClick={()=>cancel("allocation",a.id)}>{t("Ajratish")}</button></div>;
            })}
            {!related.length&&<p>{t("Bog‘langan to‘lov yo‘q.")}</p>}
            {r.kind==="invoice"?<button className="btn sm" onClick={()=>form("To‘lov muddati",route+"/due-date",[{name:"dueDate",label:"To‘lov muddati",type:"date",req:true,min:r.date}],{dueDate:r.dueDate||r.date},{invoiceId:r.id})}>{t("To‘lov muddatini belgilash")}</button>:
            !related.length&&<button className="btn sm" onClick={()=>cancel("entry",r.id)}>{t("Yozuvni bekor qilish")}</button>}</details>
            {!isDebt(r)&&r.remaining>0&&unpaid.length>0&&<button className="btn sm" onClick={()=>match(r)}>{t("Avansni bog‘lash")}</button>}
          </article>;
        })}</div>{!(view==="documents"?debts:credits).length&&<p className="empty">{t(view==="documents"?"Hozircha faktura yoki boshlang‘ich qarz yo‘q.":"Hozircha to‘lov yoki avans yo‘q.")}</p>}
      </>}</>}
    </>}
  </section>;
}
