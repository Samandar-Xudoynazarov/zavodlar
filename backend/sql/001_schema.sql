-- Zavodlar ish stoli — PostgreSQL sxemasi (1-versiya)
-- Har bir ish ma'lumoti factory_id orqali zavodga bog'langan.
-- Sana ustunlari 'YYYY-MM-DD' matn ko'rinishida saqlanadi (Toshkent vaqti bo'yicha kun).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

/* ---------- Zavodlar ---------- */
CREATE TABLE factories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE CHECK (code ~ '^[a-z0-9-]{1,30}$'),
  name        text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  kind        text NOT NULL DEFAULT 'beton' CHECK (kind IN ('beton', 'metall')), -- temir-beton yoki metall konstruksiya
  sort        int  NOT NULL DEFAULT 0,
  archived    boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

/* ---------- Foydalanuvchilar ---------- */
-- factory_id NULL — barcha zavodlarni ko'radi (bosh ofis: admin, rahbar, kuzatuvchi, kurator)
CREATE TABLE users (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username             text NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9._-]{3,40}$'),
  name                 text NOT NULL DEFAULT '',
  role                 text NOT NULL DEFAULT 'kuzatuvchi'
                       CHECK (role IN ('admin', 'rahbar', 'pto', 'usta', 'omborchi', 'kuzatuvchi', 'kurator')),
  factory_id           uuid REFERENCES factories(id),
  password_hash        text NOT NULL,
  active               boolean NOT NULL DEFAULT true,
  must_change_password boolean NOT NULL DEFAULT false,
  token_version        int NOT NULL DEFAULT 0,
  last_login_at        timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

