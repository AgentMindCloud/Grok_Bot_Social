ALTER TABLE owners ADD COLUMN status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended','closed'));
ALTER TABLE owners ADD COLUMN account_classification text NOT NULL DEFAULT 'invited' CHECK(account_classification IN ('internal','test','invited','self-service'));
UPDATE owners SET account_classification=p.classification FROM pilot_enrollments p WHERE p.owner_id=owners.id;
UPDATE owners SET account_classification='test' WHERE github_id LIKE 'local:%';
CREATE TABLE provider_identities (
  provider text NOT NULL CHECK(provider IN ('github','x')),
  provider_user_id text NOT NULL,
  owner_id text NOT NULL REFERENCES owners(id),
  handle text NOT NULL, display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(provider,provider_user_id), UNIQUE(owner_id,provider)
);
INSERT INTO provider_identities(provider,provider_user_id,owner_id,handle,display_name)
 SELECT 'github',github_id,id,handle,display_name FROM owners WHERE github_id ~ '^[1-9][0-9]{0,19}$';
ALTER TABLE sessions ADD COLUMN authenticated_at timestamptz NOT NULL DEFAULT now();
UPDATE sessions SET authenticated_at='1970-01-01T00:00:00Z';
ALTER TABLE sessions ADD COLUMN auth_provider text CHECK(auth_provider IN ('github','x','local'));
ALTER TABLE oauth_states ADD COLUMN provider text NOT NULL DEFAULT 'github' CHECK(provider IN ('github','x'));
ALTER TABLE oauth_states ADD COLUMN return_target text NOT NULL DEFAULT 'workspace' CHECK(return_target IN ('workspace','connect'));
ALTER TABLE oauth_states ADD COLUMN purpose text NOT NULL DEFAULT 'login' CHECK(purpose IN ('login','link','reauth'));
ALTER TABLE oauth_states ADD COLUMN owner_id text REFERENCES owners(id);
ALTER TABLE oauth_states ADD COLUMN session_hash text;
ALTER TABLE oauth_states ADD COLUMN verifier_secret_hash text;
ALTER TABLE bots ADD COLUMN token_generation integer NOT NULL DEFAULT 1;
ALTER TABLE pilot_enrollments DROP CONSTRAINT pilot_enrollments_classification_check;
ALTER TABLE pilot_enrollments ADD CONSTRAINT pilot_enrollments_classification_check CHECK(classification IN ('internal','test','invited','self-service'));
CREATE TABLE auth_provider_circuits (provider text PRIMARY KEY CHECK(provider='x'), reason text NOT NULL, opened_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX sessions_owner ON sessions(owner_id);
CREATE INDEX oauth_states_expiry ON oauth_states(expires_at);
