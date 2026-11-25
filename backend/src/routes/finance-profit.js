// Foyda va zarar (rahbar uchun): /api/finance/profit?month=YYYY-MM[&all=1]
// Tushum (QQSsiz sotuv fakturalari) − material xaridi − oylik fondi − ijtimoiy soliq − boshqa xarajatlar (kassa).
// Ma'lumot bo'lmagan qator null bo'lib qaytadi va «ma'lumot yo'q» deb ko'rsatiladi — taxminiy son qo'yilmaydi.
import { Router } from 'express';
import { rows, tx } from '../db.js';
import { validMonth, ValidationError } from '../valid.js';
import { money, today } from '../payroll.js';

const r = Router();

/** month dan oldingi n ta oy (o'zi bilan), eskidan yangiga */
export function lastMonths(month, n = 6) {
  const [y, m] = month.split('-').map(Number), out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

/** Bitta zavod va oy uchun hisob (sof funksiya: guruhlangan yig'indilardan) */
export function profitRow({ revenue = 0, vat = 0, materials = 0, expenses = 0, payroll = null }) {
  const gross = payroll && ['approved', 'closed'].includes(payroll.status) && Array.isArray(payroll.snapshot)
    ? money(payroll.snapshot.reduce((s, x) => s + (+x.gross || 0), 0)) : null;
  const socialTax = gross === null ? null : money(gross * (+payroll.socialTaxRate || 0) / 100);
  const costs = money(materials + (gross || 0) + (socialTax || 0) + expenses);
  return {
    revenue: money(revenue), vat: money(vat), materials: money(materials), payroll: gross, socialTax,
    payrollStatus: payroll?.status || null, expenses: money(expenses), costs,
    profit: money(revenue - costs), margin: revenue > 0 ? Math.round((revenue - costs) / revenue * 1000) / 10 : null,
    complete: gross !== null,
  };
}

export async function factoryProfit(c, factoryId, months) {
  const first = months[0], last = months.at(-1);
  const sum = async (sql) => new Map((await rows(sql, [factoryId, first, last], c)).map((x) => [x.month, x]));
  const inv = await sum(`SELECT left(date,7) AS month, sum(net) AS net, sum(vat) AS vat FROM finance_invoices
    WHERE factory_id=$1 AND voided_at IS NULL AND left(date,7) BETWEEN $2 AND $3 GROUP BY 1`);
  const mat = await sum(`SELECT left(date,7) AS month, sum(amount) AS amount FROM material_invoices
    WHERE factory_id=$1 AND type='in' AND voided_at IS NULL AND left(date,7) BETWEEN $2 AND $3 GROUP BY 1`);
  const cash = await sum(`SELECT left(date,7) AS month, sum(amount) AS amount FROM finance_cash_entries
    WHERE factory_id=$1 AND direction='out' AND category='xarajat' AND voided_at IS NULL AND left(date,7) BETWEEN $2 AND $3 GROUP BY 1`);
  const pay = await sum(`SELECT month, status, snapshot, social_tax_rate FROM hr_months WHERE factory_id=$1 AND month BETWEEN $2 AND $3`);
  return months.map((month) => ({
    month,
    ...profitRow({
      revenue: +inv.get(month)?.net || 0, vat: +inv.get(month)?.vat || 0, materials: +mat.get(month)?.amount || 0,
      expenses: +cash.get(month)?.amount || 0, payroll: pay.get(month) || null,
    }),
  }));
}

r.get('/', async (req, res) => {
  const month = req.query.month || today().slice(0, 7);
  if (!validMonth(month)) throw new ValidationError('Oy formati YYYY-MM');
  const months = lastMonths(month, 6);
  const all = req.query.all === '1' && !req.user.factoryId;
  const factories = all ? req.factories.filter((f) => !f.archived) : [req.factory];
  const result = await tx(async (c) => {
    await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
    const out = [];
    for (const f of factories) out.push({ id: f.id, name: f.name, months: await factoryProfit(c, f.id, months) });
    return out;
  });
  let total = null;
  if (all) {
    total = months.map((m, i) => {
      const list = result.map((f) => f.months[i]);
      const add = (k) => money(list.reduce((s, x) => s + (x[k] || 0), 0));
      const revenue = add('revenue'), costs = add('costs');
      return { month: m, revenue, vat: add('vat'), materials: add('materials'), payroll: add('payroll'), socialTax: add('socialTax'), expenses: add('expenses'), costs, profit: money(revenue - costs), margin: revenue > 0 ? Math.round((revenue - costs) / revenue * 1000) / 10 : null, complete: list.every((x) => x.complete) };
    });
  }
  res.json({ month, months, factories: result, total });
});

export default r;
