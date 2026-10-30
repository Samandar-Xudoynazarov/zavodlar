ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin','rahbar','pto','usta','omborchi','buxgalter','kadrlar','kuzatuvchi','kurator'));

CREATE TABLE hr_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id uuid NOT NULL REFERENCES factories(id),
  code text NOT NULL,
  name text NOT NULL,
  position text NOT NULL DEFAULT '',
  department text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  hire_date text NOT NULL,
  end_date text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(factory_id,code), UNIQUE(factory_id,id)
);
CREATE TABLE hr_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id uuid NOT NULL REFERENCES factories(id),
  employee_id uuid NOT NULL,
  effective_date text NOT NULL,
  salary numeric(16,2) NOT NULL CHECK(salary>=0),
  coefficient numeric(16,2) NOT NULL DEFAULT 247500 CHECK(coefficient>=0),
  grade text NOT NULL DEFAULT '',
  reason text NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 1,
  created_by jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(factory_id,employee_id) REFERENCES hr_employees(factory_id,id),
  UNIQUE(factory_id,employee_id,effective_date)
);
CREATE TABLE hr_months (
  factory_id uuid NOT NULL REFERENCES factories(id),
  month text NOT NULL CHECK(month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','closed')),
  norm_hours numeric NOT NULL CHECK(norm_hours>0 AND norm_hours<=744),
  tax_rate numeric NOT NULL DEFAULT 12 CHECK(tax_rate>=0 AND tax_rate<=100),
  work_days jsonb NOT NULL DEFAULT '[1,2,3,4,5]',
  holidays jsonb NOT NULL DEFAULT '[]',
  attendance jsonb NOT NULL DEFAULT '{}',
  adjustments jsonb NOT NULL DEFAULT '{}',
  snapshot jsonb,
  version integer NOT NULL DEFAULT 1,
  approved_by jsonb,
  closed_by jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(factory_id,month)
);
CREATE TABLE hr_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id uuid NOT NULL,
  month text NOT NULL,
  employee_id uuid NOT NULL,
  date text NOT NULL,
  method text NOT NULL CHECK(method IN ('cash','card')),
  kind text NOT NULL CHECK(kind IN ('advance','salary')),
  amount numeric(16,2) NOT NULL CHECK(amount>0),
  note text NOT NULL DEFAULT '',
  request_id uuid NOT NULL,
  created_by jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  voided_by jsonb,
  void_reason text NOT NULL DEFAULT '',
  FOREIGN KEY(factory_id,month) REFERENCES hr_months(factory_id,month),
  FOREIGN KEY(factory_id,employee_id) REFERENCES hr_employees(factory_id,id),
  UNIQUE(factory_id,request_id)
);
CREATE TABLE hr_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id uuid NOT NULL REFERENCES factories(id),
  actor jsonb NOT NULL,
  action text NOT NULL,
  entity_id text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hr_rates_lookup ON hr_rates(factory_id,employee_id,effective_date);
CREATE INDEX hr_payments_month ON hr_payments(factory_id,month);
CREATE INDEX hr_events_factory ON hr_events(factory_id,created_at DESC);
