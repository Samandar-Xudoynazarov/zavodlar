"use client";
// Xodim kabineti: umumiy ko'rinish (kartochkalar) va yil davomati. Maosh faqat PAY rollariga, qolganlarga qulf.
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useT, show } from '@/lib/i18n';
import { today, fmtN, fmtDate } from '@/lib/calc';
import { DOC_TITLES } from '@/lib/hr-document-definitions';
import { daysIn, dateOf, employedOn, tenure, annualUsed, pct } from '@/lib/hr-ui';

const MONTHS = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];
const WEEK = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'];
const LEAVE = { annual: 'Yillik ta’til', unpaid: 'Ish haqi saqlanmaydigan ta’til' };
const RECORD_STATUS = { draft: ['Qoralama', 'warn'], approved: ['Tasdiqlangan', 'ok'], completed: ['Yakunlangan', 'ok'], cancelled: ['Bekor qilingan', ''] };

/** Xodimning joriy yil davomati, ta'til yozuvlari va (ruxsat bo'lsa) maoshi */
export function useEmployeeYear(employeeId, pay, refreshKey) {
  const [state, setState] = useState(null);
  useEffect(() => {
    let live = true;
    setState(null);
    (async () => {
      const now = today(), year = now.slice(0, 4), cur = now.slice(0, 7);
      const [wf, ms, rates] = await Promise.all([
        api('/hr/workforce').catch(() => null),
        api('/hr/months').catch(() => []),
        pay ? api(`/hr/rates/${employeeId}`).catch(() => null) : null,
      ]);
      const wanted = ms.filter(m => m.month.startsWith(year) && m.month <= cur).map(m => m.month);
      const docs = await Promise.all(wanted.map(m => api(`/hr/months/${m}`)
        .then(d => [m, { days: d.attendance?.[employeeId] || {}, workDays: d.workDays || [1, 2, 3, 4, 5], holidays: d.holidays || [] }])
        .catch(() => null)));
      if (!live) return;
      setState({
        now, year: +year,
        records: (wf?.records || []).filter(r => r.employeeId === employeeId),
        allowance: (wf?.allowances || []).find(a => a.employeeId === employeeId && +a.year === +year) || null,
        months: Object.fromEntries(docs.filter(Boolean)),
        rates,
      });
    })();
    return () => { live = false; };
  }, [employeeId, pay, refreshKey]);
  return state;
}

const rest = (m, d) => { const date = dateOf(m.month, d); return !m.workDays.includes(new Date(date + 'T00:00:00Z').getUTCDay()) || m.holidays.includes(date); };
/** Kun holati: work | trip | leave | sick | absent | off | none | '' (hali kelmagan yoki ish davridan tashqari) */
function dayStatus(e, info, month, d, now) {
  const date = dateOf(month, d);
  if (!info || !employedOn(e, date)) return '';
  const st = info.days[d]?.status;
  if (st) return st;
  if (date > now) return '';
  return rest({ ...info, month }, d) ? 'off' : 'none';
}

function yearCounts(e, y) {
  const c = { work: 0, hours: 0, leave: 0, sick: 0, absent: 0, trip: 0 };
  for (const [, info] of Object.entries(y.months)) for (const v of Object.values(info.days)) {
    if (+v?.hours > 0) { c.work++; c.hours += +v.hours; }
    if (v?.status in c && v.status !== 'work') c[v.status]++;
  }
  return c;
}

export function leaveBalance(e, y) {
  if (!y?.allowance) return null;
  const used = (+y.allowance.usedBefore || 0) + annualUsed(y.records, e.id, y.year);
  return { days: +y.allowance.days, used, left: +y.allowance.days - used };
}

