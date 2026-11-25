-- Tasdiqlangan va imzolangan oylik tabellarning PDF arxivi (eski oylar ham yuklanadi)
CREATE TABLE hr_timesheet_files (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 factory_id uuid NOT NULL REFERENCES factories(id),
 month text NOT NULL CHECK(month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
 title text NOT NULL DEFAULT '',
 name text NOT NULL,
 mime text NOT NULL DEFAULT 'application/pdf' CHECK(mime='application/pdf'),
 size_bytes integer NOT NULL CHECK(size_bytes>0 AND size_bytes<=3145728),
 content_base64 text NOT NULL,
 uploaded_by jsonb NOT NULL,
 uploaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hr_timesheet_files_month ON hr_timesheet_files(factory_id,month,uploaded_at);
