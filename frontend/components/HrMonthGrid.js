"use client";
import { show, useT } from '@/lib/i18n';
import { fmtN, today } from '@/lib/calc';
import { DAY_STATUS, cellStatus, daysIn, dateOf } from '@/lib/hr-ui';

const LETTER = { trip: 'S', leave: 'T', sick: 'K', absent: 'Y' };
const WEEK = ['Ya', 'Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh'];

/** Oylik tabelning rangli ko'rinishi (faqat ko'rish). Katakni bossangiz o'sha xodim kalendari ochiladi. */
export default function HrMonthGrid({ employees, doc, month, onPick }) {
  const t = useT();
  const last = daysIn(month), days = Array.from({ length: last }, (_, i) => i + 1);
  const rest = d => { const date = dateOf(month, d); return !doc.workDays.includes(new Date(date + 'T00:00:00Z').getUTCDay()) || doc.holidays.includes(date); };
  const groups = [];
  for (const e of employees) {
    const name = e.department || '';
    let g = groups.find(x => x.name === name);
    if (!g) groups.push(g = { name, list: [] });
    g.list.push(e);
  }
  const dayHours = days.map(() => 0);
  let unmarked = 0;
  const now = today();
  const rows = groups.map(g => ({ ...g, list: g.list.map(e => {
    const vals = doc.attendance[e.id] || {};
    let worked = 0, hours = 0;
    const cells = days.map(d => {
      const st = cellStatus(e, doc.attendance, month, d), v = vals[d], h = +v?.hours || 0;
      if (h > 0) { worked++; hours += h; dayHours[d - 1] += h; }
      if (st === 'none' && !rest(d) && dateOf(month, d) <= now) unmarked++;
      return { d, st: st === 'none' && (rest(d) || dateOf(month, d) > now) ? 'off' : st, h };
    });
    return { e, cells, worked, hours };
  }) }));
  const label = st => st === 'none' ? 'Belgilanmagan' : st === 'out' ? 'Ish davridan tashqari' : DAY_STATUS[st]?.[0] || st;
  return <div className="hr-month-grid">
    <div className="hrx-legend" style={{ margin: '0 0 10px' }}>
      <span><i style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent)' }}/>8 — {t('ishlagan soat')}</span>
      <span><i style={{ background: 'var(--s3)' }}/>T — {t('ta’til')}</span>
      <span><i style={{ background: 'var(--s4)' }}/>K — {t('kasal')}</span>
      <span><i style={{ background: 'var(--s2)' }}/>Y — {t('kelmagan')}</span>
      <span><i style={{ background: '#7c5cd6' }}/>S — {t('safar')}</span>
      <span><i style={{ background: 'var(--paper)', border: '1px solid var(--line)' }}/>{t('dam olish kuni')}</span>
      <span><i style={{ border: '1px dashed var(--ink-3)' }}/>{t('belgilanmagan')}</span>
    </div>
    {unmarked > 0 && <p className="notice">{t('Bugungacha belgilanmagan ish kunlari')}: {unmarked}</p>}
    <div className="hrx-grid" role="region" aria-label={t('Oylik tabel')} tabIndex={0}>
      <table>
        <thead><tr><th className="nm">{t('Xodim')}</th>{days.map(d => <th key={d} className={rest(d) ? 'wk' : ''}>{d}<br/>{t(WEEK[new Date(dateOf(month, d) + 'T00:00:00Z').getUTCDay()])}</th>)}<th>{t('Ish kuni')}</th><th>{t('Ish soati')}</th></tr></thead>
        <tbody>
          {rows.map(g => [
            <tr key={'g' + g.name} className="grp"><td colSpan={last + 3}>{g.name ? show(g.name) : t('Bo‘limsiz')} · {g.list.length}</td></tr>,
            ...g.list.map(({ e, cells, worked, hours }) => <tr key={e.id}>
              <td className="nm"><b>{show(e.name)}</b><small>{e.code} · {show(e.position) || '—'}</small></td>
              {cells.map(({ d, st, h }) => <td key={d} className={rest(d) ? 'wk' : ''}>
                {st === 'out'
                  ? <span className="hrx-cell out" aria-hidden="true"/>
                  : <button type="button" className={`hrx-cell ${st}`} title={`${String(d).padStart(2, '0')}.${month.slice(5)} · ${t(label(st))}${h ? ` · ${fmtN(h, 2)} ${t('soat')}` : ''}`} aria-label={`${show(e.name)}, ${d}: ${t(label(st))}`} onClick={() => onPick?.(e.id, d)}>
                    {st === 'work' ? (h ? fmtN(h, 1) : '') : LETTER[st] || ''}
                  </button>}
              </td>)}
              <td className="tot">{worked}</td><td className="tot">{fmtN(hours, 2)}</td>
            </tr>),
          ])}
          {!!employees.length && <tr className="grp"><td className="nm">{t('Jami')}</td>{dayHours.map((h, i) => <td key={i} className={rest(i + 1) ? 'wk' : ''} style={{ fontSize: 10.5 }}>{h ? fmtN(h, 0) : ''}</td>)}<td className="tot">{rows.reduce((s, g) => s + g.list.reduce((a, r) => a + r.worked, 0), 0)}</td><td className="tot">{fmtN(dayHours.reduce((a, b) => a + b, 0), 2)}</td></tr>}
        </tbody>
      </table>
    </div>
    {!employees.length && <p className="empty">{t('Xodimlar hali kiritilmagan')}</p>}
    <p className="hint">{t('Katakni bosing: o‘sha xodimning oylik kalendari ochiladi va kunni tahrirlash mumkin.')}</p>
  </div>;
}
