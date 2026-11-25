-- Mijozlarning boshlang'ich qoldig'i (tizimdan oldingi qarz yoki avans), ta'minotchilardagi opening_debt/opening_advance kabi.
-- Mijoz buyurtmadagi nom bo'yicha aniqlanadi (bo'sh joylar va harf katta-kichikligi hisobga olinmaydi).
CREATE TABLE finance_customer_openings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 factory_id uuid NOT NULL REFERENCES factories(id),
 request_id uuid NOT NULL,
 customer text NOT NULL CHECK (btrim(customer) <> ''),
 inn text NOT NULL DEFAULT '',
 date text NOT NULL CHECK (date ~ '^\d{4}-\d{2}-\d{2}$'),
 kind text NOT NULL CHECK (kind IN ('debt','advance')),
 amount numeric(18,2) NOT NULL CHECK (amount > 0),
 note text NOT NULL DEFAULT '',
 created_by jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 voided_at timestamptz,
 void_reason text NOT NULL DEFAULT '',
 UNIQUE (factory_id, request_id)
);
CREATE UNIQUE INDEX finance_customer_one_opening ON finance_customer_openings
 (factory_id, lower(regexp_replace(btrim(customer), '\s+', ' ', 'g'))) WHERE voided_at IS NULL;