/* ---------- Sozlamalar (har zavodga bitta qator) ---------- */
CREATE TABLE settings (
  factory_id     uuid PRIMARY KEY REFERENCES factories(id) ON DELETE CASCADE,
  electrode_pct  numeric NOT NULL DEFAULT 1.5,
  company        text NOT NULL DEFAULT '',
  signers        jsonb NOT NULL DEFAULT '[]',
  opening        jsonb NOT NULL DEFAULT '{"date":"","materials":{},"products":{}}', -- boshlang'ich qoldiq
  calc_template  jsonb,                                                            -- eski andoza
  cost_schemes   jsonb,                                                            -- xarajat andozalari; NULL — hali yaratilmagan
  plan           jsonb NOT NULL DEFAULT '{"concretePerDay":0,"workDays":[1,2,3,4,5,6],"holidays":[]}',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

/* ---------- Materiallar ---------- */
CREATE TABLE materials (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id     uuid NOT NULL REFERENCES factories(id),
  name           text NOT NULL,
  unit           text NOT NULL DEFAULT 'шт',
  grp            text NOT NULL DEFAULT 'boshqa',
  price          numeric NOT NULL DEFAULT 0 CHECK (price >= 0),
  stock          boolean NOT NULL DEFAULT true,
  electrode_base boolean NOT NULL DEFAULT false,
  is_electrode   boolean NOT NULL DEFAULT false,
  code           text NOT NULL DEFAULT '',
  min_qty        numeric NOT NULL DEFAULT 0 CHECK (min_qty >= 0),
  kg_per_m       numeric CHECK (kg_per_m >= 0),
  archived       boolean NOT NULL DEFAULT false,
  recipe         jsonb NOT NULL DEFAULT '[]',   -- beton: 1 m³ narxi uchun tarkib
  writeoff       jsonb NOT NULL DEFAULT '[]',   -- beton: 1 m³ uchun ombordan yoziladigan xomashyo
  sort           int NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX materials_factory ON materials (factory_id, sort, name);

/* ---------- Mahsulotlar ---------- */
CREATE TABLE products (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id   uuid NOT NULL REFERENCES factories(id),
  code         text NOT NULL,
  name         text NOT NULL DEFAULT '',
  grp          text NOT NULL DEFAULT 'Бошқа',
  norms        jsonb NOT NULL DEFAULT '[]',   -- [{materialId, norm}] — 1 dona uchun sarf
  calc         jsonb NOT NULL DEFAULT '{}',   -- kalkulyatsiya
  notes        jsonb NOT NULL DEFAULT '[]',
  excel_price  numeric,
  forms        numeric NOT NULL DEFAULT 0 CHECK (forms >= 0),
  cycle_days   numeric NOT NULL DEFAULT 1 CHECK (cycle_days >= 0.1),
  sort         int NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX products_factory ON products (factory_id, sort, code);

/* ---------- Kunlik hisobot ---------- */
CREATE TABLE days (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id  uuid NOT NULL REFERENCES factories(id),
  date        text NOT NULL CHECK (date ~ '^\d{4}-\d{2}-\d{2}$'),
  note        text NOT NULL DEFAULT '',
  production  jsonb NOT NULL DEFAULT '[]',   -- [{productId, plan, fact, brak, brakReason, note}]
  materials   jsonb NOT NULL DEFAULT '[]',   -- [{materialId, sarf, kirim}]
  shipments   jsonb NOT NULL DEFAULT '[]',   -- [{productId, qty, customer, vehicle, orderId}]
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (factory_id, date)
);

/* ---------- Buyurtmalar ---------- */
CREATE TABLE orders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id  uuid NOT NULL REFERENCES factories(id),
  no          int NOT NULL,
  customer    text NOT NULL,
  product_id  uuid NOT NULL REFERENCES products(id),
  qty         numeric NOT NULL CHECK (qty >= 1),
  price       numeric NOT NULL DEFAULT 0 CHECK (price >= 0),
  date        text NOT NULL DEFAULT '',
  deadline    text NOT NULL DEFAULT '',
  status      text NOT NULL DEFAULT 'yangi' CHECK (status IN ('yangi', 'jarayonda', 'tayyor', 'topshirildi')),
  note        text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (factory_id, no)
);

/* ---------- Chiqim manzillari: bo'lim/sex va texnika ---------- */
CREATE TABLE targets (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id     uuid NOT NULL REFERENCES factories(id),
  kind           text NOT NULL CHECK (kind IN ('department', 'vehicle')),
  name           text NOT NULL,
  code           text NOT NULL DEFAULT '',
  archived       boolean NOT NULL DEFAULT false,
  meter_unit     text NOT NULL DEFAULT 'km' CHECK (meter_unit IN ('km', 'soat')),
  fuel_norm      numeric NOT NULL DEFAULT 0 CHECK (fuel_norm >= 0),
  service_every  numeric NOT NULL DEFAULT 0 CHECK (service_every >= 0),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (factory_id, kind, name)
);

/* ---------- Inventarizatsiya ---------- */
CREATE TABLE inventories (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id   uuid NOT NULL REFERENCES factories(id),
  no           int NOT NULL,
  date         text NOT NULL CHECK (date ~ '^\d{4}-\d{2}-\d{2}$'),
  status       text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'done')),
  grp          text NOT NULL DEFAULT '',
  blind        boolean NOT NULL DEFAULT false,
  note         text NOT NULL DEFAULT '',
  lines        jsonb NOT NULL DEFAULT '[]',   -- [{materialId, system, actual, price}]
  created_by   jsonb,
  approved_by  jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (factory_id, no)
);
-- bir zavodda bir vaqtda bitta qoralama
CREATE UNIQUE INDEX inventories_one_draft ON inventories (factory_id) WHERE status = 'draft';