/** Yuqoridagi 5 ta ko'rsatkich */
export function CabinetStats({ e, y, ready, total, documents, onTab }) {
  const t = useT(), now = today(), cur = now.slice(0, 7);
  const ten = tenure(e.hireDate, e.endDate, now);
  const info = y?.months[cur], days = info ? Object.values(info.days) : [];
  const bal = leaveBalance(e, y), drafts = documents.filter(d => d.status === 'draft').length;
  return <div className="hrx-kpis">
    <div className="hrx-card hrx-kpi"><span>{t('Ish staji')}</span><strong>{ten ? (ten.years ? t('{y} yil {m} oy', { y: ten.years, m: ten.months }) : t('{m} oy', { m: ten.months })) : '—'}</strong><small>{e.hireDate ? `${t('Ishga kirgan')}: ${fmtDate(e.hireDate)}` : t('Kiritilmagan')}</small></div>
    <button className="hrx-card hrx-kpi" onClick={() => onTab('attendance')}><span>{t('Bu oy ishlagan')}</span><strong>{y ? days.filter(v => +v?.hours > 0).length : '…'}</strong><small>{y ? `${fmtN(days.reduce((s, v) => s + (+v?.hours || 0), 0), 1)} ${t('soat')}` : ''}</small></button>
    <button className={`hrx-card hrx-kpi ${bal && bal.left <= 0 ? 'warn' : ''}`} onClick={() => onTab('attendance')}><span>{t('Ta’til qoldig‘i')}</span><strong>{bal ? `${bal.left} ${t('kun')}` : '—'}</strong><small>{bal ? t('{u} / {d} kun ishlatilgan', { u: bal.used, d: bal.days }) : y ? t('Limit kiritilmagan') : ''}</small></button>
    <button className={`hrx-card hrx-kpi ${ready < total ? 'warn' : 'ok'}`} onClick={() => onTab('dossier')}><span>{t('Shaxsiy delo')}</span><strong>{ready} / {total}</strong><small>{pct(ready, total)}%</small></button>
    <button className={`hrx-card hrx-kpi ${drafts ? 'warn' : ''}`} onClick={() => onTab('documents')}><span>{t('Shartnoma va buyruqlar')}</span><strong>{documents.length}</strong><small>{drafts ? `${t('Qoralama')}: ${drafts}` : t('Hammasi rasmiylashtirilgan')}</small></button>
  </div>;
}

function MonthCalendar({ e, y }) {
  const t = useT(), month = y.now.slice(0, 7), info = y.months[month], last = daysIn(month);
  const lead = (new Date(month + '-01T00:00:00Z').getUTCDay() + 6) % 7;
  if (!info) return <p className="hrx-empty">{t('Bu oy hali ochilmagan')}</p>;
  return <div className="hrx-cal" role="img" aria-label={t('Bu oy davomati')}>
    {WEEK.map(w => <span key={w}>{t(w)}</span>)}
    {Array.from({ length: lead }, (_, i) => <span key={'b' + i}/>)}
    {Array.from({ length: last }, (_, i) => { const st = dayStatus(e, info, month, i + 1, y.now); return <span key={i} className={`hrx-cell ${st}`} title={`${i + 1}`}>{i + 1}</span>; })}
  </div>;
}

function Ring({ value, total, label }) {
  const r = 42, c = 2 * Math.PI * r, p = total > 0 ? Math.min(1, value / total) : 0;
  return <svg viewBox="0 0 104 104" aria-hidden="true">
    <circle cx="52" cy="52" r={r} fill="none" stroke="var(--line)" strokeWidth="11"/>
    <circle cx="52" cy="52" r={r} fill="none" stroke="var(--s3)" strokeWidth="11" strokeLinecap="round" strokeDasharray={`${c * p} ${c}`} transform="rotate(-90 52 52)"/>
    <text x="52" y="50" textAnchor="middle" fontSize="22" fontWeight="700" fill="var(--ink)">{value}</text>
    <text x="52" y="68" textAnchor="middle" fontSize="11" fill="var(--ink-3)">{label}</text>
  </svg>;
}

const Lock = ({ text }) => <p className="hrx-lock"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>{text}</p>;

