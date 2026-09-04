ALTER TABLE missions ADD COLUMN kind text NOT NULL DEFAULT 'research' CHECK(kind IN ('research','weekly-decision'));
CREATE TABLE mission_review_versions (
  id text PRIMARY KEY, mission_id text NOT NULL REFERENCES missions(id), owner_id text NOT NULL REFERENCES owners(id),
  version integer NOT NULL CHECK(version>0), decision text NOT NULL CHECK(decision IN ('test','watch','stop')),
  usefulness text NOT NULL CHECK(usefulness IN ('useful','partly_useful','not_useful','not_assessed')),
  rationale text NOT NULL, next_review_at timestamptz, assistance text NOT NULL CHECK(assistance IN ('assisted','unassisted','unknown')),
  review_duration_seconds integer CHECK(review_duration_seconds BETWEEN 1 AND 86400), measurement_snapshot jsonb,
  idempotency_key text NOT NULL, request_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(mission_id,version), UNIQUE(owner_id,idempotency_key)
);
CREATE TABLE review_citations (
  review_id text NOT NULL REFERENCES mission_review_versions(id), evidence_id text NOT NULL REFERENCES evidence(id),
  content_hash text NOT NULL, PRIMARY KEY(review_id,evidence_id)
);
CREATE TABLE weekly_mission_inputs (
  mission_id text PRIMARY KEY REFERENCES missions(id), owner_id text NOT NULL REFERENCES owners(id),
  input jsonb NOT NULL, input_hash text NOT NULL, prior_review_id text REFERENCES mission_review_versions(id),
  idempotency_key text NOT NULL, request_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id,idempotency_key)
);
CREATE TABLE mission_followups (
  mission_id text PRIMARY KEY REFERENCES missions(id), source_mission_id text NOT NULL REFERENCES missions(id),
  source_review_id text NOT NULL REFERENCES mission_review_versions(id), owner_id text NOT NULL REFERENCES owners(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE pilot_enrollments (
  owner_id text PRIMARY KEY REFERENCES owners(id), cohort_key text NOT NULL,
  classification text NOT NULL CHECK(classification IN ('internal','test','invited')),
  consent boolean NOT NULL, consent_version integer NOT NULL DEFAULT 1,
  assistance text NOT NULL CHECK(assistance IN ('assisted','unassisted','unknown')),
  enrolled_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE mission_measurement_snapshots (
  mission_id text PRIMARY KEY REFERENCES missions(id), snapshot jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mission_owner_page ON missions(owner_id,created_at DESC,id DESC);
CREATE INDEX evidence_owner_page ON evidence(owner_id,created_at DESC,id DESC);
CREATE INDEX evidence_mission_page ON evidence(mission_id,created_at DESC,id DESC);
CREATE INDEX evidence_circle_page ON evidence(circle_id,created_at DESC,id DESC) WHERE visibility='circle';
CREATE INDEX reviews_owner_page ON mission_review_versions(owner_id,created_at DESC,id DESC);
CREATE INDEX followups_source ON mission_followups(source_mission_id);
CREATE FUNCTION reject_beta_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Beta history is immutable'; END $$;
CREATE TRIGGER weekly_inputs_immutable BEFORE UPDATE OR DELETE ON weekly_mission_inputs FOR EACH ROW EXECUTE FUNCTION reject_beta_history_mutation();
CREATE TRIGGER reviews_immutable BEFORE UPDATE OR DELETE ON mission_review_versions FOR EACH ROW EXECUTE FUNCTION reject_beta_history_mutation();
CREATE TRIGGER citations_immutable BEFORE UPDATE OR DELETE ON review_citations FOR EACH ROW EXECUTE FUNCTION reject_beta_history_mutation();
CREATE TRIGGER followups_immutable BEFORE UPDATE OR DELETE ON mission_followups FOR EACH ROW EXECUTE FUNCTION reject_beta_history_mutation();
CREATE TRIGGER mission_measurement_immutable BEFORE UPDATE OR DELETE ON mission_measurement_snapshots FOR EACH ROW EXECUTE FUNCTION reject_beta_history_mutation();
