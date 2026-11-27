-- Ta'minotchilar: bitta ta'minotchi bilan bir nechta shartnoma. Faktura va to'lov shartnomaga bog'lanadi.
-- Mavjud ma'lumotlar o'zgarmaydi: eski fakturalar «Shartnomasiz» bo'lib qoladi, ularni ilovada shartnomaga bog'lash mumkin.
-- FK kechiktirilgan (DEFERRABLE): zaxiradan tiklashda fakturalar shartnomalardan oldin yoziladi.
ALTER TABLE material_invoices ADD COLUMN contract_id uuid
  REFERENCES finance_contracts(id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX material_invoice_contract ON material_invoices(contract_id) WHERE contract_id IS NOT NULL;
CREATE INDEX supplier_entries_contract ON supplier_entries(contract_id) WHERE contract_id IS NOT NULL;
CREATE INDEX suppliers_inn ON suppliers(factory_id, inn) WHERE inn <> '';

-- Hisob ko'rinishiga shartnoma ustuni qo'shiladi (oxiriga — eski ustunlar o'z joyida qoladi).
CREATE OR REPLACE VIEW supplier_ledger AS
 SELECT i.factory_id,i.supplier_id,i.id,'invoice'::text AS kind,i.date,i.number,i.amount,i.due_date,
        i.amount-coalesce((SELECT sum(a.amount) FROM supplier_allocations a
                            WHERE a.invoice_id=i.id AND a.voided_at IS NULL),0) AS remaining,
        i.contract_id
 FROM material_invoices i
 WHERE i.type='in' AND i.voided_at IS NULL AND NOT EXISTS (
   SELECT 1 FROM supplier_entries o WHERE o.supplier_id=i.supplier_id
   AND o.kind!='payment' AND o.voided_at IS NULL AND o.date>i.date
 )
 UNION ALL
 SELECT e.factory_id,e.supplier_id,e.id,e.kind,e.date,e.number,e.amount,NULL::text,
        e.amount-coalesce((SELECT sum(a.amount) FROM supplier_allocations a
                            WHERE (a.source_id=e.id OR a.opening_id=e.id) AND a.voided_at IS NULL),0),
        e.contract_id
 FROM supplier_entries e WHERE e.voided_at IS NULL;
