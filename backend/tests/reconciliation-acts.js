// Akt sverka PDF: matnni o'qish (ruscha 1C/Didox va o'zbekcha), qoldiq belgisi, dastur bilan solishtirish, saqlash va bekor qilish
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';
const source = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!source) throw new Error('DATABASE_URL is required');
const schema = 'act_test_' + crypto.randomBytes(8).toString('hex');
const management = new pg.Pool({ connectionString: source, connectionTimeoutMillis: 10000 });
await management.query('CREATE SCHEMA ' + schema);
const url = new URL(source); url.searchParams.set('options', '-c search_path=' + schema + ',public'); process.env.DATABASE_URL = url.toString(); process.env.AUTH_SECRET = crypto.randomBytes(32).toString('hex');
const { one, q, getPool, migrate } = await import('../src/db.js');
const { issueToken, hashPassword } = await import('../src/auth.js');
const { default: app } = await import('../src/app.js');
const { parseAct, compareAct, cleanAct, classify, toNumber } = await import('../src/act-reader.js');
let server;
const OURS = '"BETON ZAVOD" MCHJ', THEM = '"AZALIS" MCHJ';
// pdfium getText() natijasiga o'xshash matnlar (ikki tomonli 1C jadvali qatorma-qator)
const RU = `АКТ СВЕРКИ
взаимных расчетов за период: 01.07.2026 - 30.09.2026
между ООО "BETON ZAVOD" и ООО "AZALIS" по договору № 15 от 01.07.2026
По данным ООО "BETON ZAVOD", сум По данным ООО "AZALIS", сум
Дата Документ Дебет Кредит Дата Документ Дебет Кредит
Сальдо начальное 1 000 000,00 Сальдо начальное 1 000 000,00
05.07.2026 Продажа (05.07.26 №12) 12 500 000,00 05.07.2026 Приход (05.07.26 №12) 12 500 000,00
10.07.2026 Оплата (10.07.26 №45) 5 000 000,00 10.07.2026 Оплата (10.07.26 №45) 5 000 000,00
20.08.2026 Продажа (20.08.26
№31) 7 250 000,50
02.09.2026 Оплата (02.09.26 №77) 10 000 000,00 02.09.2026 Оплата (02.09.26 №77) 10 000 000,00
Обороты за период 19 750 000,50 15 000 000,00 Обороты за период 15 000 000,00 12 500 000,00
Сальдо конечное 5 750 000,50 Сальдо конечное 1 500 000,00
По данным ООО "BETON ZAVOD" на 30.09.2026 задолженность в пользу ООО "BETON ZAVOD" составляет 5 750 000,50 сум`;
const UZ = `O‘ZARO HISOB-KITOBLARNI SOLISHTIRISH DALOLATNOMASI
01.01.2026 dan 31.03.2026 gacha bo‘lgan davr uchun
"AZALIS" MCHJ ma’lumotlariga ko‘ra
Sana Hujjat Debet Kredit
Boshlang‘ich qoldiq 2 000 000,00
15.01.2026 To‘lov topshiriqnomasi №5 3 000 000,00
20.02.2026 Tovar kirimi (hisob-faktura №9) 4 000 000,00
Davr aylanmasi 3 000 000,00 4 000 000,00
Yakuniy qoldiq 3 000 000,00
31.03.2026 holatiga "BETON ZAVOD" MCHJ foydasiga qarzdorlik 3 000 000,00 so‘m`;
// Mijoz oldindan to'lagan (avans): yakuniy qoldiq mijoz foydasiga
const ADV = `Акт сверки взаимных расчетов за период с 01.10.2026 по 31.10.2026
По данным ООО "BETON ZAVOD", сум
Сальдо начальное 0,00
03.10.2026 Поступление на расчетный счет (п/п 101) 20 000 000,00
15.10.2026 Реализация товаров (счет-фактура 55) 8 000 000,00
Обороты за период 8 000 000,00 20 000 000,00
Сальдо конечное 12 000 000,00
задолженность в пользу ООО "AZALIS" 12 000 000,00 сум`;
try {
  // 1) Sof funksiyalar
  assert.equal(toNumber('12 500 000,50'), 12500000.5);
  assert.equal(toNumber('12,500,000.50'), 12500000.5);
  assert.equal(toNumber('1500.00'), 1500);
  assert.equal(classify('Оплата (10.07.26 №45)'), 'payment');
  assert.equal(classify('Поступление на расчетный счет'), 'payment');
  assert.equal(classify('Поступление товаров и услуг'), 'goods');
  assert.equal(classify('To‘lov topshiriqnomasi'), 'payment');
  assert.equal(classify('Hisob-faktura №3'), 'goods');

  const ru = parseAct([RU], { ours: OURS, counterparty: THEM });
  assert.equal(ru.from, '2026-07-01'); assert.equal(ru.to, '2026-09-30'); assert.equal(ru.contract, '15');
  assert.equal(ru.leftIsUs, true);
  assert.equal(ru.rows.length, 4, JSON.stringify(ru.rows));
  assert.deepEqual(ru.rows.map((x) => x.kind), ['goods', 'payment', 'goods', 'payment']);
  assert.equal(ru.rows[2].amount, 7250000.5); // ikki qatorga bo'lingan hujjat nomi
  assert.equal(ru.opening, 1000000); assert.equal(ru.closing, 5750000.5);
  assert.equal(ru.goods, 19750000.5); assert.equal(ru.payments, 15000000);
  assert.deepEqual(ru.warnings, []);

  const uz = parseAct([UZ], { ours: OURS, counterparty: THEM });
  assert.equal(uz.from, '2026-01-01'); assert.equal(uz.to, '2026-03-31');
  assert.equal(uz.leftIsUs, false); // mijoz tuzgan akt
  assert.equal(uz.rows.length, 2);
  assert.equal(uz.opening, 2000000); assert.equal(uz.closing, 3000000);
  assert.deepEqual(uz.warnings, []);

  const adv = parseAct([ADV], { ours: OURS, counterparty: THEM });
  assert.equal(adv.from, '2026-10-01'); assert.equal(adv.to, '2026-10-31');
  assert.equal(adv.opening, 0); assert.equal(adv.closing, -12000000); // avans: mijoz foydasiga
  assert.equal(adv.goods, 8000000); assert.equal(adv.payments, 20000000);

  const empty = parseAct([''], { ours: OURS, counterparty: THEM });
  assert.ok(empty.warnings.some((w) => w.includes('topilmadi')));

  // Solishtirish: dasturda bitta to'lov yo'q va bitta faktura summasi boshqa
  const st = { initial: 1000000, debit: 19700000, credit: 5000000, closing: 15700000,
    entries: [{ date: '2026-07-05', doc: 'Faktura №12', debit: 12500000 }, { date: '2026-07-11', doc: 'To‘lov', credit: 5000000 }, { date: '2026-08-20', doc: 'Faktura №31', debit: 7200000 }] };
  const cmp = compareAct(ru, st);
  assert.equal(cmp.ok, false);
  assert.equal(cmp.matched, 2);
  assert.equal(cmp.amountDiff.length, 1); assert.equal(cmp.amountDiff[0].diff, 50000.5);
  assert.equal(cmp.onlyPdf.length, 1); assert.equal(cmp.onlyPdf[0].date, '2026-09-02');
  assert.equal(cmp.onlyApp.length, 0);
  assert.deepEqual(cmp.lines.map((l) => l.ok), [true, false, false, false]);
  // Foydalanuvchi qator turini o'zgartirsa, jami qayta hisoblanadi
  const fixed = cleanAct({ ...ru, rows: ru.rows.map((x, i) => (i === 3 ? { ...x, kind: 'goods' } : x)) });
  assert.equal(fixed.goods, 29750000.5); assert.equal(fixed.payments, 5000000);

  // 2) API
  await migrate();
  const f = await one("INSERT INTO factories(code,name) VALUES('act-a','Act A') RETURNING *");
  await q("INSERT INTO settings(factory_id,company) VALUES($1,$2) ON CONFLICT (factory_id) DO UPDATE SET company=EXCLUDED.company", [f.id, OURS]);
  const p1 = await one("INSERT INTO products(factory_id,code) VALUES($1,'A1') RETURNING *", [f.id]);
  const hash = await hashPassword('ActTest123!');
  const admin = await one("INSERT INTO users(username,role,factory_id,password_hash) VALUES('admin','admin',$1,$2) RETURNING *", [f.id, hash]);
  const pto = await one("INSERT INTO users(username,role,factory_id,password_hash) VALUES('pto','pto',$1,$2) RETURNING *", [f.id, hash]);
  const order = await one("INSERT INTO orders(factory_id,no,customer,date,status,items) VALUES($1,1,$2,'2026-07-01','jarayonda',$3) RETURNING *", [f.id, THEM, JSON.stringify([{ productId: p1.id, qty: 100, price: 200000 }])]);
  const by = JSON.stringify({ id: admin.id, name: 'admin' });
  await q("INSERT INTO finance_customer_openings(factory_id,request_id,customer,date,kind,amount,created_by) VALUES($1,$2,$3,'2026-01-01','debt',1000000,$4)", [f.id, crypto.randomUUID(), THEM, by]);
  for (const [no, date, amount] of [['12', '2026-07-05', 12500000], ['31', '2026-08-20', 7250000.5]])
    await q("INSERT INTO finance_invoices(factory_id,order_id,request_id,number,date,items,amount,net,name,content_base64,size_bytes,created_by) VALUES($1,$2,$3,$4,$5,'[]',$6,$6,'f.pdf','JVBERi0=',5,$7)", [f.id, order.id, crypto.randomUUID(), no, date, amount, by]);
  await q("INSERT INTO finance_receipts(factory_id,order_id,request_id,date,amount,created_by,customer) VALUES($1,$2,$3,'2026-07-10',5000000,$4,$5)", [f.id, order.id, crypto.randomUUID(), by, THEM]);

  server = app.listen(0, '127.0.0.1'); await new Promise((r) => server.once('listening', r)); const base = 'http://127.0.0.1:' + server.address().port + '/api';
  const call = async (path, method = 'GET', body, user = admin) => { const r = await fetch(base + path, { method, headers: { Authorization: 'Bearer ' + issueToken(user), 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, body: r.headers.get('content-type')?.includes('json') ? await r.json() : await r.arrayBuffer() }; };

  // Ruxsat: PTO kira olmaydi
  assert.equal((await call('/finance/acts?party=customer', 'GET', undefined, pto)).status, 403);
  // PDF emas — rad etiladi
  assert.equal((await call('/finance/acts/preview', 'POST', { counterparty: THEM, contentBase64: Buffer.from('salom').toString('base64') })).status, 400);
  // Ta'minotchi hali yo'q
  assert.equal((await call('/finance/acts/compare', 'POST', { party: 'supplier', counterparty: 'X', act: ru })).status, 400);

  // Solishtirish: dasturda 02.09 dagi 10 mln to'lov yo'q
  const c1 = await call('/finance/acts/compare', 'POST', { counterparty: THEM, act: ru });
  assert.equal(c1.status, 200, JSON.stringify(c1.body));
  assert.equal(c1.body.statement.initial, 1000000);
  assert.equal(c1.body.statement.closing, 15750000.5);
  assert.equal(c1.body.comparison.ok, false);
  assert.equal(c1.body.comparison.onlyPdf.length, 1);
  assert.equal(c1.body.comparison.lines.find((l) => l.key === 'closing').diff, -10000000);

  // Haqiqiy PDF: kichik matnli PDF (pdfium o'qiydi)
  const pdf = minimalPdf(['Akt sverki za period: 01.07.2026 - 30.09.2026', 'Saldo nachalnoe']);
  const pv = await call('/finance/acts/preview', 'POST', { counterparty: THEM, contentBase64: pdf });
  assert.equal(pv.status, 200, JSON.stringify(pv.body));
  assert.equal(pv.body.act.from, '2026-07-01');

  // Saqlash (tasdiqdan keyin)
  const requestId = crypto.randomUUID();
  const save = { requestId, counterparty: THEM, act: ru, name: 'Akt_AZALIS.pdf', contentBase64: pdf, note: 'Didox orqali imzolangan' };
  const s1 = await call('/finance/acts', 'POST', save);
  assert.equal(s1.status, 200, JSON.stringify(s1.body));
  assert.equal(s1.body.matched, false);
  assert.equal(s1.body.periodFrom, '2026-07-01');
  assert.equal(s1.body.comparison.statement.closing, 15750000.5);
  assert.equal(s1.body.contentBase64, undefined);
  // Takroriy so'rov — o'sha yozuv
  assert.equal((await call('/finance/acts', 'POST', save)).body.id, s1.body.id);
  // Davrsiz saqlab bo'lmaydi
  assert.equal((await call('/finance/acts', 'POST', { ...save, requestId: crypto.randomUUID(), act: { ...ru, from: '' } })).status, 400);
  // Ro'yxat mijoz nomi bo'yicha (tirnoq farqi hisobga olinmaydi)
  const list = await call('/finance/acts?party=customer&counterparty=' + encodeURIComponent('AZALIS MCHJ'));
  assert.equal(list.body.length, 1);
  // PDF qaytadi
  const file = await call('/finance/acts/' + s1.body.id + '/pdf');
  assert.equal(file.status, 200); assert.equal(Buffer.from(file.body).subarray(0, 5).toString(), '%PDF-');
  // Hisob-kitobga ta'sir qilmaydi
  const ledger = await call('/finance/customers');
  assert.equal(ledger.body.customers.find((x) => x.name === THEM).debt, 15750000.5);
  // Bekor qilish
  assert.equal((await call('/finance/acts/' + s1.body.id + '/void', 'POST', {})).status, 400);
  assert.equal((await call('/finance/acts/' + s1.body.id + '/void', 'POST', { reason: 'Xato fayl' })).status, 200);
  assert.equal((await call('/finance/acts/' + s1.body.id + '/void', 'POST', { reason: 'Yana' })).status, 409);
  assert.ok(await one("SELECT 1 AS x FROM audit_log WHERE factory_id=$1 AND entity='reconciliationAct'", [f.id]));
  console.log('PASS: akt sverka PDF — o‘qish (ruscha, o‘zbekcha, avans), solishtirish, saqlash, ro‘yxat, bekor qilish');
} finally {
  if (server) await new Promise((r) => server.close(r));
  await getPool().end().catch(() => {});
  await management.query('DROP SCHEMA ' + schema + ' CASCADE').catch(() => {});
  await management.end();
}

/** Bir sahifali matnli PDF (Helvetica, lotin harflari) — base64 */
function minimalPdf(lines) {
  const content = 'BT /F1 11 Tf 50 780 Td 14 TL ' + lines.map((l) => '(' + l.replace(/[()\\]/g, '') + ") '").join(' ') + ' ET';
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>', '<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += i + 1 + ' 0 obj\n' + o + '\nendobj\n'; });
  const xref = out.length;
  out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + offsets.map((n) => String(n).padStart(10, '0') + ' 00000 n \n').join('');
  out += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
  return Buffer.from(out, 'latin1').toString('base64');
}
