"use client";
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useT, show } from '@/lib/i18n';
import { fmtDate } from '@/lib/calc';
import { daysIn, monthTotals, cellStatus, employedOn, pct } from '@/lib/hr-ui';
import Chart from './Chart';

// Kadrlar nazorati: bugungi vaziyat kartochkalarda, oy davomati grafikda, bo'limlar va shtat chiziqlarda.
// Pul ma'lumoti yo'q — kuzatuvchi ham ko'radi.
const KIND_VIEW = { leave: 'leaves', shift: 'shifts', order: 'orders', document: 'documents', equipment: 'equipment' };
const EVENT = { 'workforce.create': 'Kadrlar yozuvi yaratildi', 'workforce.update': 'Kadrlar yozuvi o‘zgardi', 'workforce.decision': 'Kadrlar yozuvi holati o‘zgardi', 'workforce.apply': 'Reja tabelga qo‘llandi', 'workforce.allowance': 'Ta’til limiti o‘zgardi' };

export default function HrDashboard({ data, onViewChange }) {
  const t = useT(), date = data.date, month = date.slice(0, 7), day = +date.slice(8);
  const [extra, setExtra] = useState({ month: null, staff: [], reminders: [] });
  useEffect(() => {
    let live = true;
    Promise.all([
      api(`/hr/months/${month}`).catch(() => null),
      api('/hr/staff-positions').catch(() => []),
      api('/hr/reminders').then((r) => r.items || []).catch(() => []),
    ]).then(([m, staff, reminders]) => { if (live) setExtra({ month: m, staff, reminders }); });
    return () => { live = false; };
  }, [month, data]);

  const employees = data.employees, records = data.records, att = extra.month?.attendance || {};
  const active = employees.filter((e) => employedOn(e, date));
  const todayStatus = (s) => active.filter((e) => cellStatus(e, att, month, day) === s).length;
  const sick = todayStatus('sick'), absent = todayStatus('absent'), unmarked = extra.month ? todayStatus('none') : active.length;
  const name = (id) => show(employees.find((e) => e.id === id)?.name) || '—';

  // oy grafigi: 1-kundan bugungacha
  const totals = extra.month ? monthTotals(employees, att, month, Math.min(day, daysIn(month))) : [];
  const labels = totals.map((_, i) => String(i + 1));
  const marked = totals.reduce((s, r) => s + r.work + r.leave + r.sick + r.absent, 0);
  const avgWork = marked ? pct(totals.reduce((s, r) => s + r.work, 0), marked) : 0;
  const series = [['work', 'Ishda', 'var(--s1)'], ['leave', 'Ta’til', 'var(--s3)'], ['sick', 'Kasal', 'var(--s4)'], ['absent', 'Kelmagan', 'var(--s2)'], ['none', 'Belgilanmagan', 'var(--line)']]
    .map(([key, label, color]) => ({ key, label: t(label), color, values: totals.map((r) => r[key]) }));

  // bo'limlar va shtat
  const byDept = new Map();
  for (const e of active) byDept.set(e.department || t('Bo‘limsiz'), (byDept.get(e.department || t('Bo‘limsiz')) || 0) + 1);
  const depts = [...byDept].sort((a, b) => b[1] - a[1]), maxDept = Math.max(1, ...depts.map((d) => d[1]));
  const staffDept = new Map();
  for (const s of extra.staff) { const k = s.department || t('Bo‘limsiz'), v = staffDept.get(k) || [0, 0]; staffDept.set(k, [v[0] + s.occupied, v[1] + s.slots]); }
  const slots = extra.staff.reduce((s, x) => s + x.slots, 0), occupied = extra.staff.reduce((s, x) => s + Math.min(x.occupied, x.slots), 0);

  // bugungi ishlar
  const todo = [];
  for (const r of records.filter((r) => r.status === 'draft').slice(0, 5)) todo.push(['bad', `${name(r.employeeId)} — ${r.title}`, t('Tasdiq kutilmoqda'), KIND_VIEW[r.kind]]);
  if (unmarked && active.length) todo.push(['info', t('Bugun {n} kishining davomati belgilanmagan', { n: unmarked }), t('Tabelni to‘ldiring'), 'time']);
  for (const r of extra.reminders.filter((x) => x.days <= 7).slice(0, 6)) todo.push([r.days < 0 ? 'bad' : 'warn', `${show(r.name)} — ${t(r.title)}`, `${fmtDate(r.date)} · ${r.days < 0 ? t('{n} kun o‘tgan', { n: -r.days }) : t('{n} kun qoldi', { n: r.days })}`, 'reminders']);

  return <>
    <div className="hrx-kpis">
      <div className="hrx-card hrx-kpi"><span>{t('Faol xodimlar')}</span><strong>{active.length}</strong><small>{t('Davomat belgilangan')}: {data.summary.marked}</small></div>
      <div className="hrx-card hrx-kpi ok"><span>{t('Bugun ishda')}</span><strong>{data.summary.atWork}</strong><small>{pct(data.summary.atWork, active.length)}%</small></div>
      <button className="hrx-card hrx-kpi" onClick={() => onViewChange('leaves')}><span>{t('Ta’tilda')}</span><strong>{data.summary.onLeave}</strong><small>{t('Ta’tillar')} →</small></button>
      <div className={`hrx-card hrx-kpi ${sick ? 'warn' : ''}`}><span>{t('Kasal')}</span><strong>{sick}</strong><small>{t('Kelmagan')}: {absent}</small></div>
      <div className={`hrx-card hrx-kpi ${data.summary.pending ? 'bad' : ''}`}><span>{t('Tasdiq kutmoqda')}</span><strong>{data.summary.pending}</strong><small>{t('ta’til, buyruq va hujjatlar')}</small></div>
    </div>
    <div className="hrx-two">
      <div className="hrx-card">
        {extra.month ? <Chart type="stack" height={230} title={t('{m} davomati: o‘rtacha {p}% ishda', { m: month, p: avgWork })} sub={t('Har kun nechta xodim ishda, ta’tilda, kasal yoki kelmagan')} labels={labels} series={series} xfmt={(x) => x} />
          : <><h3>{t('Oy davomati')}</h3><p className="hrx-empty">{t('Bu oy hali ochilmagan. Tabel sahifasida hisob oyini oching.')}</p><button className="btn" onClick={() => onViewChange('time')}>{t('Tabel')}</button></>}
      </div>
      <div className="hrx-card"><h3>{t('Bugun nima qilish kerak')}</h3>
        {todo.length ? <div className="hrx-todo">{todo.map(([tone, title, sub, view], i) => <div className={`hrx-item ${tone}`} key={i}><div><b>{title}</b><small>{sub}</small></div>{view && <button className="btn sm" onClick={() => onViewChange(view)}>{t('Ochish')}</button>}</div>)}</div>
          : <p className="hrx-empty">{t('Hozircha shoshilinch ish yo‘q')}</p>}
      </div>
    </div>
    <div className="hrx-even">
      <div className="hrx-card"><h3>{t('Bo‘limlar bo‘yicha xodimlar')}</h3>
        {depts.length ? <div className="hrx-rows">{depts.map(([d, n]) => <div className="hrx-row" key={d}><span title={show(d)}>{show(d)}</span><div className="hrx-bar"><b style={{ width: `${(n / maxDept) * 100}%` }} /></div><em>{t('{n} kishi', { n })}</em></div>)}</div> : <p className="hrx-empty">{t('Xodimlar hali kiritilmagan')}</p>}
      </div>
      <div className="hrx-card"><h3>{t('Shtat to‘lganligi')}</h3>
        {slots ? <><p className="hrx-big">{pct(occupied, slots)}%</p><p className="hrx-empty">{t('{a} band · {b} shtat · {c} bo‘sh o‘rin', { a: occupied, b: slots, c: Math.max(0, slots - occupied) })}</p>
          <div className="hrx-rows">{[...staffDept].map(([d, [o, s]]) => { const p = pct(o, s); return <div className="hrx-row" key={d}><span title={show(d)}>{show(d)}</span><div className={`hrx-bar ${p > 100 ? 'bad' : p < 80 ? 'warn' : 'ok'}`}><b style={{ width: `${Math.min(100, p)}%` }} /></div><em>{o}/{s}</em></div>; })}</div>
          <button className="btn sm" style={{ marginTop: 12 }} onClick={() => onViewChange('staff')}>{t('Shtat jadvali')}</button></>
          : <><p className="hrx-empty">{t('Shtat jadvali hali kiritilmagan')}</p><button className="btn sm" onClick={() => onViewChange('staff')}>{t('Shtat jadvali')}</button></>}
      </div>
    </div>
    <div className="hrx-card"><h3>{t('Oxirgi amallar')}</h3>
      {(data.events || []).length ? <ul className="hrx-log">{data.events.slice(0, 10).map((e) => <li key={e.id}><span>{show(e.actor?.name)} · {t(EVENT[e.action] || e.action)} · {name(e.entityId)}</span><small>{new Date(e.createdAt).toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent', dateStyle: 'short', timeStyle: 'short' })}</small></li>)}</ul> : <p className="hrx-empty">{t('Hali amal yo‘q')}</p>}
    </div>
  </>;
}
