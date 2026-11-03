CREATE TABLE hr_employers (
 factory_id uuid PRIMARY KEY REFERENCES factories(id),
 profile jsonb NOT NULL DEFAULT '{}',
 version integer NOT NULL DEFAULT 1
);
CREATE TABLE hr_employment_docs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 factory_id uuid NOT NULL REFERENCES factories(id),
 employee_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('contract','hire','addendum','transfer','termination')),
 number text NOT NULL DEFAULT '',
 date text NOT NULL,
 effective_date text NOT NULL,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','issued','cancelled')),
 related_id uuid,
 payload jsonb NOT NULL,
 version integer NOT NULL DEFAULT 1,
 created_by jsonb NOT NULL,
 issued_by jsonb,
 issued_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(factory_id,employee_id,id),
 FOREIGN KEY(factory_id,employee_id) REFERENCES hr_employees(factory_id,id),
 FOREIGN KEY(factory_id,employee_id,related_id) REFERENCES hr_employment_docs(factory_id,employee_id,id) DEFERRABLE INITIALLY DEFERRED
);
CREATE UNIQUE INDEX hr_employment_doc_numbers ON hr_employment_docs(factory_id,(CASE WHEN kind IN ('hire','transfer','termination') THEN 'order' ELSE kind END),number) WHERE number<>'' AND status<>'cancelled';
CREATE INDEX hr_employment_doc_employee ON hr_employment_docs(factory_id,employee_id,created_at);
CREATE TABLE hr_employee_files (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 factory_id uuid NOT NULL REFERENCES factories(id),
 employee_id uuid NOT NULL,
 slot text NOT NULL,
 name text NOT NULL,
 mime text NOT NULL CHECK(mime IN ('application/pdf','image/jpeg','image/png')),
 size_bytes integer NOT NULL CHECK(size_bytes>0 AND size_bytes<=3145728),
 content_base64 text NOT NULL,
 uploaded_by jsonb NOT NULL,
 uploaded_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(factory_id,employee_id) REFERENCES hr_employees(factory_id,id)
);
