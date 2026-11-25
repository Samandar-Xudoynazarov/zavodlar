// Mijoz bo'yicha hisob (sof funksiyalar — bazaga bog'liq emas, testda to'g'ridan-to'g'ri chaqiriladi).
// Qarz = boshlang'ich qoldiq + fakturalar (QQS bilan) − to'lovlar. Jo'natilgan, lekin faktura yozilmagan summa alohida ko'rsatiladi.
import { itemsOf } from './orders.js';

const r2 = (x) => Math.round((+x || 0) * 100) / 100;
/** Mijoz kaliti: bo'sh joylar va harf katta-kichikligi hisobga olinmaydi */
export const customerKey = (name) => String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();
export const customerName = (name) => String(name || '').trim().replace(/\s+/g, ' ');
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
const METHOD = { bank: 'bank', naqd: 'naqd', karta: 'karta' };

/** To'lovning qaysi mijozga tegishliligi */
const receiptCustomer = (p, orderById) => customerKey(orderById.get(p.orderId)?.customer || p.customer);

/**
 * orders: [{id,no,customer,contractNo,items,status}]
 * shipments: [{date,orderId,productId,qty,dispatchNo,source}] — kunlik hisobot va eski jo'natmalar
 * invoices: [{id,orderId,number,date,dueDate,net,vat,amount,items,voidedAt}]
 * receipts: [{id,orderId,customer,invoiceId,date,amount,method,docNumber,note,voidedAt}]
 * openings: [{id,customer,inn,date,kind:'debt'|'advance',amount,note,voidedAt}]
 * locks: Set('YYYY-MM') — yopilgan oylar (hodisalarda «qulflangan» belgisi uchun)
 */
