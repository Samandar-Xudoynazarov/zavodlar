CREATE TABLE finance_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id uuid NOT NULL REFERENCES factories(id),
  request_id uuid NOT NULL,
  order_id uuid UNIQUE REFERENCES orders(id),
  supplier_id uuid REFERENCES suppliers(id),
  number text NOT NULL,
  date text NOT NULL,
  counterparty text NOT NULL,
  items jsonb NOT NULL,
  original_total numeric(18,2) NOT NULL CHECK(original_total >= 0),
  name text NOT NULL,
  content_base64 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(num_nonnulls(order_id,supplier_id)=1),
  UNIQUE(factory_id,request_id)
);
CREATE UNIQUE INDEX finance_contract_identity ON finance_contracts
 (factory_id, (order_id IS NOT NULL), lower(counterparty), lower(number),date);
CREATE TABLE material_invoice_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id uuid NOT NULL REFERENCES factories(id),
  invoice_id uuid NOT NULL REFERENCES material_invoices(id),
  movement_id uuid NOT NULL REFERENCES movements(id),
  material_id uuid NOT NULL REFERENCES materials(id),
  qty numeric NOT NULL CHECK(qty>0),
  request_id uuid NOT NULL,
  UNIQUE(factory_id,request_id)
);
CREATE INDEX material_matches_invoice ON material_invoice_matches(invoice_id);
CREATE INDEX material_matches_receipt ON material_invoice_matches(movement_id);
ALTER TABLE supplier_entries ADD COLUMN contract_id uuid REFERENCES finance_contracts(id),
 ADD COLUMN advance_material_id uuid REFERENCES materials(id),
 ADD COLUMN advance_qty numeric CHECK(advance_qty>0);
