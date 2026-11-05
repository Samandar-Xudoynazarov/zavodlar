import { newWorkbook, deliver } from './excel';

const CODES = { work: 'I', off: 'D', leave: 'T', sick: 'K', absent: 'Y', trip: 'XS' };

// A printable monthly register: status and hours remain separate, including trips.
export async function exportTimesheet({ month, employees, doc, company, t, blank = false }) {
  const wb = await newWorkbook();
  const count = new Date(+month.slice(0, 4), +month.slice(5), 0).getDate();
  const last = count + 8;
  wb.calcProperties.fullCalcOnLoad=true;
  const ws = wb.addWorksheet(t('Tabel'), {
    views: [{ state: 'frozen', xSplit: 4, ySplit: 5, showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.2, right: 0.2, top: 0.3, bottom: 0.3, header: 0.1, footer: 0.15 } },
    headerFooter: { oddFooter: `&L${month}&R&P / &N` },
  });
  [4, 8, 25, 16].forEach((width, i) => { ws.getColumn(i + 1).width = width; });
  for (let d = 1; d <= count; d++) ws.getColumn(d + 4).width = 3.6;
  for(let col=count+5;col<=last;col++)ws.getColumn(col).width=8;
  const line = { style: 'thin', color: { argb: 'FF94A3B8' } };
  function banner(row, value, size = 10) {
    ws.mergeCells(row, 1, row, last);
    const cell = ws.getCell(row, 1); cell.value = value;
    cell.font = { name: 'Arial', size, bold: row === 1 };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    ws.getRow(row).height = row === 1 ? 25 : 23;
  }
  banner(1, `${t(blank?'Bo‘sh tabel namunasi':'Oylik tabel')} — ${month}`, 14);
  banner(2, [company, `${t('Oy normasi')}: ${doc.normHours} ${t('soat')}`,
    t({ draft: 'Qoralama', approved: 'Tasdiqlangan', closed: 'Yopilgan' }[doc.status])].filter(Boolean).join(' · '));
  const headings = ['№', t('Tabel raqami'), t('F.I.Sh.'), t('Sex / bo‘lim')];
  headings.forEach((title, i) => { ws.mergeCells(4, i + 1, 5, i + 1); ws.getCell(4, i + 1).value = title; });
  for (let d = 1; d <= count; d++) {
    const date = `${month}-${String(d).padStart(2, '0')}`;
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    ws.getCell(4, d + 4).value = d;
    ws.getCell(5, d + 4).value = t(['Ya', 'Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh'][weekday]);
  }
  [t('Ish kuni'), t('Ish soati'),t('1–15 soat'),t('16–oy oxiri soat')].forEach((title, i) => {
    ws.mergeCells(4, count+5+i, 5, count+5+i); ws.getCell(4,count+5+i).value=title;
  });
  employees.forEach((e, index) => {
    const row = 6 + index * 2, days = blank?{}:doc.attendance[e.id] || {};
    [index + 1, e.code, [e.name,e.position].filter(Boolean).join('\n'), e.department].forEach((value, i) => {
      ws.mergeCells(row, i + 1, row + 1, i + 1); ws.getCell(row, i + 1).value = value || '';
    });
    for (let d = 1; d <= count; d++) {
      const v = days[d]; ws.getCell(row, d + 4).value = v ? CODES[v.status] || '' : '';
      ws.getCell(row + 1, d + 4).value = v && ['work', 'trip'].includes(v.status) ? +v.hours : null;
      ws.getCell(row + 1, d + 4).numFmt = 'General';
    }
    const values=Object.values(days),range=`E${row+1}:${ws.getColumn(count+4).letter}${row+1}`;
    const first=Object.entries(days).filter(([d])=>+d<=15).reduce((s,[,v])=>s+(+v.hours||0),0),second=Object.entries(days).filter(([d])=>+d>15).reduce((s,[,v])=>s+(+v.hours||0),0);
    const totals=[{formula:`COUNTIF(${range},">0")`,result:values.filter(v=>+v.hours>0).length},{formula:`SUM(${range})`,result:values.reduce((s,v)=>s+(+v.hours||0),0)},{formula:`SUM(E${row+1}:S${row+1})`,result:first},{formula:`SUM(T${row+1}:${ws.getColumn(count+4).letter}${row+1})`,result:second}];
    totals.forEach((value,i)=>{ws.mergeCells(row,count+5+i,row+1,count+5+i);ws.getCell(row,count+5+i).value=value;ws.getCell(row,count+5+i).numFmt='General';});
    // Keep each employee's pair of rows together on successive printed pages.
    if (index > 0 && index % 12 === 0) ws.getRow(row - 1).addPageBreak();
  });
  const end = 5 + employees.length * 2;
  for (let r = 4; r <= end; r++) {
    ws.getRow(r).height = r <= 5 ? 22 : 18;
    for (let c = 1; c <= last; c++) {
      const cell = ws.getCell(r, c);
      cell.font = { name: 'Arial', size: 9, bold: r <= 5 };
      cell.alignment = { horizontal: c === 3 || c === 4 ? 'left' : 'center', vertical: 'middle', wrapText: true };
      cell.border = { top: line, bottom: line, left: line, right: line };
      if(r>5&&c>=5&&c<=count+4&&(!(doc.workDays||[1,2,3,4,5]).includes(new Date(`${month}-${String(c-4).padStart(2,'0')}T00:00:00Z`).getUTCDay())||(doc.holidays||[]).includes(`${month}-${String(c-4).padStart(2,'0')}`)))cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF1F5F9'}};
      if (r <= 5) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    }
  }
  banner(end + 2, Object.entries(CODES).map(([key, code]) => `${code} — ${t({work:'Ishda',off:'Dam olish',leave:"Ta'til",sick:'Kasallik',absent:'Kelmagan',trip:'Xizmat safari'}[key])}`).join('; '), 9);
  banner(end + 3, t('Yuqori qatorda holat, pastki qatorda ish soati. Bo‘sh katak — belgilanmagan.'), 9);
  banner(end + 5, `${t('Mas’ul xodim')}: ____________________                 ${t('Imzo')}: ____________________`, 10);
  banner(end+6,`${t('Bo‘lim rahbari')}: ____________________                 ${t('Kadrlar bo‘yicha mas’ul')}: ____________________`,10);
  ws.pageSetup.printTitlesRow = '1:5';
  ws.pageSetup.printArea = `A1:${ws.getColumn(last).letter}${end + 6}`;
  return deliver(wb, `Tabel_${month}${blank?'_bosh':''}.xlsx`);
}
