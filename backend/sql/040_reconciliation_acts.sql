-- Imzolangan akt sverka (solishtirma dalolatnoma) PDF fayllari: mijoz (keyinchalik ta'minotchi) bilan.
-- PDF dan o'qilgan raqamlar (parsed) va saqlash paytidagi dastur bilan solishtirish natijasi (comparison) saqlanadi.
-- Hisob-kitobga (qarz, to'lov) ta'sir qilmaydi — faqat hujjat va nazorat uchun.
CREATE TABLE finance_reconciliation_acts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 factory_id uuid NOT NULL REFERENCES factories(id),
 request_id uuid NOT NULL,
 party text NOT NULL CHECK (party IN ('customer','supplier')),
 counterparty text NOT NULL CHECK (btrim(counterparty) <> ''),
 period_from text NOT NULL CHECK (period_from ~ '^\d{4}-\d{2}-\d{2}$'),
 period_to text NOT NULL CHECK (period_to ~ '^\d{4}-\d{2}-\d{2}$' AND period_to >= period_from),
 parsed jsonb NOT NULL,
 comparison jsonb NOT NULL,
 matched boolean NOT NULL,
 note text NOT NULL DEFAULT '',
 name text NOT NULL,
 content_base64 text NOT NULL,
 size_bytes integer NOT NULL,
 created_by jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 voided_at timestamptz,
 void_reason text NOT NULL DEFAULT '',
 UNIQUE (factory_id, request_id)
);
CREATE INDEX finance_reconciliation_acts_party ON finance_reconciliation_acts (factory_id, party, period_to DESC);
