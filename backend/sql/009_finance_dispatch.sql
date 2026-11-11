CREATE TABLE dispatch_documents (
 id uuid PRIMARY KEY, factory_id uuid NOT NULL REFERENCES factories(id),
 number text NOT NULL, date text NOT NULL, receiver text NOT NULL DEFAULT '', vehicle text NOT NULL DEFAULT '',
 name text NOT NULL, content_base64 text NOT NULL, size_bytes integer NOT NULL CHECK(size_bytes>0 AND size_bytes<=8388608),
 payload jsonb NOT NULL DEFAULT '{}', created_by jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dispatch_documents_factory ON dispatch_documents(factory_id,date);
CREATE TABLE finance_order_progress (
 factory_id uuid NOT NULL REFERENCES factories(id), order_id uuid NOT NULL REFERENCES orders(id),
 product_id uuid NOT NULL REFERENCES products(id), ready_qty numeric NOT NULL CHECK(ready_qty>=0),
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(factory_id,order_id,product_id)
);
CREATE TABLE finance_invoices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), factory_id uuid NOT NULL REFERENCES factories(id),
 order_id uuid NOT NULL REFERENCES orders(id), request_id uuid NOT NULL, number text NOT NULL, date text NOT NULL,
 items jsonb NOT NULL, amount numeric(18,2) NOT NULL CHECK(amount>0), note text NOT NULL DEFAULT '',
 name text NOT NULL, content_base64 text NOT NULL, size_bytes integer NOT NULL CHECK(size_bytes>0 AND size_bytes<=8388608),
 created_by jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), voided_at timestamptz, void_reason text NOT NULL DEFAULT '',
 UNIQUE(factory_id,request_id)
);
CREATE UNIQUE INDEX finance_invoice_number ON finance_invoices(factory_id,order_id,lower(number)) WHERE voided_at IS NULL;
CREATE INDEX finance_invoices_order ON finance_invoices(factory_id,order_id,date);
CREATE TABLE finance_receipts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), factory_id uuid NOT NULL REFERENCES factories(id),
 order_id uuid NOT NULL REFERENCES orders(id), invoice_id uuid REFERENCES finance_invoices(id), request_id uuid NOT NULL,
 date text NOT NULL, amount numeric(18,2) NOT NULL CHECK(amount>0), note text NOT NULL DEFAULT '',
 created_by jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), voided_at timestamptz, void_reason text NOT NULL DEFAULT '',
 UNIQUE(factory_id,request_id)
);
CREATE INDEX finance_receipts_order ON finance_receipts(factory_id,order_id,date);
