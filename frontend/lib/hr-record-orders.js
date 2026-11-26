// Kadrlar yozuvlaridan buyruq va jadval PDF shakllari: ta'til buyrug'i, rag'batlantirish, intizomiy jazo,
// yillik ta'tillar jadvali. Matn kirill yozuvida (zavoddagi boshqa buyruqlar kabi). Summalar yozilmaydi:
// pul mukofoti yoki jarima miqdori qo'lda to'ldiriladi, oylikka esa buxgalter kiritadi.
const val = (s) => (s === 0 ? '0' : String(s || '________________'));
const dt = (s) => (s ? s.split('-').reverse().join('.') : '__.__.____');
const para = (text, options = {}) => ({ text, alignment: 'justify', margin: [0, 0, 0, 9], ...options });
const line = (w = 495) => ({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: w, y2: 0, lineWidth: 0.7 }], margin: [0, 10, 0, 16] });
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1;

export const RECORD_ORDER_TITLES = {
  leave: 'Ходимга меҳнат таътили бериш тўғрисида',
  unpaid: 'Ходимга иш ҳақи сақланмайдиган таътил бериш тўғрисида',
  reward: 'Ходимни рағбатлантириш тўғрисида',
  penalty: 'Интизомий жазо қўллаш тўғрисида',
};
/** Yozuvdan buyruq chiqadimi: tasdiqlangan yoki qoralama ta'til, rag'batlantirish va jazo */
export const hasRecordOrder = (r) => r.status !== 'cancelled' && (r.kind === 'leave' || (r.kind === 'order' && ['reward', 'penalty'].includes(r.detail?.orderType)));
export const recordOrderKind = (r) => (r.kind === 'leave' ? (r.detail?.leaveType === 'unpaid' ? 'unpaid' : 'leave') : r.detail?.orderType);

function header(em, C) {
  return [
    ...(em.logo ? [{ image: em.logo, fit: [90, 45], alignment: 'center', margin: [0, 0, 0, 6] }] : []),
    { text: `«${C(val(em.company))}»`, bold: true, alignment: 'center', fontSize: 13 },
    { text: [C(em.legalForm || ''), em.address ? `\n${C(em.address)}` : '', em.phone ? `  Тел. ${em.phone}` : ''].join(''), alignment: 'center', fontSize: 10, margin: [0, 2, 0, 0] },
    line(),
  ];
}

export function recordOrderDefinition({ record: r, employee: e, employer: em = {}, cyr = (s) => s }) {
  const C = (s) => cyr(String(s || '')), d = r.detail || {}, kind = recordOrderKind(r);
  const lc = (x) => (x ? x[0].toLocaleLowerCase('uz') + x.slice(1) : x), name = C(e.name), job = lc(C(e.position || '—')), dept = e.department ? `${C(e.department)} бўлими ` : '';
  const who = `${dept}${job} ${name}`;
  let text = [], basis = '';
  if (kind === 'leave' || kind === 'unpaid') {
    const days = daysBetween(r.startDate, r.endDate);
    text = kind === 'leave'
      ? [`${who}га ${dt(r.startDate)} санадан ${dt(r.endDate)} санагача ${days} календар кун муддатга йиллик меҳнат таътили берилсин.`,
        'Ходим таътил тугагач, навбатдаги иш кунида ишга чиқсин.',
        'Бухгалтерия таътил ҳақини қонунчиликда белгиланган тартибда ва муддатда ҳисоблаб тўласин.']
      : [`${who}га унинг аризасига кўра ${dt(r.startDate)} санадан ${dt(r.endDate)} санагача ${days} календар кун муддатга иш ҳақи сақланмайдиган таътил берилсин.`,
        'Ходим таътил тугагач, навбатдаги иш кунида ишга чиқсин.'];
    basis = `${d.note ? C(d.note) + '; ' : ''}ходимнинг аризаси${kind === 'leave' ? ', йиллик таътиллар жадвали' : ''}; Ўзбекистон Республикаси Меҳнат кодекси.`;
  } else if (kind === 'reward') {
    const why = C(d.basis);
    text = [{
      gratitude: `${who}га ${why} учун ташаккур эълон қилинсин.`,
      bonus: `${who} ${why} учун пул мукофоти билан рағбатлантирилсин. Мукофот миқдори: ______________________ сўм.`,
      gift: `${who} ${why} учун қимматбаҳо совға билан тақдирлансин.`,
      honor: `${who} ${why} учун Фахрий ёрлиқ билан тақдирлансин.`,
    }[d.rewardType] || `${who} ${why} учун рағбатлантирилсин.`];
    if (d.rewardType === 'bonus') text.push('Бухгалтерия мукофотни белгиланган тартибда ҳисобласин ва тўласин.');
    text.push('Буйруқдан кўчирма ходимнинг шахсий делосига қўшилсин.');
    basis = `${d.note ? C(d.note) + '; ' : ''}бўлим раҳбарининг тақдимномаси; Ўзбекистон Республикаси Меҳнат кодекси.`;
  } else if (kind === 'penalty') {
    const measure = { reprimand: 'ҳайфсан', fine: 'жарима (миқдори: ______________ сўм)' }[d.penaltyType] || '______________';
    text = [`${who} ${dt(d.violationDate)} санада ${C(d.basis)} — меҳнат интизомини бузгани учун унга нисбатан ${measure} интизомий жазоси қўллансин.`,
      d.explanation === 'refused'
        ? 'Ходим ёзма тушунтириш беришдан бош тортгани ҳақида далолатнома тузилган.'
        : 'Ходимдан ёзма тушунтириш олинган ва кўриб чиқилган.',
      'Интизомий жазо қўлланган кундан бошлаб бир йил давомида ходимга янги интизомий жазо қўлланмаса, у интизомий жазога тортилмаган деб ҳисоблансин.',
      'Буйруқ ходимга имзо қўйдириб эълон қилинсин.'];
    if (d.penaltyType === 'fine') text.splice(1, 0, 'Бухгалтерия жарима суммасини қонунчиликда белгиланган чегарада ушлаб қолсин.');
    basis = `${d.note ? C(d.note) + '; ' : ''}ходимнинг ёзма тушунтириши ёки далолатнома; Ўзбекистон Республикаси Меҳнат кодекси.`;
  }
  const content = [
    ...header(em, C),
    { text: 'Б У Й Р У Қ', alignment: 'center', bold: true, fontSize: 16, margin: [0, 0, 0, 22] },
    { columns: [{ text: `№ ${val(d.number)}`, bold: true }, { text: dt(d.orderDate || r.startDate), alignment: 'right', bold: true }], margin: [0, 0, 0, 16] },
    para(`«${RECORD_ORDER_TITLES[kind] || C(r.title)}»`, { bold: true }),
    ...text.map((s, i) => para(`${i + 1}. ${s}`)),
    para(`${text.length + 1}. Ходимлар билан ишлаш бўйича масъул мазкур буйруқ билан ходимни таништирсин.`),
    para(`Асос: ${basis}`, { bold: true, italics: true, margin: [0, 8, 0, 22] }),
    { columns: [{ text: C(em.directorTitle || 'Директор'), bold: true }, { text: `________________  ${C(val(em.director))}`, bold: true, alignment: 'right' }], margin: [0, 16, 0, 20] },
    para(`Кадрлар бўйича масъул: ______________  ${C(val(em.hrName))}`, { fontSize: 11 }),
    para('Буйруқ билан танишдим ва бир нусхасини олдим:', { bold: true, margin: [0, 10, 0, 6] }),
    { text: `Ходим: __________________   ${name}          Сана: ____.____.________`, margin: [0, 10, 0, 0] },
  ];
  if (r.status === 'draft') content.push({ text: 'ҚОРАЛАМА — ҲАЛИ ТАСДИҚЛАНМАГАН', fontSize: 8, color: '#666666', margin: [0, 22, 0, 0] });
  return { pageSize: 'A4', pageMargins: [55, 42, 45, 42], defaultStyle: { font: 'Times', fontSize: 12, lineHeight: 1.15 }, info: { title: RECORD_ORDER_TITLES[kind] || r.title, author: em.company || '' }, content };
}