/* ---------- Ombor harakatlari: kirim / chiqim ---------- */
CREATE TABLE movements (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id     uuid NOT NULL REFERENCES factories(id),
  type           text NOT NULL CHECK (type IN ('in', 'out')),
  date           text NOT NULL CHECK (date ~ '^\d{4}-\d{2}-\d{2}$'),
  material_id    uuid NOT NULL REFERENCES materials(id),
  qty            numeric NOT NULL CHECK (qty > 0),
  input_qty      numeric,
  input_unit     text NOT NULL DEFAULT '',
  factor         numeric,
  price          numeric NOT NULL DEFAULT 0 CHECK (price >= 0),
  supplier       text NOT NULL DEFAULT '',
  doc_number     text NOT NULL DEFAULT '',
  department_id  uuid REFERENCES targets(id),
  vehicle_id     uuid REFERENCES targets(id),
  person         text NOT NULL DEFAULT '',
  meter          numeric CHECK (meter >= 0),
  note           text NOT NULL DEFAULT '',
  reason         text NOT NULL DEFAULT '' CHECK (reason IN ('', 'inventar')),
  inventory_id   uuid REFERENCES inventories(id) ON DELETE CASCADE,
  created_by     jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX movements_date ON movements (factory_id, date DESC, created_at DESC);
CREATE INDEX movements_material ON movements (factory_id, material_id, date);
CREATE INDEX movements_vehicle ON movements (vehicle_id) WHERE vehicle_id IS NOT NULL;

/* ---------- Ta'minotchilar ---------- */
CREATE TABLE suppliers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id  uuid NOT NULL REFERENCES factories(id),
  name        text NOT NULL,
  phone       text NOT NULL DEFAULT '',
  inn         text NOT NULL DEFAULT '',
  contact     text NOT NULL DEFAULT '',
  note        text NOT NULL DEFAULT '',
  archived    boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
-- katta-kichik harf va bo'shliqlarga qaramay nom takrorlanmaydi
CREATE UNIQUE INDEX suppliers_name ON suppliers (factory_id, lower(regexp_replace(btrim(name), '\s+', ' ', 'g')));

/* ---------- Tayyor mahsulotni brakka chiqarish ---------- */
CREATE TABLE product_moves (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id  uuid NOT NULL REFERENCES factories(id),
  type        text NOT NULL DEFAULT 'brak' CHECK (type IN ('brak')),
  date        text NOT NULL CHECK (date ~ '^\d{4}-\d{2}-\d{2}$'),
  product_id  uuid NOT NULL REFERENCES products(id),
  qty         numeric NOT NULL CHECK (qty >= 1),
  reason      text NOT NULL DEFAULT 'boshqa',
  note        text NOT NULL DEFAULT '',
  created_by  jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX product_moves_date ON product_moves (factory_id, date);

/* ---------- Texnika jurnali ---------- */
CREATE TABLE vehicle_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id  uuid NOT NULL REFERENCES factories(id),
  vehicle_id  uuid NOT NULL REFERENCES targets(id),
  date        text NOT NULL CHECK (date ~ '^\d{4}-\d{2}-\d{2}$'),
  kind        text NOT NULL DEFAULT 'tamir' CHECK (kind IN ('tamir', 'to', 'meter', 'boshqa')),
  cost        numeric NOT NULL DEFAULT 0 CHECK (cost >= 0),
  meter       numeric CHECK (meter >= 0),
  note        text NOT NULL DEFAULT '',
  created_by  jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX vehicle_logs_vehicle ON vehicle_logs (vehicle_id, date);

/* ---------- O'zgarishlar jurnali ---------- */
CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  factory_id  uuid REFERENCES factories(id),
  "user"      jsonb NOT NULL,
  action      text NOT NULL,
  entity      text NOT NULL DEFAULT '',
  entity_id   text NOT NULL DEFAULT '',
  label       text NOT NULL DEFAULT '',
  changes     jsonb NOT NULL DEFAULT '[]',
  more        int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_created ON audit_log (created_at DESC);
CREATE INDEX audit_log_entity ON audit_log (entity, created_at DESC);

/* ---------- Hisoblagichlar (buyurtma, inventarizatsiya raqami) ---------- */
CREATE TABLE counters (
  factory_id  uuid NOT NULL REFERENCES factories(id),
  name        text NOT NULL,
  seq         int NOT NULL,
  PRIMARY KEY (factory_id, name)
);

/* ---------- Kirish urinishlari (limits.js) ---------- */
CREATE TABLE login_attempts (
  key         text PRIMARY KEY,
  count       int NOT NULL DEFAULT 0,
  lock_until  timestamptz,
  expires_at  timestamptz NOT NULL
);
