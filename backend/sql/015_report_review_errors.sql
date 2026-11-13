ALTER TABLE days ADD COLUMN review_status text NOT NULL DEFAULT 'draft' CHECK(review_status IN ('draft','submitted','approved'));
ALTER TABLE days ADD COLUMN version integer NOT NULL DEFAULT 1;
CREATE TABLE day_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),factory_id uuid NOT NULL REFERENCES factories(id),date text NOT NULL,
 action text NOT NULL CHECK(action IN ('submit','approve','return','reopen')),reason text NOT NULL DEFAULT '',actor jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(factory_id,date) REFERENCES days(factory_id,date) ON DELETE CASCADE
);
CREATE INDEX day_reviews_day ON day_reviews(factory_id,date,created_at DESC);
CREATE TABLE error_incidents (
 id uuid PRIMARY KEY,factory_id uuid REFERENCES factories(id),method text NOT NULL,route text NOT NULL,code text NOT NULL,
 frames text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX error_incidents_recent ON error_incidents(factory_id,created_at DESC);
