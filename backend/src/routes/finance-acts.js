// Akt sverka PDF: yuklash, o'qish (matn yoki OCR), dastur hisobi bilan solishtirish va saqlash.
// /api/finance/acts ostida ulanadi — faqat admin, rahbar va buxgalter (finance.js tekshiradi).
// Hozir mijozlar uchun. Ta'minotchilar uchun STATEMENTS ga 'supplier' funksiyasini qo'shish kifoya.
import { Router } from "express";
import { one, rows, tx } from "../db.js";
import { isId, validDate, ValidationError, ConflictError } from "../valid.js";
import { text, today } from "../payroll.js";
import { pdfContent, sendPdf, actor } from "../dispatch.js";
import { getSettings } from "../common.js";
import { audit } from "../audit.js";
import { customerLedger, customerStatement, customerKey } from "../finance-customers.js";
import { loadFinance } from "./finance-customers.js";
import { readActPdf, compareAct, cleanAct } from "../act-reader.js";

const r = Router();
const cols = "id,party,counterparty,period_from,period_to,parsed,comparison,matched,note,name,size_bytes,created_by,created_at,voided_at,void_reason";
const PARTIES = ["customer"];

/** Dasturdagi akt sverka: { name, initial, debit, credit, closing, entries } */
const STATEMENTS = {
  async customer(c, f, name, from, to) {
    const data = await loadFinance(c, f);
    const customer = customerLedger({ ...data, today: today() }).find((x) => x.key === customerKey(name));
    if (!customer) return { customer: name, inn: "", from, to, initial: 0, entries: [], debit: 0, credit: 0, closing: 0, missing: true };
    return customerStatement(customer, from, to);
  },
};
const partyOf = (b) => {
  const party = b.party || "customer";
  if (!PARTIES.includes(party)) throw new ValidationError("Bu bo‘lim uchun akt sverka hali qo‘llab-quvvatlanmaydi");
  const name = text(b.counterparty, 200);
  if (!name) throw new ValidationError("Kontragentni tanlang");
  return { party, name };
};
async function statementFor(f, party, name, act) {
  if (!validDate(act.from) || !validDate(act.to) || act.from > act.to) return null;
  return tx(async (c) => {
    await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
    return STATEMENTS[party](c, f, name, act.from, act.to);
  });
}
const result = async (f, party, name, act) => {
  const statement = await statementFor(f, party, name, act);
  return { act, statement, comparison: statement ? compareAct(act, statement) : null };
};

/** PDF ni o'qish (saqlamaydi) */
r.post("/preview", async (req, res) => {
  const b = req.body || {}, { party, name } = partyOf(b);
  const pdf = pdfContent(b.contentBase64);
  const settings = await getSettings(req.factoryId);
  const act = await readActPdf(pdf, { ours: settings.company, counterparty: name, party });
  res.json(await result(req.factoryId, party, name, act));
});

/** Foydalanuvchi davr, qoldiq yoki qator turini o'zgartirganda qayta solishtirish */
r.post("/compare", async (req, res) => {
  const b = req.body || {}, { party, name } = partyOf(b);
  res.json(await result(req.factoryId, party, name, cleanAct(b.act, party)));
});

r.get("/", async (req, res) => {
  const party = req.query.party || "customer";
  const list = await rows("SELECT " + cols + " FROM finance_reconciliation_acts WHERE factory_id=$1 AND party=$2 ORDER BY period_to DESC, created_at DESC", [req.factoryId, party]);
  const key = req.query.counterparty ? customerKey(req.query.counterparty) : "";
  res.json(key ? list.filter((x) => customerKey(x.counterparty) === key) : list);
});

r.get("/:id/pdf", async (req, res) => {
  const doc = isId(req.params.id) && (await one("SELECT name,content_base64 FROM finance_reconciliation_acts WHERE factory_id=$1 AND id=$2", [req.factoryId, req.params.id]));
  if (!doc) return res.status(404).json({ error: "Akt sverka topilmadi" });
  sendPdf(res, doc);
});

/** Tasdiqlangandan keyin saqlash: PDF + o'qilgan raqamlar + dastur bilan farqlar */
r.post("/", async (req, res) => {
  const b = req.body || {}, f = req.factoryId, { party, name } = partyOf(b);
  if (!isId(b.requestId)) throw new ValidationError("So‘rov raqami noto‘g‘ri");
  const old = await one("SELECT " + cols + " FROM finance_reconciliation_acts WHERE factory_id=$1 AND request_id=$2", [f, b.requestId]);
  if (old) return res.json(old);
  const pdf = pdfContent(b.contentBase64);
  const act = cleanAct(b.act, party);
  if (!validDate(act.from) || !validDate(act.to) || act.from > act.to) throw new ValidationError("Akt sverka davrini kiriting");
  if (act.to > today()) throw new ValidationError("Davr oxiri bugundan keyin bo‘lmasin");
  if (act.opening == null || act.closing == null) throw new ValidationError("Boshlang‘ich va yakuniy qoldiqni kiriting");
  const statement = await statementFor(f, party, name, act);
  const comparison = compareAct(act, statement);
  const counterparty = statement.missing ? name : statement.customer || name;
  const doc = await one(
    `INSERT INTO finance_reconciliation_acts(factory_id,request_id,party,counterparty,period_from,period_to,parsed,comparison,matched,note,name,content_base64,size_bytes,created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT (factory_id,request_id) DO NOTHING RETURNING ${cols}`,
    [f, b.requestId, party, counterparty, act.from, act.to, JSON.stringify(act), JSON.stringify({ ...comparison, statement: { initial: statement.initial, debit: statement.debit, credit: statement.credit, closing: statement.closing } }), comparison.ok, text(b.note, 500), text(b.name, 160) || "Akt_sverka.pdf", b.contentBase64, pdf.length, JSON.stringify(actor(req))],
  );
  if (!doc) return res.json(await one("SELECT " + cols + " FROM finance_reconciliation_acts WHERE factory_id=$1 AND request_id=$2", [f, b.requestId]));
  await audit(req, { action: "create", entity: "reconciliationAct", entityId: doc.id, label: counterparty + " · " + act.from + "–" + act.to });
  res.json(doc);
});

r.post("/:id/void", async (req, res) => {
  const reason = text(req.body?.reason, 500);
  if (!isId(req.params.id) || !reason) throw new ValidationError("Bekor qilish sababi majburiy");
  const doc = await one("UPDATE finance_reconciliation_acts SET voided_at=now(),void_reason=$3 WHERE factory_id=$1 AND id=$2 AND voided_at IS NULL RETURNING id,counterparty", [req.factoryId, req.params.id, reason]);
  if (!doc) throw new ConflictError("Akt sverka topilmadi yoki bekor qilingan");
  await audit(req, { action: "void", entity: "reconciliationAct", entityId: doc.id, label: doc.counterparty });
  res.json(doc);
});

export default r;
