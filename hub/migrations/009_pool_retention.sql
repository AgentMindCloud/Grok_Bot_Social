ALTER TABLE pool_questions ADD COLUMN purged_at timestamptz;
ALTER TABLE pool_replies ADD COLUMN purged_at timestamptz;
CREATE INDEX pool_questions_retention ON pool_questions(expires_at,id) WHERE purged_at IS NULL;
CREATE INDEX pool_questions_expiry ON pool_questions(expires_at,id) WHERE status='open';
CREATE INDEX pool_leases_expiry ON pool_leases(expires_at,id) WHERE status='leased';
CREATE INDEX pool_reports_retention ON pool_reports(resolved_at,id) WHERE status<>'open';
CREATE TABLE maintenance_audit (
 id text PRIMARY KEY,
 counts jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
