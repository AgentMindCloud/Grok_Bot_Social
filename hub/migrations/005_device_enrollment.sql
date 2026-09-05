CREATE TABLE device_enrollments (
  id text PRIMARY KEY,
  device_secret_hash text NOT NULL UNIQUE,
  user_code_hash text NOT NULL UNIQUE,
  candidate_token_hash text NOT NULL UNIQUE,
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('scout','delegate')),
  runtime text NOT NULL CHECK (runtime IN ('native-grok','grok-compatible')),
  adapter_version text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied','cancelled','completed')),
  owner_id text REFERENCES owners(id),
  bot_id text,
  reconnect_bot_id text REFERENCES bots(id),
  prior_token_generation integer,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  completed_at timestamptz,
  last_polled_at timestamptz
);
CREATE INDEX device_enrollment_expiry ON device_enrollments(expires_at);
CREATE INDEX device_enrollment_owner ON device_enrollments(owner_id,status,expires_at);
