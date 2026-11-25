-- Kassa va bank: hisoblar (naqd kassa, bank hisob raqami) va ularning kirim-chiqimi.
-- Qoldiq = boshlang'ich qoldiq + kirimlar − chiqimlar (bekor qilinganlar hisobga olinmaydi).
-- category='xarajat' bo'lgan chiqimlar «Foyda va zarar» hisobotida boshqa xarajatlar sifatida olinadi.
CREATE TABLE finance_cash_accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 factory_id uuid NOT NULL REFERENCES factories(id),
 name text NOT NULL CHECK (btrim(name) <> ''),
 kind text NOT NULL CHECK (kind IN ('naqd','bank')),
 opening_balance numeric(18,2) NOT NULL DEFAULT 0,
 opening_date text NOT NULL CHECK (opening_date ~ '^\d{4}-\d{2}-\d{2}$'),
 archived boolean NOT NULL DEFAULT false,
 created_by jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (factory_id, id)
);
CREATE UNIQUE INDEX finance_cash_account_name ON finance_cash_accounts (factory_id, lower(btrim(name)));

CREATE TABLE finance_cash_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 factory_id uuid NOT NULL REFERENCES factories(id),
 account_id uuid NOT NULL,
 request_id uuid NOT NULL,
 date text NOT NULL CHECK (date ~ '^\d{4}-\d{2}-\d{2}$'),
 direction text NOT NULL CHECK (direction IN ('in','out')),
 amount numeric(18,2) NOT NULL CHECK (amount > 0),
 category text NOT NULL CHECK (category IN ('mijoz','taminotchi','oylik','soliq','xarajat','otkazma','boshqa')),
 counterparty text NOT NULL DEFAULT '',
 doc_number text NOT NULL DEFAULT '',
 note text NOT NULL DEFAULT '',
 created_by jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 voided_at timestamptz,
 void_reason text NOT NULL DEFAULT '',
 FOREIGN KEY (factory_id, account_id) REFERENCES finance_cash_accounts (factory_id, id),
 UNIQUE (factory_id, request_id)
);
CREATE INDEX finance_cash_entries_date ON finance_cash_entries (factory_id, date);
CREATE INDEX finance_cash_entries_account ON finance_cash_entries (account_id, date) WHERE voided_at IS NULL;
