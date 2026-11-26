// Kadrlar bo'limi kartochkali ko'rinishi uchun umumiy yordamchilar (pulsiz: faqat xodim, davomat va hujjatlar)
export const AV_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#b7791f', '#7c5cd6', '#0f8a8a', '#c2410c', '#475569'];
export function avatarColor(seed) {
  let h = 0;
  for (const ch of String(seed || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AV_COLORS[h % AV_COLORS.length];
}
export const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || '?';

export const DAY_STATUS = {
  work: ['Ishda', 'ok'], trip: ['Safarda', 'info'], leave: ['Ta’tilda', 'info'],
  sick: ['Kasal', 'warn'], absent: ['Kelmagan', 'bad'], off: ['Dam olish', ''],
};
export const daysIn = (month) => new Date(+month.slice(0, 4), +month.slice(5), 0).getDate();
export const dateOf = (month, d) => `${month}-${String(d).padStart(2, '0')}`;
export const employedOn = (e, date) => !!e?.hireDate && e.hireDate <= date && (!e.endDate || e.endDate >= date);
export const isWeekend = (date, workDays = [1, 2, 3, 4, 5]) => !workDays.includes(new Date(date + 'T00:00:00Z').getUTCDay());

/** Kunning holati: work | trip | leave | sick | absent | off | none (belgilanmagan) | out (ish davridan tashqari) */
export function cellStatus(e, attendance, month, d) {
  const date = dateOf(month, d);
  if (!employedOn(e, date)) return 'out';
  const v = attendance?.[e.id]?.[d];
  return v?.status || 'none';
}

/** Oy bo'yicha kunlik jamlanma (grafik uchun): har kun nechta xodim qaysi holatda */
export function monthTotals(employees, attendance, month, lastDay) {
  const out = [];
  for (let d = 1; d <= lastDay; d++) {
    const row = { work: 0, leave: 0, sick: 0, absent: 0, none: 0 };
    for (const e of employees) {
      const s = cellStatus(e, attendance, month, d);
      if (s === 'out' || s === 'off') continue;
      if (s === 'work' || s === 'trip') row.work++;
      else if (s in row) row[s]++;
    }
    out.push(row);
  }
  return out;
}

/** Ish staji: "3 yil 2 oy" uchun yil va oy */
export function tenure(hireDate, endDate, today) {
  if (!hireDate) return null;
  const end = endDate && endDate < today ? endDate : today;
  const [y1, m1, d1] = hireDate.split('-').map(Number), [y2, m2, d2] = end.split('-').map(Number);
  let months = (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
  if (months < 0) months = 0;
  return { years: Math.floor(months / 12), months: months % 12 };
}

/** Yillik ta'tildan ishlatilgan kunlar (workforce.js dagi annualDays bilan bir xil) */
export function annualUsed(records, employeeId, year) {
  let used = 0;
  for (const r of records || []) {
    if (r.employeeId !== employeeId || r.kind !== 'leave' || r.status !== 'approved' || r.detail?.leaveType !== 'annual') continue;
    const start = r.startDate > `${year}-01-01` ? r.startDate : `${year}-01-01`;
    const end = r.endDate < `${year}-12-31` ? r.endDate : `${year}-12-31`;
    if (start <= end) used += Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
  }
  return used;
}

export const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
