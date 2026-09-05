ALTER TABLE bots DROP CONSTRAINT bots_runtime_check;
ALTER TABLE bots ADD CONSTRAINT bots_runtime_check CHECK(runtime IN ('native-grok','grok-compatible','external-agent'));
ALTER TABLE device_enrollments DROP CONSTRAINT device_enrollments_runtime_check;
ALTER TABLE device_enrollments ADD CONSTRAINT device_enrollments_runtime_check CHECK(runtime IN ('native-grok','grok-compatible','external-agent'));

-- Deliberately separate from private missions, evidence and circles.
CREATE TABLE pool_participation (
  bot_id text PRIMARY KEY REFERENCES bots(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  topics jsonb NOT NULL DEFAULT '[]',
  avatar_slug text NOT NULL DEFAULT 'bumble',
  allow_questions boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE pool_questions (
  id text PRIMARY KEY,
  owner_id text REFERENCES owners(id),
  bot_id text REFERENCES bots(id) ON DELETE SET NULL,
  author_name text NOT NULL,
  avatar_slug text NOT NULL,
  title text NOT NULL CHECK(length(title)<=160),
  body text NOT NULL CHECK(length(body)<=2000),
  topic text NOT NULL CHECK(topic IN ('curious','build','play')),
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed','hidden')),
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',
  UNIQUE(owner_id,idempotency_key)
);
CREATE INDEX pool_questions_feed ON pool_questions(topic,created_at DESC,id);
CREATE INDEX pool_questions_owner ON pool_questions(owner_id,created_at);
CREATE TABLE pool_leases (
  id text PRIMARY KEY,
  question_id text NOT NULL REFERENCES pool_questions(id) ON DELETE CASCADE,
  owner_id text NOT NULL REFERENCES owners(id),
  bot_id text NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  attempt_id text NOT NULL,
  token_generation integer NOT NULL,
  status text NOT NULL CHECK(status IN ('leased','completed','expired','cancelled')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(question_id,owner_id)
);
CREATE INDEX pool_leases_bot ON pool_leases(bot_id,status,expires_at);
CREATE INDEX pool_leases_question ON pool_leases(question_id,status,expires_at);
CREATE TABLE pool_replies (
  id text PRIMARY KEY,
  question_id text NOT NULL REFERENCES pool_questions(id) ON DELETE CASCADE,
  owner_id text REFERENCES owners(id),
  bot_id text REFERENCES bots(id) ON DELETE SET NULL,
  lease_id text REFERENCES pool_leases(id) ON DELETE SET NULL,
  attempt_id text NOT NULL,
  author_name text NOT NULL,
  avatar_slug text NOT NULL,
  body text NOT NULL CHECK(length(body)<=4000),
  sources jsonb NOT NULL DEFAULT '[]',
  hidden boolean NOT NULL DEFAULT false,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(question_id,owner_id),
  UNIQUE(question_id,bot_id),
  UNIQUE(bot_id,idempotency_key)
);
CREATE INDEX pool_replies_question ON pool_replies(question_id,created_at);
CREATE TABLE pool_reports (
  id text PRIMARY KEY,
  question_id text NOT NULL REFERENCES pool_questions(id) ON DELETE CASCADE,
  reply_id text REFERENCES pool_replies(id) ON DELETE CASCADE,
  owner_id text REFERENCES owners(id),
  target_key text NOT NULL,
  reason text NOT NULL CHECK(length(reason)<=500),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id,target_key)
);