/** Yillik ta'tillar jadvali. rows: [{employee, allowance, leaves:[record]}] */
export function leaveScheduleDefinition({ year, rows, employer: em = {}, cyr = (s) => s }) {
  const C = (s) => cyr(String(s || '')), cell = (text, o = {}) => ({ text, fontSize: 9, ...o }), head = (text) => cell(text, { bold: true, alignment: 'center', fillColor: '#eeeeee' });
  const period = (r) => `${dt(r.startDate)} — ${dt(r.endDate)} (${daysBetween(r.startDate, r.endDate)} кун)`;
  const body = [[head('№'), head('Бўлим'), head('Лавозим'), head('Ф.И.Ш.'), head('Таб. №'), head('Таътил кунлари'), head('Режалаштирилган сана'), head('Ҳақиқий сана / ҳолат'), head('Ходим имзоси (танишдим)'), head('Изоҳ')]];
  rows.forEach(({ employee: e, allowance: a, leaves }, i) => {
    const plan = leaves.map(period).join('\n'), done = leaves.filter((r) => r.status === 'approved').map(period).join('\n');
    body.push([cell(String(i + 1), { alignment: 'center' }), cell(C(e.department || '—')), cell(C(e.position || '—')), cell(C(e.name)), cell(String(e.code || ''), { alignment: 'center' }),
      cell(a ? String(a.days) : '', { alignment: 'center' }), cell(plan || ''), cell(done || (leaves.length ? 'Тасдиқланмаган' : '')), cell(''), cell('')]);
  });
  return {
    pageSize: 'A4', pageOrientation: 'landscape', pageMargins: [30, 30, 30, 30],
    defaultStyle: { font: 'Times', fontSize: 10, lineHeight: 1.1 },
    info: { title: `${year} йил таътиллар жадвали`, author: em.company || '' },
    content: [
      { columns: [{ width: '*', text: [{ text: `«${C(val(em.company))}»\n`, bold: true }, em.address ? C(em.address) : ''], fontSize: 10 },
        { width: 260, text: [{ text: 'ТАСДИҚЛАЙМАН\n', bold: true }, `${C(em.directorTitle || 'Директор')}  ______________  ${C(val(em.director))}\n`, '«____» ______________ 20____ йил\n', 'М.Ў.'], fontSize: 10, alignment: 'left' }] },
      { text: `${year} ЙИЛ УЧУН ЙИЛЛИК МЕҲНАТ ТАЪТИЛЛАРИ ЖАДВАЛИ`, alignment: 'center', bold: true, fontSize: 14, margin: [0, 16, 0, 12] },
      { table: { headerRows: 1, widths: [18, 70, 80, '*', 34, 42, 110, 100, 64, 50], body, dontBreakRows: true }, layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => '#888888', vLineColor: () => '#888888' } },
      { text: 'Таътил кунлари календар кунларда. Режалаштирилган сана ходимнинг аризаси ва ишлаб чиқариш эҳтиёжини ҳисобга олиб белгиланади.', fontSize: 8.5, color: '#444444', margin: [0, 8, 0, 18] },
      { columns: [{ text: `Тузди: Кадрлар бўлими ходими  ______________  ${C(val(em.hrName))}`, fontSize: 10 }, { text: 'Сана: ____.____.________', fontSize: 10, alignment: 'right' }] },
    ],
  };
}
