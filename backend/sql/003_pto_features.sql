-- pto-app'dagi yangi imkoniyatlar (2026-10): buxgalter, shartnoma raqami, oldin jo'natilgan,
-- marka tuzatish, buxgalteriya material hisoboti, tasdiqlangan oylik reja

/* ---------- Buxgalter roli ---------- */
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'rahbar', 'pto', 'usta', 'omborchi', 'buxgalter', 'kuzatuvchi', 'kurator'));

/* ---------- Buyurtmalar: lines → items [{productId, qty, price, shippedBefore}], shartnoma raqami ---------- */
ALTER TABLE orders RENAME COLUMN lines TO items;
ALTER INDEX IF EXISTS orders_lines RENAME TO orders_items;
UPDATE orders SET items = (
  SELECT COALESCE(jsonb_agg(CASE WHEN e ? 'shippedBefore' THEN e ELSE e || '{"shippedBefore":0}'::jsonb END), '[]')
    FROM jsonb_array_elements(items) e);
ALTER TABLE orders ADD COLUMN contract_no text NOT NULL DEFAULT '';

/* ---------- Tayyor mahsulot: marka tuzatish (пересортица) ---------- */
ALTER TABLE product_moves DROP CONSTRAINT IF EXISTS product_moves_type_check;
ALTER TABLE product_moves ADD CONSTRAINT product_moves_type_check CHECK (type IN ('brak', 'fix'));
ALTER TABLE product_moves ADD COLUMN to_product_id uuid REFERENCES products(id);
ALTER TABLE product_moves ADD CONSTRAINT product_moves_fix_check
  CHECK ((type = 'fix') = (to_product_id IS NOT NULL) AND (to_product_id IS NULL OR to_product_id <> product_id));

/* ---------- Buxgalteriya: oylik material hisoboti («…ойида куйилган махсулотлар руйхати») ---------- */
CREATE TABLE acct_reports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id   uuid NOT NULL REFERENCES factories(id),
  month        text NOT NULL CHECK (month ~ '^\d{4}-\d{2}$'),
  date         text NOT NULL DEFAULT '',          -- hujjat sanasi
  rows         jsonb NOT NULL DEFAULT '[]',       -- [{productId, name, unit, qty, m3, unitCost, unitPrice}]
  other_costs  numeric NOT NULL DEFAULT 0,        -- Иш хаки, фойда ва бошка харажатлар жами
  director     text NOT NULL DEFAULT '',
  chief        text NOT NULL DEFAULT '',          -- Цех бошлиги
  accountant   text NOT NULL DEFAULT '',          -- Моддий хисобчи
  updated_by   jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (factory_id, month)
);

/* ---------- Tasdiqlangan oylik ishlab chiqarish rejasi (Excel'dan yoki qo'lda) ---------- */
CREATE TABLE month_plans (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id   uuid NOT NULL REFERENCES factories(id),
  month        text NOT NULL CHECK (month ~ '^\d{4}-\d{2}$'),
  title        text NOT NULL DEFAULT '',
  source       text NOT NULL DEFAULT 'qolda' CHECK (source IN ('excel', 'qolda', 'dastur')),
  file_name    text NOT NULL DEFAULT '',
  customers    jsonb NOT NULL DEFAULT '[]',       -- buyurtmachi ustunlari
  extra_cols   jsonb NOT NULL DEFAULT '[]',       -- «Остаток от …» kabi ustunlar
  rows         jsonb NOT NULL DEFAULT '[]',       -- [{productId, name, unit, orders[], shipped, extra[], days[], m3, note}]
  note         text NOT NULL DEFAULT '',
  updated_by   jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (factory_id, month)
);
