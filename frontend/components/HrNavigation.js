"use client";
import { useT } from '@/lib/i18n';
export default function HrNavigation({view,onChange,tabs}) {
 const t=useT(),main=tabs.filter(([id])=>['overview','employees','time'].includes(id)),extra=tabs.filter(([id])=>!['overview','employees','time'].includes(id));
 return <div className="hr-tabs hr-no-print"><div role="tablist" aria-label={t('Kadrlar bo‘limi')}>{main.map(([id,label])=><button key={id} role="tab" aria-selected={view===id} onClick={()=>onChange(id)}>{t(label)}</button>)}</div>{!!extra.length&&<label className="hr-extra">{t('Qo‘shimcha bo‘lim')}<select aria-label={t('Qo‘shimcha bo‘lim')} value={extra.some(([id])=>id===view)?view:''} onChange={e=>e.target.value&&onChange(e.target.value)}><option value="">{t('Tanlang')}</option>{extra.map(([id,label])=><option key={id} value={id}>{t(label)}</option>)}</select></label>}</div>;
}
