-- Moliyaviy oyni yopish (qulflash). Yopilgan oyga sotuv fakturasi, to'lov, material fakturasi,
-- ta'minotchi yozuvi, mijoz boshlang'ich qoldig'i va eski jo'natma kiritib/bekor qilib bo'lmaydi.
-- Bitta oy uchun bitta qator: qayta ochilsa reopened_* to'ldiriladi, qayta yopilsa tozalanadi.
CREATE TABLE finance_period_locks (
 factory_id uuid NOT NULL REFERENCES factories(id),
 month text NOT NULL CHECK (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
 locked_at timestamptz NOT NULL DEFAULT now(),
 locked_by jsonb NOT NULL,
 note text NOT NULL DEFAULT '',
 reopened_at timestamptz,
 reopened_by jsonb,
 reopen_reason text NOT NULL DEFAULT '',
 PRIMARY KEY (factory_id, month)
);
