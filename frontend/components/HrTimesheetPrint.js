"use client";
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '@/lib/api';
import { show, useT } from '@/lib/i18n';
import { fmtN } from '@/lib/calc';
import { daysIn, dateOf, employedOn } from '@/lib/hr-ui';
import Icon from './Icon';

// Qog'oz tabel shakli (kirill yozuvida, zavoddagi namuna bo'yicha). Pul ma'lumoti yo'q.
const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const WEEK = ['Як', 'Ду', 'Се', 'Чо', 'Па', 'Жу', 'Ша'];
const CODE = { off: 'В', sick: 'К', leave: 'О', trip: 'С', absent: 'Х' };

export default function HrTimesheetPrint({ employees, doc, month, company, onClose }) {
  const t = useT();
  const [who, setWho] = useState({ company: company || '', hrName: '', director: '' });
  const closeRef = useRef(null), closeFn = useRef(onClose);
  closeFn.current = onClose;
  useEffect(() => {
    let live = true;
    api('/factory-profile').then(p => { if (live) setWho(w => ({ company: p.company || w.company, hrName: p.hrName || '', director: p.director || '' })); }).catch(() => {});
    closeRef.current?.focus();
    const key = e => { if (e.key === 'Escape') closeFn.current(); };
    document.addEventListener('keydown', key);
    document.body.classList.add('hrx-printing');
    return () => { live = false; document.removeEventListener('keydown', key); document.body.classList.remove('hrx-printing'); };
  }, []);

  const y = +month.slice(0, 4), m = +month.slice(5) - 1, last = daysIn(month);
  const days = Array.from({ length: last }, (_, i) => i + 1);
  const wd = d => new Date(dateOf(month, d) + 'T00:00:00Z').getUTCDay();
  const rest = d => !doc.workDays.includes(wd(d)) || doc.holidays.includes(dateOf(month, d));
  const groups = [];
  for (const e of employees) {
    const name = e.department || '';
    let g = groups.find(x => x.name === name);
    if (!g) groups.push(g = { name, list: [] });
    g.list.push(e);
  }
  const dayTotal = days.map(() => 0);
  let n = 0, allDays = 0, allHours = 0;
  const body = [];
  for (const g of groups) {
    body.push(<tr key={'g' + g.name} className="g"><td colSpan={last + 6}>{g.name ? show(g.name) : 'Бўлимсиз'}</td></tr>);
    for (const e of g.list) {
      n++;
      const vals = doc.attendance[e.id] || {};
      let worked = 0, hours = 0;
      const cells = days.map(d => {
        const v = vals[d], h = +v?.hours || 0;
        if (h > 0) { worked++; hours += h; dayTotal[d - 1] += h; }
        const out = !employedOn(e, dateOf(month, d));
        const mark = out || !v?.status ? '' : v.status === 'work' ? fmtN(h, 1) : v.status === 'trip' && !h ? CODE.trip : CODE[v.status] || '';
        return <td key={d} className={`${rest(d) ? 'w' : ''}${v?.status === 'absent' ? ' x' : ''}`}>{mark}</td>;
      });
      allDays += worked; allHours += hours;
      body.push(<tr key={e.id}><td>{n}</td><td className="l">{show(e.name)}</td><td className="l">{show(e.position)}</td>{cells}<td>{worked}</td><td>{fmtN(hours, 2)}</td><td></td></tr>);
    }
  }

  const signer = (title, key, seal) => <div className="sg">
    <p><b>{title}</b></p>
    <input aria-label={title} value={who[key]} placeholder="Ф.И.Ш." onChange={e => setWho(w => ({ ...w, [key]: e.target.value }))}/>
    <div className="sgrow"><div style={{ flex: 1 }}><div className="ln"><em>Имзо</em><span/></div><div className="ln"><em>Сана</em><span/></div></div><div className="seal">М.Ў.<br/>{seal}</div></div>
  </div>;

  return createPortal(<div className="hrx-print-wrap" role="dialog" aria-modal="true" aria-label={t('Tabel chop etish varag‘i')}>
    <div className="hrx-print-bar">
      <strong>{t('Tabel chop etish varag‘i')} · {month}</strong>
      <span className="hint" style={{ color: '#e2e8f0' }}>{t('A4 albom. Ismlarni shu yerda tuzatish mumkin, ular saqlanmaydi.')}</span>
      <button className="btn primary" onClick={() => window.print()}><Icon name="print"/>{t('Chop etish')}</button>
      <button className="btn" ref={closeRef} onClick={onClose}>{t('Yopish')}</button>
    </div>
    <div className="hrx-sheet">
      <div className="head">
        <div>
          <h2>ИШ ВАҚТИ ТАБЕЛИ — {y} йил {MONTHS[m]}</h2>
          <p>{who.company}</p>
          {doc.status === 'draft' && <p><b>Қоралама: ҳали тасдиқланмаган</b></p>}
        </div>
        <div className="rules">
          <p><b>БЕЛГИЛАШ ТАРТИБИ:</b> рақам — ишланган соат; В — дам олиш; К — касаллик; О — таътил; С — хизмат сафари; Х — келмаган.</p>
          <p><b>ҲИСОБЛАШ ТАРТИБИ:</b> ишланган кун — соати 0 дан катта кун; жами соат — киритилган соатлар йиғиндиси. Дам олиш кунлари кулранг.</p>
        </div>
      </div>
      <table>
        <thead>
          <tr><th rowSpan={2}>№</th><th rowSpan={2}>Ходим Ф.И.Ш.</th><th rowSpan={2}>Лавозим</th>{days.map(d => <th key={d} className={rest(d) ? 'w' : ''}>{d}</th>)}<th rowSpan={2}>Ишланган кун</th><th rowSpan={2}>Жами соат</th><th rowSpan={2}>Изоҳ</th></tr>
          <tr>{days.map(d => <th key={d} className={rest(d) ? 'w' : ''}>{WEEK[wd(d)]}</th>)}</tr>
        </thead>
        <tbody>
          {body}
          <tr className="tot"><td></td><td className="l">ЖАМИ</td><td></td>{dayTotal.map((h, i) => <td key={i} className={rest(i + 1) ? 'w' : ''}>{h ? fmtN(h, 0) : ''}</td>)}<td>{allDays}</td><td>{fmtN(allHours, 2)}</td><td></td></tr>
        </tbody>
      </table>
      <div className="signs">
        {signer('Тузди: Кадрлар бўлими ходими', 'hrName', <>Ходимлар<br/>бошлиғи</>)}
        {signer('Тасдиқлайман: Директор', 'director', 'Директор')}
      </div>
    </div>
  </div>, document.body);
}
