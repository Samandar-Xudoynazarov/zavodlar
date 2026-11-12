CREATE TABLE hr_departments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 factory_id uuid NOT NULL REFERENCES factories(id),
 name text NOT NULL CHECK (btrim(name)<>''),
 version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(factory_id,name)
);
CREATE UNIQUE INDEX hr_departments_unique_name ON hr_departments(factory_id,lower(btrim(name)));
INSERT INTO hr_departments(factory_id,name)
 SELECT factory_id,min(btrim(department)) FROM hr_employees WHERE btrim(department)<>'' GROUP BY factory_id,lower(btrim(department));
UPDATE hr_employees e SET department=d.name FROM hr_departments d WHERE e.factory_id=d.factory_id AND lower(btrim(e.department))=lower(d.name);
