ALTER TABLE hr_employees ADD COLUMN profile jsonb NOT NULL DEFAULT '{}';
CREATE TABLE hr_records (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 factory_id uuid NOT NULL REFERENCES factories(id),
 employee_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('leave','shift','order','document','equipment')),
 title text NOT NULL,
 start_date text NOT NULL,
 end_date text NOT NULL,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','cancelled','completed')),
 detail jsonb NOT NULL DEFAULT '{}',
 version integer NOT NULL DEFAULT 1,
 created_by jsonb NOT NULL,
 decided_by jsonb,
 reason text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(factory_id,employee_id) REFERENCES hr_employees(factory_id,id)
);
CREATE INDEX hr_records_lookup ON hr_records(factory_id,kind,start_date,end_date);
CREATE TABLE hr_leave_allowances (
 factory_id uuid NOT NULL,
 employee_id uuid NOT NULL,
 year integer NOT NULL CHECK(year BETWEEN 1900 AND 2200),
 days numeric NOT NULL CHECK(days>=0 AND days<=366),
 used_before numeric NOT NULL DEFAULT 0 CHECK(used_before>=0 AND used_before<=days),
 version integer NOT NULL DEFAULT 1,
 PRIMARY KEY(factory_id,employee_id,year),
 FOREIGN KEY(factory_id,employee_id) REFERENCES hr_employees(factory_id,id)
);
