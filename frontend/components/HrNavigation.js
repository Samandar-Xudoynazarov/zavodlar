"use client";
import { useT } from '@/lib/i18n';
import Icon from './Icon';
import './hr-redesign.css';

// Kadrlar menyusi: hech bir bo'lim ochiladigan ro'yxatda yashirinmaydi — hammasi 3–4 guruhda ko'rinadi.
// Guruhga kirmay qolgan bo'lim (yangi qo'shilsa) oxirgi guruhga tushadi.
const GROUPS = [
  ['Odamlar', ['overview', 'employees', 'staff']],
  ['Vaqt', ['time', 'leaves', 'shifts']],
  ['Hujjatlar', ['orders', 'reminders', 'documents', 'equipment', 'archive']],
  ['Oylik va hisobot', ['payroll', 'payments', 'reports']],
];
const SHORT = { overview: 'Nazorat', archive: 'Hujjatlar markazi', reminders: 'Muddatlar', documents: 'Hujjat muddatlari' };

export default function HrNavigation({ view, onChange, tabs }) {
  const t = useT(), known = new Set(GROUPS.flatMap(([, ids]) => ids));
  const groups = GROUPS.map(([title, ids], i) => [title, [...ids.map((id) => tabs.find(([k]) => k === id)), ...(i === GROUPS.length - 1 ? tabs.filter(([k]) => !known.has(k)) : [])].filter(Boolean)]).filter(([, list]) => list.length);
  return <>
    <nav className="hrx-nav hr-no-print" aria-label={t('Kadrlar bo‘limi')}>
      {groups.map(([title, list]) => <div className="hrx-group" key={title}><span>{t(title)}</span><div>
        {list.map(([id, label]) => <button key={id} aria-current={view === id ? 'page' : undefined} onClick={() => view !== id && onChange(id)}>{t(SHORT[id] || label)}</button>)}
      </div></div>)}
    </nav>
    <div className="hrx-navfoot hr-no-print"><a className="hr-guide-link" href="/help/kadrlar-qollanma.pdf" target="_blank" rel="noreferrer"><Icon name="download" />{t('PDF qo‘llanma')}</a></div>
  </>;
}
