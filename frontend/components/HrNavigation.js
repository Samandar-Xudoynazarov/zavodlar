"use client";
import { useT } from '@/lib/i18n';
import Icon from './Icon';
export default function HrNavigation({view,onChange,tabs}) {
 const t=useT(),main=tabs.filter(([id])=>['overview','employees','time','archive'].includes(id)),extra=tabs.filter(([id])=>!['overview','employees','time','archive'].includes(id));
 return <div className="hr-tabs hr-nav hr-no-print"><div role="tablist" aria-label={t('Kadrlar bo‘limi')}>{main.map(([id,label])=><button key={id} role="tab" aria-selected={view===id} onClick={()=>onChange(id)}><Icon name={{overview:'dash',employees:'hr',time:'plan',archive:'acct'}[id]} size={20}/><span>{t(label)}<small aria-hidden="true">{t({overview:'Bugungi vaziyat',employees:'Kartochka va hujjatlar',time:'Davomat va ish soati',archive:'Yuklash va arxiv'}[id])}</small></span></button>)}</div>{!!extra.length&&<label className="hr-extra">{t('Qo‘shimcha bo‘lim')}<select aria-label={t('Qo‘shimcha bo‘lim')} value={extra.some(([id])=>id===view)?view:''} onChange={e=>e.target.value&&onChange(e.target.value)}><option value="">{t('Bo‘limni tanlang')}</option>{extra.map(([id,label])=><option key={id} value={id}>{t(label)}</option>)}</select></label>}<a className="hr-guide-link" href="/help/kadrlar-qollanma.pdf" target="_blank" rel="noreferrer"><Icon name="download"/>{t('PDF qo‘llanma')}</a></div>;
}
