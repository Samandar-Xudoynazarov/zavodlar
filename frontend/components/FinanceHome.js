"use client";
import { useEffect, useState } from "react";
import Icon from "./Icon";
import { api } from "@/lib/api";
import { fmtN } from "@/lib/calc";
import { useT } from "@/lib/i18n";

const tasks = [
  ["finance-settlements","sup","Ta’minotchilar bilan hisob-kitob","Qarz, avans va solishtirma dalolatnoma"],
  ["finance-orders","ord","Buyurtma moliyasi","Jo‘natilgan mahsulot, faktura va tushum"],
  ["finance-materials","acct","Material fakturalari","Kirim, chiqim va asl hujjatlar"],
  ["finance-payroll","hr","Oylik hisob-kitobi","Xodimlar bo‘yicha hisoblangan va to‘langan oylik"],
  ["acct","grid","Material hisoboti","Oylik material hisobotini tayyorlash"]
];

export default function FinanceHome({navigate}) {
  const t=useT();
  const [suppliers,setSuppliers]=useState(null),[failed,setFailed]=useState(false),[attempt,retry]=useState(0);
  useEffect(()=>{
    let live=true;
    setFailed(false);
    api("/finance/supplier-settlements").then(s=>{if(live)setSuppliers(s);}).catch(()=>{if(live)setFailed(true);});
    return ()=>{live=false;};
  },[attempt]);
  const overdue=suppliers?.filter(s=>s.overdue>0)||[];
  return <section className="fin-home">
    <div className="fin-spotlight"><div><h2>{t("Muddati o‘tgan qarz")}</h2>
      {failed?<button className="btn" onClick={()=>retry(i=>i+1)}>{t("Qayta urinish")}</button>:suppliers?
        <><strong>{fmtN(overdue.reduce((n,s)=>n+Math.round(s.overdue*100),0)/100,2)} <small>{t("so‘m")}</small></strong>
        <p>{t("Ta’minotchilar")} · {overdue.length}</p></>:<p role="status">{t("Yuklanmoqda…")}</p>}</div>
      <button onClick={()=>navigate("finance-settlements")}>{t("Hisob-kitobni ochish")} <Icon name="chevR" size={16}/></button>
    </div>
    <div className="fin-actions">{tasks.map(([key,icon,label,desc])=><button key={key} onClick={()=>navigate(key)}>
      <span className="fin-action-icon"><Icon name={icon} size={22}/></span>
      <span><strong>{t(label)}</strong><small>{t(desc)}</small></span><Icon name="chevR" size={16}/>
    </button>)}</div>
  </section>;
}
