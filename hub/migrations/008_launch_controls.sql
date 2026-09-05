-- Existing credentials retain private compatibility. Device enrollment defaults
-- to public-only and the server binds reviewed scope to the issued generation.
ALTER TABLE bots ADD COLUMN credential_scope text NOT NULL DEFAULT 'legacy-private' CHECK(credential_scope IN ('legacy-private','pool-only'));
ALTER TABLE device_enrollments ADD COLUMN credential_scope text NOT NULL DEFAULT 'pool-only' CHECK(credential_scope IN ('legacy-private','pool-only'));
ALTER TABLE bots ADD COLUMN avatar_config jsonb;
ALTER TABLE bots ADD COLUMN avatar_revision integer NOT NULL DEFAULT 0 CHECK(avatar_revision>=0);
ALTER TABLE bots ADD COLUMN avatar_updated_at timestamptz;

ALTER TABLE pool_reports ADD COLUMN status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved','dismissed'));
ALTER TABLE pool_reports ADD COLUMN severity text NOT NULL DEFAULT 'routine' CHECK(severity IN ('routine','urgent'));
ALTER TABLE pool_reports ADD COLUMN resolved_by text REFERENCES owners(id);
ALTER TABLE pool_reports ADD COLUMN resolved_at timestamptz;
ALTER TABLE pool_reports ADD COLUMN resolution_reason text CHECK(length(resolution_reason)<=500);
ALTER TABLE pool_reports DROP CONSTRAINT pool_reports_owner_id_target_key_key;
CREATE UNIQUE INDEX pool_reports_open_dedup ON pool_reports(owner_id,target_key) WHERE status='open';
CREATE INDEX pool_reports_queue ON pool_reports(status,severity,created_at,id);
CREATE TABLE moderation_audit (
 id text PRIMARY KEY,
 actor_id text NOT NULL REFERENCES owners(id),
 action text NOT NULL,
 target_id text NOT NULL,
 reason text NOT NULL CHECK(length(reason)<=500),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX moderation_audit_created ON moderation_audit(created_at,id);
