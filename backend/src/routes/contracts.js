import { Router } from "express";
import { one, rows, tx, q } from "../db.js";
import { canonicalCustomer, customerKey } from "../customer-name.js";
import { isId, validDate, ValidationError, ConflictError, clean, SPEC, insertSql } from "../valid.js";
import { pdfContent, sendPdf } from "../dispatch.js";
import { money, number, text } from "../payroll.js";
import { nextNo } from "../common.js";
import { audit } from "../audit.js";
import { readContract } from "../contract-reader.js";
import { resolveSupplier } from "../supplier-accounts.js";

const r = Router();
const cols = "id,order_id,supplier_id,number,date,counterparty,items,original_total,name";
r.post("/preview", async (req, res) => res.json(await readContract(pdfContent(req.body?.contentBase64))));
r.get("/:id/pdf", async (req, res) => {
  const doc =
    isId(req.params.id) &&
    (await one("SELECT name,content_base64 FROM finance_contracts WHERE factory_id=$1 AND id=$2", [
      req.factoryId,
      req.params.id,
    ]));
  if (!doc) return res.status(404).json({ error: "Shartnoma topilmadi" });
  sendPdf(res, doc);
});
r.post("/", async (req, res) => {
  const b = req.body || {},
    f = req.factoryId;
  if (!isId(b.requestId) || !["sale", "purchase"].includes(b.kind))
    throw new ValidationError("Shartnoma turi yoki so‘rov raqami noto‘g‘ri");
  const record = await tx(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,9473))", [f]);
    const existing = await one(
      "SELECT " + cols + " FROM finance_contracts WHERE factory_id=$1 AND request_id=$2",
      [f, b.requestId],
      c,
    );
    if (existing) {
      if (
        existing.number !== text(b.number, 60) ||
        existing.date !== b.date ||
        Boolean(existing.orderId) !== (b.kind === "sale") ||
        customerKey(existing.counterparty) !== customerKey(text(b.counterparty, 160))
      )
        throw new ConflictError("Bu so‘rov raqami boshqa shartnomaga tegishli");
      return existing;
    }
    pdfContent(b.contentBase64);
    const no = text(b.number, 60),
      customer =
        b.kind === "sale"
          ? await canonicalCustomer(q, f, text(b.counterparty, 160), c)
          : text(b.counterparty, 160).replace(/\s+/g, " ");
    if (
      !no ||
      !customer ||
      !validDate(b.date) ||
      !Array.isArray(b.items) ||
      !b.items.length ||
      b.items.length > 100
    )
      throw new ValidationError("Shartnoma raqami, sana, kontragent va mahsulotlarni tekshiring");
    const isSale = b.kind === "sale";
    if (
      await one(
        "SELECT id FROM finance_contracts WHERE factory_id=$1 AND lower(number)=lower($2) AND lower(counterparty)=lower($3) AND date=$4 AND (order_id IS NOT NULL)=$5",
        [f, no, customer, b.date, isSale],
        c,
      )
    )
      throw new ConflictError("Bu shartnoma avval kiritilgan");
    let supplier = null,
      order = null;
    if (!isSale) {
      if (b.supplierId && !isId(b.supplierId)) throw new ValidationError("Ta’minotchini tekshiring");
      // Avval STIR, keyin tozalangan nom bo'yicha — bir ta'minotchi ikki marta yaratilmaydi
      supplier = b.supplierId
        ? await one("SELECT id,name FROM suppliers WHERE factory_id=$1 AND id=$2 AND NOT archived", [f, b.supplierId], c)
        : await resolveSupplier(c, f, { name: customer, inn: /^\d{9}$/.test(String(b.inn || "")) ? b.inn : "" });
      if (!supplier) throw new ValidationError("Faol ta’minotchini tanlang");
    }
    const items = [];
    for (const it of b.items) {
      if (!it || typeof it !== "object") throw new ValidationError("Mahsulot qatorini tekshiring");
      const name = text(it.name, 160),
        unit = text(it.unit, 20);
      if (
        !name ||
        !unit ||
        !(Number(it.qty) > 0) ||
        !Number.isFinite(+it.qty) ||
        +it.qty > 1e9 ||
        !String(it.price ?? "").trim()
      )
        throw new ValidationError("Mahsulot nomi, birligi, miqdori va narxini kiriting");
      const qty = +it.qty,
        price = number(it.price, "Shartnoma narxi", 0.01, 1e12);
      const total = number(it.total, "Qator summasi", 0.01, 1e15);
      if (isSale) {
        if (!Number.isInteger(qty)) throw new ValidationError("Tayyor mahsulot miqdori butun dona bo‘lishi kerak");
        let product;
        if (isId(it.productId))
          product = await one(
            "SELECT id FROM products WHERE factory_id=$1 AND id=$2 FOR SHARE",
            [f, it.productId],
            c,
          );
        else if (it.create) {
          const code = text(it.code || name, 60);
          product = await one(
            "SELECT id FROM products WHERE factory_id=$1 AND lower(code)=lower($2) ORDER BY id LIMIT 1",
            [f, code],
            c,
          );
          if (!product)
            product = await one(
              "INSERT INTO products(factory_id,code,name,cost_pending) VALUES($1,$2,$3,true) RETURNING id",
              [f, code, name],
              c,
            );
        }
        if (!product)
          throw new ValidationError(name + ": katalogdagi mahsulotni tanlang yoki qo‘shishni tasdiqlang");
        items.push({ name, unit, qty, price, total, productId: product.id });
      } else {
        const mat =
          isId(it.materialId) &&
          (await one(
            "SELECT id,unit FROM materials WHERE factory_id=$1 AND id=$2 AND stock AND NOT archived",
            [f, it.materialId],
            c,
          ));
        if (!mat) throw new ValidationError(name + ": ombor materialini tanlang");
        const factor = Number(it.factor ?? 1);
        if (!(factor > 0 && factor <= 1e9))
          throw new ValidationError("Ombor birligiga o‘tish koeffitsiyentini tekshiring");
        if (items.some((x) => x.materialId === mat.id))
          throw new ValidationError("Bir materialni shartnomada bir qatorga kiriting");
        items.push({ name, unit, qty, price, total, materialId: mat.id, factor });
      }
    }
    if (isSale) {
      const orderData = clean(SPEC.order, {
        contractNo: no,
        date: b.date,
        customer,
        status: b.status,
        items: items.map((i) => ({ productId: i.productId, qty: i.qty, price: i.total / i.qty })),
      });
      const sql = insertSql("orders", { factoryId: f, no: await nextNo(f, "order", "orders", c), ...orderData });
      order = await one(sql.text, sql.values, c);
    }
    const accepted = money(items.reduce((s, l) => s + l.total, 0));
    const original = number(b.originalTotal ?? accepted, "PDF bo‘yicha jami", 0.01, 1e15);
    if (original + 0.005 < accepted)
      throw new ValidationError("Qabul qilingan qatorlar summasi PDF jamidan oshdi");
    return one(
      "INSERT INTO finance_contracts(factory_id,request_id,order_id,supplier_id,number,date,counterparty,items,original_total,name,content_base64) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING " +
        cols,
      [
        f,
        b.requestId,
        order?.id,
        supplier?.id,
        no,
        b.date,
        supplier?.name || customer,
        JSON.stringify(items),
        original,
        text(b.name, 160) || "Shartnoma.pdf",
        b.contentBase64,
      ],
      c,
    );
  });
  await audit(req, { action: "create", entity: "financeContract", entityId: record.id, label: record.number });
  res.json(record);
});
export default r;