/** «Umumiy» yorlig'i */
export function CabinetOverview({ e, data, y, pay, slots, ready, onTab }) {
  const t = useT();
  const bal = leaveBalance(e, y);
  const missing = slots.filter(([slot]) => !(e.profile?.dossier?.[slot]?.status === 'received' || data.files.some(f => f.slot === slot)) && e.profile?.dossier?.[slot]?.status !== 'not_applicable');
  const events = [
    e.hireDate && { date: e.hireDate, title: t('Ishga qabul qilindi'), sub: [show(e.position), show(e.department)].filter(Boolean).join(' · '), cls: 'ok' },
    ...data.documents.filter(d => d.status === 'issued' && d.kind !== 'hire').map(d => ({ date: d.effectiveDate || d.date, title: t(DOC_TITLES[d.kind] || d.kind), sub: `№ ${d.number || '—'}`, cls: d.kind === 'termination' ? 'bad' : '' })),
    ...(y?.records || []).filter(r => r.kind === 'leave' && r.status === 'approved').map(r => ({ date: r.startDate, title: t(LEAVE[r.detail?.leaveType] || 'Ta’til'), sub: `${t('{n} kun', { n: Math.round((Date.parse(r.endDate) - Date.parse(r.startDate)) / 86400000) + 1 })} · ${fmtDate(r.endDate)} ${t('gacha')}`, cls: 'warn' })),
    ...(y?.records || []).filter(r => r.kind === 'order' && ['approved', 'completed'].includes(r.status) && ['reward', 'penalty'].includes(r.detail?.orderType)).map(r => ({ date: r.startDate, title: t(r.detail.orderType === 'reward' ? 'Rag‘batlantirildi' : 'Intizomiy jazo'), sub: show(r.detail.basis || r.title), cls: r.detail.orderType === 'reward' ? 'ok' : 'bad' })),
    e.endDate && { date: e.endDate, title: t('Ishdan chiqdi'), sub: t('Oxirgi ish kuni'), cls: 'bad' },
  ].filter(Boolean).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  const rate = y?.rates?.[0];
  return <>
    <div className="hrx-even">
      <article className="hrx-card"><h3>{t('Bu oy davomati')}</h3>{y ? <MonthCalendar e={e} y={y}/> : <p className="hrx-empty">{t('Yuklanmoqda…')}</p>}
        <div className="hrx-legend"><span><i style={{ background: 'var(--accent-soft)' }}/>{t('Ishda')}</span><span><i style={{ background: 'var(--s3)' }}/>{t('Ta’til')}</span><span><i style={{ background: 'var(--s4)' }}/>{t('Kasal')}</span><span><i style={{ background: 'var(--s2)' }}/>{t('Kelmagan')}</span><span><i style={{ background: '#7c5cd6' }}/>{t('Safar')}</span></div></article>
      <article className="hrx-card"><h3>{t('Yillik ta’til')} · {y?.year || ''}</h3>
        {bal ? <div className="hrx-ring"><Ring value={Math.max(0, bal.left)} total={bal.days} label={t('kun qoldi')}/><div><p style={{ margin: '0 0 4px' }}>{t('Limit')}: <b>{bal.days} {t('kun')}</b></p><p style={{ margin: '0 0 4px' }}>{t('Ishlatilgan')}: <b>{bal.used} {t('kun')}</b></p>{bal.left < 0 && <span className="hrx-pill bad">{t('Limitdan oshgan')}</span>}</div></div>
          : <p className="hrx-empty">{y ? t('Bu yil uchun ta’til limiti kiritilmagan. Uni «Ta’tillar» bo‘limida kiriting.') : t('Yuklanmoqda…')}</p>}
      </article>
    </div>
    <div className="hrx-even">
      <article className="hrx-card"><h3>{t('Mehnat yo‘li')}</h3>{events.length ? <ul className="hrx-tl">{events.map((x, i) => <li key={i} className={x.cls}><b>{x.title}</b><small>{fmtDate(x.date)}{x.sub ? ` · ${x.sub}` : ''}</small></li>)}</ul> : <p className="hrx-empty">{t('Hali yozuv yo‘q')}</p>}</article>
      <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
        <article className="hrx-card"><h3>{t('Maosh')}</h3>
          {pay ? (rate ? <><p className="hrx-big">{fmtN(rate.salary, 0)}</p><p className="hint" style={{ margin: '4px 0 0' }}>{t('Koeffitsiyent haqi')}: {fmtN(rate.coefficient, 0)} · {t('Amal qilish sanasi')}: {fmtDate(rate.effectiveDate)}{rate.grade ? ` · ${t('Razryad')}: ${rate.grade}` : ''}</p></> : <p className="hrx-empty">{y ? t('Maosh belgilanmagan') : t('Yuklanmoqda…')}</p>)
            : <Lock text={t('Maosh faqat rahbar va buxgalterga ko‘rinadi.')}/>}
        </article>
        <article className="hrx-card"><h3>{t('Shaxsiy delo')} · {ready} / {slots.length}</h3>
          <div className={`hrx-bar ${ready >= slots.length ? 'ok' : 'warn'}`}><b style={{ width: pct(ready, slots.length) + '%' }}/></div>
          {missing.length ? <p className="hint" style={{ margin: '8px 0' }}>{t('Yetishmaydi')}: {missing.slice(0, 4).map(([, l]) => t(l)).join(', ')}{missing.length > 4 ? ` +${missing.length - 4}` : ''}</p> : <p className="hint" style={{ margin: '8px 0' }}>{t('Hamma hujjat yig‘ilgan')}</p>}
          <button className="btn sm" onClick={() => onTab('dossier')}>{t('Shaxsiy delo')} →</button>
        </article>
      </div>
    </div>
  </>;
}

