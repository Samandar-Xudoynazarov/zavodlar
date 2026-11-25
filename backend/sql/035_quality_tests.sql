-- Sifat nazorati: beton namunalarini (kub) siqilishga sinash.
-- Har bir partiya uchun 7 va 28 kunlik natijalar (MPa). Talab — loyiha mustahkamligi (MPa).
-- Natija talabga yetmasa — «yaroqsiz», 28 kunlik natija hali bo'lmasa — «kutilmoqda».
CREATE TABLE quality_tests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 factory_id uuid NOT NULL REFERENCES factories(id),
 request_id uuid NOT NULL,
 cast_date text NOT NULL CHECK (cast_date ~ '^\d{4}-\d{2}-\d{2}$'),
 batch text NOT NULL DEFAULT '',
 grade text NOT NULL CHECK (btrim(grade) <> ''),
 product_id uuid REFERENCES products(id) ON DELETE SET NULL,
 samples integer NOT NULL DEFAULT 3 CHECK (samples BETWEEN 1 AND 50),
 required_mpa numeric(8,2) NOT NULL CHECK (required_mpa > 0),
 r7_mpa numeric(8,2) CHECK (r7_mpa IS NULL OR r7_mpa >= 0),
 r28_mpa numeric(8,2) CHECK (r28_mpa IS NULL OR r28_mpa >= 0),
 lab text NOT NULL DEFAULT '',
 note text NOT NULL DEFAULT '',
 created_by jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_by jsonb,
 updated_at timestamptz NOT NULL DEFAULT now(),
 voided_at timestamptz,
 void_reason text NOT NULL DEFAULT '',
 UNIQUE (factory_id, request_id)
);
CREATE INDEX quality_tests_date ON quality_tests (factory_id, cast_date);
