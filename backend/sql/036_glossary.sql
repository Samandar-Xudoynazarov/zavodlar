-- Lug'at: foydalanuvchilar kiritgan nomlar (mahsulot, material, mijoz...) va tayyor iboralarning
-- o'zbekcha va ruscha shakli. Ekranda tanlangan tilga qarab ko'rsatiladi; bazadagi asl matn o'zgarmaydi.
-- kind: name — nom, phrase — izohlar uchun tayyor ibora (izoh maydonida tanlab qo'yiladi)
CREATE TABLE glossary (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 factory_id uuid NOT NULL REFERENCES factories(id),
 uz text NOT NULL CHECK (btrim(uz) <> '' AND length(uz) <= 300),
 ru text NOT NULL CHECK (btrim(ru) <> '' AND length(ru) <= 300),
 kind text NOT NULL DEFAULT 'name' CHECK (kind IN ('name', 'phrase')),
 created_by jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_by jsonb,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX glossary_uz ON glossary (factory_id, lower(regexp_replace(btrim(uz), '\s+', ' ', 'g')));
CREATE UNIQUE INDEX glossary_ru ON glossary (factory_id, lower(regexp_replace(btrim(ru), '\s+', ' ', 'g')));
