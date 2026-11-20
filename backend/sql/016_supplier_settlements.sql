ALTER TABLE material_invoices ADD COLUMN supplier_id uuid REFERENCES suppliers(id),
                              ADD COLUMN due_date text;
INSERT INTO suppliers (factory_id, name)
SELECT DISTINCT factory_id, btrim(counterparty) FROM material_invoices WHERE type='in'
ON CONFLICT DO NOTHING;

UPDATE material_invoices i SET supplier_id=s.id FROM suppliers s
WHERE i.type='in' AND i.factory_id=s.factory_id
AND lower(regexp_replace(btrim(i.counterparty), '\s+', ' ', 'g')) =
    lower(regexp_replace(btrim(s.name), '\s+', ' ', 'g'));

-- Old backups and clients only provide the name. Keep the printed name as a snapshot.
CREATE FUNCTION material_invoice_supplier() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.type='in' AND NEW.supplier_id IS NULL THEN
    INSERT INTO suppliers(factory_id,name) VALUES(NEW.factory_id,btrim(NEW.counterparty))
      ON CONFLICT DO NOTHING;
    SELECT id INTO STRICT NEW.supplier_id FROM suppliers WHERE factory_id=NEW.factory_id AND
      lower(regexp_replace(btrim(name), '\s+', ' ', 'g')) =
      lower(regexp_replace(btrim(NEW.counterparty), '\s+', ' ', 'g'));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER material_invoice_supplier_link BEFORE INSERT ON material_invoices
FOR EACH ROW EXECUTE FUNCTION material_invoice_supplier();
CREATE INDEX material_invoice_supplier_date ON material_invoices(factory_id,supplier_id,date);

CREATE TABLE supplier_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 factory_id uuid NOT NULL REFERENCES factories(id),
 supplier_id uuid NOT NULL REFERENCES suppliers(id),
 request_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('payment','opening_debt','opening_advance')),
 date text NOT NULL,
 amount numeric(16,2) NOT NULL CHECK(amount>=0 AND (kind!='payment' OR amount>0)),
 number text NOT NULL DEFAULT '',
 created_by jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 voided_at timestamptz,
 void_reason text,
 UNIQUE(factory_id,request_id)
);
CREATE UNIQUE INDEX supplier_one_opening ON supplier_entries(supplier_id)
 WHERE kind!='payment' AND voided_at IS NULL;
CREATE UNIQUE INDEX supplier_payment_number ON supplier_entries(supplier_id,date,lower(number))
 WHERE kind='payment' AND voided_at IS NULL;
CREATE INDEX supplier_entries_date ON supplier_entries(factory_id,supplier_id,date);

CREATE TABLE supplier_allocations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 factory_id uuid NOT NULL REFERENCES factories(id),
 request_id uuid NOT NULL,
 source_id uuid NOT NULL REFERENCES supplier_entries(id),
 invoice_id uuid REFERENCES material_invoices(id),
 opening_id uuid REFERENCES supplier_entries(id),
 amount numeric(16,2) NOT NULL CHECK(amount>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 created_by jsonb NOT NULL,
 voided_at timestamptz,
 void_reason text,
 CHECK(num_nonnulls(invoice_id,opening_id)=1),
 UNIQUE(factory_id,request_id)
);
CREATE INDEX supplier_allocation_source ON supplier_allocations(source_id) WHERE voided_at IS NULL;
CREATE INDEX supplier_allocation_invoice ON supplier_allocations(invoice_id) WHERE voided_at IS NULL;
CREATE INDEX supplier_allocation_opening ON supplier_allocations(opening_id) WHERE voided_at IS NULL;

-- Starting balances are at the beginning of the chosen day. Older invoices are covered by them.
CREATE VIEW supplier_ledger AS
 SELECT i.factory_id,i.supplier_id,i.id,'invoice'::text AS kind,i.date,i.number,i.amount,i.due_date,
        i.amount-coalesce((SELECT sum(a.amount) FROM supplier_allocations a
                            WHERE a.invoice_id=i.id AND a.voided_at IS NULL),0) AS remaining
 FROM material_invoices i
 WHERE i.type='in' AND i.voided_at IS NULL AND NOT EXISTS (
   SELECT 1 FROM supplier_entries o WHERE o.supplier_id=i.supplier_id
   AND o.kind!='payment' AND o.voided_at IS NULL AND o.date>i.date
 )
 UNION ALL
 SELECT e.factory_id,e.supplier_id,e.id,e.kind,e.date,e.number,e.amount,NULL::text,
        e.amount-coalesce((SELECT sum(a.amount) FROM supplier_allocations a
                            WHERE (a.source_id=e.id OR a.opening_id=e.id) AND a.voided_at IS NULL),0)
 FROM supplier_entries e WHERE e.voided_at IS NULL;
