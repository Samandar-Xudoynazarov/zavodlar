CREATE TABLE hr_company_files (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 factory_id uuid NOT NULL REFERENCES factories(id),
 category text NOT NULL CHECK(category IN ('policy','job','application','certificate','order','other')),
 title text NOT NULL,
 date text NOT NULL DEFAULT '',
 name text NOT NULL,
 mime text NOT NULL CHECK(mime IN ('application/pdf','image/jpeg','image/png')),
 size_bytes integer NOT NULL CHECK(size_bytes>0 AND size_bytes<=3145728),
 content_base64 text NOT NULL,
 uploaded_by jsonb NOT NULL,
 uploaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hr_company_files_factory ON hr_company_files(factory_id,category,uploaded_at DESC);