export function customerLedger({ orders = [], shipments = [], invoices = [], receipts = [], openings = [], today, locks = new Set() }) {
  const orderById = new Map(orders.map((o) => [o.id, o]));
  const priceOf = new Map();
  for (const o of orders) for (const it of itemsOf(o)) priceOf.set(o.id + ':' + it.productId, +it.price || 0);
  const acc = new Map();
  const get = (name) => {
    const key = customerKey(name);
    if (!acc.has(key)) acc.set(key, { key, name: customerName(name) || '—', inn: '', orders: new Map(), opening: 0, openingEntry: null, shipped: 0, unpricedQty: 0, invoiced: 0, net: 0, vat: 0, paid: 0, overdueInvoices: 0, oldestDue: '', nextDue: '', invoices: [], events: [] });
    return acc.get(key);
  };
  const orderAcc = (c, o) => {
    if (!c.orders.has(o.id)) {
      const lines = itemsOf(o);
      const total = lines.reduce((s, it) => s + (+it.qty || 0) * (+it.price || 0), 0);
      c.orders.set(o.id, { id: o.id, no: o.no, contractNo: o.contractNo || '', status: o.status, total: r2(total), unpricedLines: lines.filter((it) => !(+it.price > 0)).length, shipped: 0, shippedQty: 0, unpricedQty: 0, invoiced: 0, paid: 0 });
    }
    return c.orders.get(o.id);
  };
  for (const o of orders) orderAcc(get(o.customer), o);
  for (const op of openings) {
    if (op.voidedAt) continue;
    const c = get(op.customer), signed = op.kind === 'debt' ? +op.amount : -op.amount;
    c.opening = r2(c.opening + signed); c.openingEntry = op; if (op.inn) c.inn = op.inn;
    c.events.push({ id: op.id, type: 'opening', date: op.date, title: op.kind === 'debt' ? 'Boshlang‘ich qarz' : 'Boshlang‘ich avans', sub: op.note || '', amount: r2(signed), affects: true });
  }
  // «Oldin jo'natilgan» (sanasiz) miqdorlar ham jo'natilgan summaga kiradi
  for (const o of orders) for (const it of itemsOf(o)) {
    const q = +it.shippedBefore || 0; if (!q) continue;
    const c = get(o.customer), oa = orderAcc(c, o), price = +it.price || 0;
    oa.shippedQty += q;
    if (price > 0) { oa.shipped += q * price; c.shipped += q * price; } else { oa.unpricedQty += q; c.unpricedQty += q; }
  }
  for (const s of shipments) {
    const o = orderById.get(s.orderId); if (!o) continue;
    const c = get(o.customer), oa = orderAcc(c, o), q = +s.qty || 0, price = priceOf.get(s.orderId + ':' + s.productId) || 0;
    oa.shippedQty += q;
    if (price > 0) { oa.shipped += q * price; c.shipped += q * price; } else { oa.unpricedQty += q; c.unpricedQty += q; }
    c.events.push({ id: (s.id || '') + ':' + s.orderId + ':' + s.productId + ':' + s.date, type: 'shipment', date: s.date, title: 'Nakladnoy' + (s.dispatchNo ? ' №' + s.dispatchNo : ''), sub: `Buyurtma №${o.no} · ${q} dona${s.source === 'legacy' ? ' · eski jo‘natma' : ''}${price > 0 ? '' : ' · narx kiritilmagan'}`, amount: r2(q * price), affects: false, orderId: o.id });
  }
  const paidByInvoice = new Map();
  for (const p of receipts) if (!p.voidedAt && p.invoiceId) paidByInvoice.set(p.invoiceId, (paidByInvoice.get(p.invoiceId) || 0) + (+p.amount || 0));
  for (const i of invoices) {
    if (i.voidedAt) continue;
    const o = orderById.get(i.orderId); if (!o) continue;
    const c = get(o.customer), oa = orderAcc(c, o);
    const amount = +i.amount || 0, net = i.net == null ? amount : +i.net, vat = +i.vat || 0;
    oa.invoiced += amount; c.invoiced += amount; c.net += net; c.vat += vat;
    const remaining = r2(amount - (paidByInvoice.get(i.id) || 0));
    const overdue = !!(i.dueDate && today && i.dueDate < today && remaining > 0.004);
    if (overdue) { c.overdueInvoices += remaining; if (!c.oldestDue || i.dueDate < c.oldestDue) c.oldestDue = i.dueDate; }
    else if (i.dueDate && remaining > 0.004 && (!c.nextDue || i.dueDate < c.nextDue)) c.nextDue = i.dueDate;
    c.invoices.push({ id: i.id, orderId: o.id, orderNo: o.no, number: i.number, date: i.date, dueDate: i.dueDate || null, net: r2(net), vat: r2(vat), amount: r2(amount), remaining, overdue });
    c.events.push({ id: i.id, type: 'invoice', date: i.date, title: 'Faktura №' + i.number, sub: vat ? `QQSsiz ${r2(net)} · QQS ${r2(vat)}` : 'QQSsiz', amount: r2(amount), affects: true, orderId: o.id, dueDate: i.dueDate || null });
  }
  for (const p of receipts) {
    if (p.voidedAt) continue;
    const key = receiptCustomer(p, orderById); if (!key) continue;
    const o = orderById.get(p.orderId);
    const c = o ? get(o.customer) : get(p.customer);
    c.paid += +p.amount || 0;
    if (o) orderAcc(c, o).paid += +p.amount || 0;
    const inv = p.invoiceId ? invoices.find((x) => x.id === p.invoiceId) : null;
    c.events.push({ id: p.id, type: 'receipt', date: p.date, title: (inv ? 'To‘lov' : 'Avans / umumiy to‘lov') + ' · ' + (METHOD[p.method] || 'bank'), sub: [p.docNumber ? 'Hujjat №' + p.docNumber : '', inv ? 'Faktura №' + inv.number : '', o ? 'Buyurtma №' + o.no : ''].filter(Boolean).join(' · '), amount: r2(-(+p.amount || 0)), affects: true, orderId: o?.id || null, invoiceId: p.invoiceId || null });
  }
  const out = [];
  for (const c of acc.values()) {
    const debt = r2(c.opening + c.invoiced - c.paid);
    const notInvoiced = r2(Math.max(0, c.shipped - c.invoiced));
    const overdue = r2(Math.min(Math.max(debt, 0), c.overdueInvoices));
    const ordersList = [...c.orders.values()].map((o) => ({ ...o, shipped: r2(o.shipped), invoiced: r2(o.invoiced), paid: r2(o.paid) })).sort((a, b) => b.no - a.no);
    const unpricedLines = ordersList.reduce((s, o) => s + o.unpricedLines, 0);
    const status = overdue > 0 ? 'overdue' : debt > 0.004 || notInvoiced > 0.004 ? 'waiting' : debt < -0.004 ? 'advance' : 'closed';
    const events = c.events.sort((a, b) => (b.date || '').localeCompare(a.date || '') || order(b.type) - order(a.type))
      .map((e) => ({ ...e, locked: locks.has(String(e.date || '').slice(0, 7)) }));
    out.push({ key: c.key, name: c.name, inn: c.inn, opening: c.opening, openingEntry: c.openingEntry, shipped: r2(c.shipped), unpricedQty: c.unpricedQty, unpricedLines, invoiced: r2(c.invoiced), net: r2(c.net), vat: r2(c.vat), paid: r2(c.paid), debt, notInvoiced, overdue, overdueDays: overdue > 0 && c.oldestDue ? daysBetween(c.oldestDue, today) : 0, nextDue: c.nextDue || null, status, orders: ordersList, invoices: c.invoices.sort((a, b) => a.date.localeCompare(b.date)), events });
  }
  const rank = { overdue: 0, waiting: 1, advance: 2, closed: 3 };
  return out.sort((a, b) => rank[a.status] - rank[b.status] || b.debt - a.debt || a.name.localeCompare(b.name));
}
const order = (t) => ({ opening: 0, shipment: 1, invoice: 2, receipt: 3 }[t] ?? 9);

/**
 * Solishtirma dalolatnoma (akt sverka) — istalgan davr uchun.
 * Debet: boshlang'ich qarz, fakturalar. Kredit: to'lovlar, boshlang'ich avans. Jo'natmalar kirmaydi (realizatsiya fakturada).
 */
export function customerStatement(customer, from, to) {
  const moves = customer.events.filter((e) => e.affects).slice().sort((a, b) => a.date.localeCompare(b.date) || order(a.type) - order(b.type));
  const initial = r2(moves.filter((e) => e.date < from).reduce((s, e) => s + e.amount, 0));
  const entries = moves.filter((e) => e.date >= from && e.date <= to)
    .map((e) => ({ date: e.date, doc: [e.title, e.sub].filter(Boolean).join(' · '), debit: e.amount > 0 ? e.amount : null, credit: e.amount < 0 ? -e.amount : null }));
  const debit = r2(entries.reduce((s, e) => s + (e.debit || 0), 0)), credit = r2(entries.reduce((s, e) => s + (e.credit || 0), 0));
  return { customer: customer.name, inn: customer.inn, from, to, initial, entries, debit, credit, closing: r2(initial + debit - credit) };
}
