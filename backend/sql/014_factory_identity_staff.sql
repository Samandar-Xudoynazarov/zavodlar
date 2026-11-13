ALTER TABLE settings ADD COLUMN document_profile jsonb NOT NULL DEFAULT '{}';
ALTER TABLE settings ADD COLUMN document_version integer NOT NULL DEFAULT 1;
CREATE TABLE hr_staff_positions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),factory_id uuid NOT NULL REFERENCES factories(id),
 department text NOT NULL DEFAULT '',position text NOT NULL CHECK(btrim(position)<>''),
 slots integer NOT NULL CHECK(slots BETWEEN 0 AND 100000),version integer NOT NULL DEFAULT 1,
 UNIQUE(factory_id,department,position)
);
CREATE UNIQUE INDEX hr_staff_positions_name ON hr_staff_positions(factory_id,lower(btrim(department)),lower(btrim(position)));
