import { rows, one } from "./db.js";
import { isId, ValidationError, ConflictError } from "./valid.js";

export async function supplierMaterials(c, f, supplier) {
  const params = [f, supplier.id, supplier.name];
  const receipts = await rows(
    `SELECT m.id,m.material_id,m.date,m.qty,m.doc_number,
      m.qty-coalesce((SELECT sum(a.qty) FROM material_invoice_matches a WHERE a.movement_id=m.id),0) AS remaining
    FROM movements m WHERE m.factory_id=$1 AND m.type='in'
    AND lower(regexp_replace(trim(m.supplier),'\\s+',' ','g'))=lower(regexp_replace(trim($3),'\\s+',' ','g'))
    AND NOT EXISTS(SELECT 1 FROM material_invoices i CROSS JOIN LATERAL jsonb_array_elements(i.items) l
      WHERE i.factory_id=$1 AND i.supplier_id=$2 AND i.voided_at IS NULL AND l->>'movementId'=m.id::text)
    ORDER BY m.date,m.created_at`,
    params,
    c,
  );
  const invoices = await rows(
    `SELECT i.id,i.date,i.number,(l->>'materialId')::uuid AS material_id,
      (l->>'qty')::numeric-coalesce((SELECT sum(a.qty) FROM material_invoice_matches a WHERE a.invoice_id=i.id AND a.material_id=(l->>'materialId')::uuid),0) AS remaining
    FROM material_invoices i CROSS JOIN LATERAL jsonb_array_elements(i.items) l
    WHERE i.factory_id=$1 AND i.supplier_id=$2 AND i.type='in' AND i.voided_at IS NULL
    AND coalesce(l->>'movementId','')='' ORDER BY i.date,i.created_at`,
    params.slice(0, 2),
    c,
  );
  const matches = await rows(
    `SELECT a.id,a.material_id,a.qty,m.date AS receipt_date,i.number,i.date AS invoice_date
    FROM material_invoice_matches a JOIN movements m ON m.id=a.movement_id JOIN material_invoices i ON i.id=a.invoice_id
    WHERE a.factory_id=$1 AND i.supplier_id=$2 ORDER BY m.date`,
    params.slice(0, 2),
    c,
  );
  const advances = await rows(
    `SELECT e.advance_material_id AS material_id,sum(e.advance_qty*l.remaining/e.amount) AS qty
    FROM supplier_entries e JOIN supplier_ledger l ON l.id=e.id
    WHERE e.factory_id=$1 AND e.supplier_id=$2 AND e.advance_qty>0 AND l.remaining>0 GROUP BY e.advance_material_id`,
    params.slice(0, 2),
    c,
  );
  const contracts = await rows(
    "SELECT id,number,date,items,original_total,name FROM finance_contracts WHERE factory_id=$1 AND supplier_id=$2 ORDER BY date DESC",
    params.slice(0, 2),
    c,
  );
  return {
    receipts: receipts.filter((r) => r.remaining > 0),
    invoices: invoices.filter((i) => i.remaining > 0),
    matches,
    advances,
    contracts,
  };
}

export async function matchReceipt(c, f, supplier, b) {
  if (
    ![b.requestId, b.invoiceId, b.movementId, b.materialId].every(isId) ||
    !Number.isFinite(+b.qty) ||
    +b.qty <= 0 ||
    Math.round(+b.qty * 1e6) / 1e6 !== +b.qty
  )
    throw new ValidationError("Kirim, faktura va miqdorni tekshiring");
  const old = await one(
    "SELECT * FROM material_invoice_matches WHERE factory_id=$1 AND request_id=$2",
    [f, b.requestId],
    c,
  );
  if (old) {
    if (old.invoiceId !== b.invoiceId || old.movementId !== b.movementId || old.qty !== +b.qty)
      throw new ConflictError("So‘rov avval ishlatilgan");
    return { id: old.id };
  }
  const { receipts, invoices } = await supplierMaterials(c, f, supplier);
  const receipt = receipts.find((r) => r.id === b.movementId && r.materialId === b.materialId);
  const invoice = invoices.find((i) => i.id === b.invoiceId && i.materialId === b.materialId);
  if (!receipt || !invoice || +b.qty > Math.min(receipt.remaining, invoice.remaining))
    throw new ConflictError("Miqdor faktura yoki kirimning ochiq qoldig‘idan katta");
  return one(
    "INSERT INTO material_invoice_matches(factory_id,invoice_id,movement_id,material_id,qty,request_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
    [f, b.invoiceId, b.movementId, b.materialId, b.qty, b.requestId],
    c,
  );
}
