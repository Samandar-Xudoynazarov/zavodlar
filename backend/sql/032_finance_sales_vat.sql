-- Sotuv fakturasida QQS: QQSsiz summa (net), QQS (vat) va jami (amount) alohida.
-- Eski fakturalar: jami summa o'zgarmaydi, QQS 0 deb olinadi.
ALTER TABLE finance_invoices
 ADD COLUMN net numeric(18,2),
 ADD COLUMN vat numeric(18,2) NOT NULL DEFAULT 0 CHECK (vat >= 0),
 ADD COLUMN due_date text CHECK (due_date IS NULL OR due_date ~ '^\d{4}-\d{2}-\d{2}$');
UPDATE finance_invoices SET net = amount;
ALTER TABLE finance_invoices ALTER COLUMN net SET NOT NULL;
CREATE INDEX finance_invoices_due ON finance_invoices (factory_id, due_date) WHERE voided_at IS NULL AND due_date IS NOT NULL;

-- Mijozdan kelgan to'lov: turi (bank/naqd/karta) va to'lov hujjati raqami alohida maydon.
-- Mijoz bo'yicha to'lov (buyurtmaga bog'lanmagan avans yoki eski qarz uchun) ham mumkin: order_id bo'sh, customer to'ldiriladi.
ALTER TABLE finance_receipts
 ADD COLUMN method text NOT NULL DEFAULT 'bank' CHECK (method IN ('bank','naqd','karta')),
 ADD COLUMN doc_number text NOT NULL DEFAULT '',
 ADD COLUMN customer text NOT NULL DEFAULT '';
UPDATE finance_receipts r SET customer = btrim(o.customer) FROM orders o WHERE o.id = r.order_id;
ALTER TABLE finance_receipts ALTER COLUMN order_id DROP NOT NULL;
ALTER TABLE finance_receipts ADD CONSTRAINT finance_receipt_owner CHECK (order_id IS NOT NULL OR btrim(customer) <> '');
CREATE INDEX finance_receipts_customer ON finance_receipts (factory_id, lower(customer));