/** «Davomat va ta'til» yorlig'i */
export function CabinetAttendance({ e, y }) {
  const t = useT();
  if (!y) return <p className="hrx-empty">{t('Yuklanmoqda…')}</p>;
  const c = yearCounts(e, y), curMonth = +y.now.slice(5, 7);
  const leaves = y.records.filter(r => r.kind === 'leave');
  return <>
    <article className="hrx-card" style={{ marginBottom: 14 }}>
      <h3>{t('{y}-yil davomati: {w} ish kuni, {l} kun ta’til, {s} kun kasal, {a} kun kelmagan', { y: y.year, w: c.work, l: c.leave, s: c.sick, a: c.absent })}</h3>
      {Object.keys(y.months).length ? <div className="hrx-heat" role="img" aria-label={t('Yil davomati')}>
        <span/>{Array.from({ length: 31 }, (_, i) => <span key={i} style={{ textAlign: 'center' }}>{(i + 1) % 5 === 0 ? i + 1 : ''}</span>)}
        {Array.from({ length: curMonth }, (_, m) => {
          const month = `${y.year}-${String(m + 1).padStart(2, '0')}`, info = y.months[month], last = daysIn(month);
          return [<span key={'l' + m} className="mlabel">{t(MONTHS[m])}</span>, ...Array.from({ length: 31 }, (_, i) => {
            if (i >= last || !info) return <i key={m + '-' + i}/>;
            const st = dayStatus(e, info, month, i + 1, y.now);
            return <i key={m + '-' + i} className={st === 'off' ? '' : st} title={`${i + 1}.${String(m + 1).padStart(2, '0')}`}/>;
          })];
        })}
      </div> : <p className="hrx-empty">{t('Bu yil hali tabel yuritilmagan')}</p>}
      <div className="hrx-legend"><span><i style={{ background: 'var(--accent-soft)' }}/>{t('Ishda')}</span><span><i style={{ background: 'var(--s3)' }}/>{t('Ta’til')}</span><span><i style={{ background: 'var(--s4)' }}/>{t('Kasal')}</span><span><i style={{ background: 'var(--s2)' }}/>{t('Kelmagan')}</span><span><i style={{ background: '#7c5cd6' }}/>{t('Safar')}</span><span><i style={{ border: '1px dashed var(--ink-3)' }}/>{t('belgilanmagan')}</span></div>
      <p className="hint" style={{ margin: '8px 0 0' }}>{t('Ishlagan soat')}: {fmtN(c.hours, 1)} · {t('Xizmat safari')}: {c.trip} {t('kun')}</p>
    </article>
    <article className="hrx-card"><h3>{t('Ta’til yozuvlari')}</h3>
      {leaves.length ? <div className="hrx-todo">{leaves.map(r => { const st = RECORD_STATUS[r.status] || [r.status, '']; return <div key={r.id} className={`hrx-item ${st[1] === 'ok' ? 'info' : st[1]}`}><div><b>{t(LEAVE[r.detail?.leaveType] || 'Ta’til')}{r.title ? ` · ${show(r.title)}` : ''}</b><small>{fmtDate(r.startDate)} — {fmtDate(r.endDate)}</small></div><span className={`hrx-pill ${st[1]}`}>{t(st[0])}</span></div>; })}</div>
        : <p className="hrx-empty">{t('Ta’til yozuvlari yo‘q')}</p>}
    </article>
  </>;
}
