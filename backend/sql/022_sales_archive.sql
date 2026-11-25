-- Eski (tizimdan oldingi) jo'natmalar: buyurtmaga bog'lanadi, накладная PDF biriktiriladi.
-- Ombor qoldig'iga va kunlik hisobotlarga ta'sir qilmaydi — faqat buyurtmaning «jo'natildi» soniga qo'shiladi.
CREATE TABLE legacy_shipments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 factory_id uuid NOT NULL REFERENCES factories(id),
 request_id uuid NOT NULL,
 order_id uuid NOT NULL REFERENCES orders(id),
 product_id uuid NOT NULL REFERENCES products(id),
 date text NOT NULL CHECK (date ~ '^\d{4}-\d{2}-\d{2}$'),
 qty numeric NOT NULL CHECK (qty > 0),
 dispatch_no text NOT NULL DEFAULT '',
 vehicle text NOT NULL DEFAULT '',
 receiver text NOT NULL DEFAULT '',
 note text NOT NULL DEFAULT '',
 name text NOT NULL DEFAULT '',
 content_base64 text NOT NULL DEFAULT '',
 size_bytes integer NOT NULL DEFAULT 0 CHECK (size_bytes >= 0 AND size_bytes <= 8388608),
 created_by jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 voided_at timestamptz,
 void_reason text NOT NULL DEFAULT '',
 UNIQUE (factory_id, request_id)
);
CREATE INDEX legacy_shipments_order ON legacy_shipments (factory_id, order_id, product_id) WHERE voided_at IS NULL;
CREATE INDEX legacy_shipments_date ON legacy_shipments (factory_id, date);
