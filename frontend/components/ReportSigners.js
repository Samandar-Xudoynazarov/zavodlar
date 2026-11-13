"use client";
import {useEffect,useState} from 'react';
import {api} from '@/lib/api';
import {tr} from '@/lib/i18n';

export default function ReportSigners({settings,canEdit,notify,onSaved}) {
  const saved=JSON.stringify(settings.signers||[]);
  const [lines,setLines]=useState(()=>settings.signers?.length?[...settings.signers]:['','']);
  const [busy,setBusy]=useState(false);
  useEffect(()=>{const rows=JSON.parse(saved);setLines(rows.length?rows:['','']);},[saved,settings.factoryId]);
  if(!canEdit)return null;
  async function save(e){
    e.preventDefault();setBusy(true);
    try{
      const signers=lines.map(s=>s.trim()).filter(Boolean);
      await api('/settings',{method:'PUT',body:{signers}});
      await onSaved?.();
      notify('Hisobot imzo qo‘yuvchilari saqlandi');
    }catch(e){notify(e.message);}finally{setBusy(false);}
  }
  return <details className="howto no-print">
    <summary>{tr('Excel ostidagi imzo qo‘yuvchilar')}</summary>
    <form onSubmit={save}>
      <p className="hint">{tr('Har bir qatorga lavozim va ism-familiyani yozing. Saqlangandan keyin shu zavodning kunlik va oylik Excel hisobotlari tagida imzo chizig‘i bilan chiqadi. Bo‘sh qatorlar chiqarilmaydi.')}</p>
      <fieldset className="plain" disabled={busy}>
        {lines.map((line,i)=><label className="field" key={i} style={{marginBottom:8}}>
          {tr('Imzo qo‘yuvchi')} {i+1}
          <input maxLength={120} value={line} placeholder={i===0?'ПТО muhandisi Xudoynazarov S.':'Materiallar bo‘yicha buxgalter Aralova Z.'} onChange={e=>setLines(rows=>rows.map((v,j)=>j===i?e.target.value:v))}/>
        </label>)}
        <div className="acts">
          {lines.length<6&&<button type="button" className="btn sm" onClick={()=>setLines(rows=>[...rows,''])}>{tr('Qator qo‘shish')}</button>}
          <button className="btn primary" disabled={busy}>{tr(busy?'Saqlanmoqda…':'Imzo qo‘yuvchilarni saqlash')}</button>
        </div>
      </fieldset>
    </form>
  </details>;
}
