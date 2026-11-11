CREATE TABLE material_invoices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 factory_id uuid NOT NULL REFERENCES factories(id),
 request_id uuid NOT NULL,
 type text NOT NULL CHECK(type IN ('in','out')),
 number text NOT NULL,
 date text NOT NULL,
 counterparty text NOT NULL,
 items jsonb NOT NULL,
 amount numeric NOT NULL CHECK(amount>=0),
 note text NOT NULL DEFAULT '',
 name text NOT NULL DEFAULT '',
 content_base64 text NOT NULL DEFAULT '',
 size_bytes integer NOT NULL DEFAULT 0,
 created_by jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 voided_at timestamptz,
 void_reason text,
 UNIQUE(factory_id,request_id)
);
CREATE UNIQUE INDEX material_invoice_number ON material_invoices(factory_id,type,lower(number),counterparty) WHERE voided_at IS NULL;
CREATE INDEX material_invoice_month ON material_invoices(factory_id,date);
