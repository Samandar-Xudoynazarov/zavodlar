ALTER TABLE materials ADD COLUMN IF NOT EXISTS history jsonb NOT NULL DEFAULT '[]';
CREATE TABLE factory_imports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), factory_id uuid NOT NULL REFERENCES factories(id),
 request_id uuid NOT NULL UNIQUE, source_hash text NOT NULL, source_name text NOT NULL,
 source_created_at text NOT NULL DEFAULT '', counts jsonb NOT NULL, replaced boolean NOT NULL DEFAULT false,
 source_data jsonb NOT NULL, previous_data jsonb NOT NULL, created_by jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(factory_id,source_hash)
);
CREATE INDEX factory_imports_factory ON factory_imports(factory_id,created_at DESC);
