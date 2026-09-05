ALTER TABLE owners ADD COLUMN closed_at timestamptz;
ALTER TABLE owners ADD COLUMN purged_at timestamptz;
CREATE TABLE owner_usage (
  owner_id text PRIMARY KEY REFERENCES owners(id),
  stored_bytes bigint NOT NULL DEFAULT 0 CHECK(stored_bytes >= 0)
);
CREATE TABLE mission_admissions (
  mission_id text PRIMARY KEY,
  owner_id text NOT NULL REFERENCES owners(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mission_admissions_window ON mission_admissions(owner_id,created_at);
CREATE TABLE research_reservations (
  owner_id text NOT NULL REFERENCES owners(id),
  mission_id text NOT NULL REFERENCES missions(id) DEFERRABLE INITIALLY DEFERRED,
  reserved_bytes bigint NOT NULL CHECK(reserved_bytes>=0),
  PRIMARY KEY(owner_id,mission_id)
);
CREATE TABLE result_usage (
  task_id text PRIMARY KEY REFERENCES tasks(id),
  owner_id text NOT NULL REFERENCES owners(id),
  content_bytes bigint NOT NULL CHECK(content_bytes>=0)
);
CREATE TABLE service_capacity (
  id integer PRIMARY KEY CHECK(id=1), paused boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO service_capacity(id) VALUES(1);
INSERT INTO mission_admissions(mission_id,owner_id,created_at) SELECT id,owner_id,created_at FROM missions;
INSERT INTO owner_usage(owner_id,stored_bytes)
SELECT o.id,
 COALESCE((SELECT sum(octet_length(row_to_json(e)::text)+4096) FROM evidence e WHERE e.owner_id=o.id),0)
 +COALESCE((SELECT sum(octet_length(row_to_json(m)::text)+4096) FROM missions m WHERE m.owner_id=o.id),0)
 +COALESCE((SELECT sum(octet_length(row_to_json(r)::text)+4096) FROM mission_review_versions r WHERE r.owner_id=o.id),0)
 +COALESCE((SELECT sum(octet_length(row_to_json(w)::text)+4096) FROM weekly_mission_inputs w WHERE w.owner_id=o.id),0)
FROM owners o;
INSERT INTO research_reservations(owner_id,mission_id,reserved_bytes)
SELECT b.owner_id,t.mission_id,count(*)*262144 FROM tasks t JOIN bots b ON b.id=t.bot_id JOIN missions m ON m.id=t.mission_id
WHERE t.status IN ('queued','leased') AND m.status IN ('queued','running') GROUP BY b.owner_id,t.mission_id;

-- Evidence retained solely to support another owner's immutable citation has
-- no content, source, ownership or accessible circle. Its ID is an opaque tombstone.
ALTER TABLE evidence ADD COLUMN erased_at timestamptz;
ALTER TABLE evidence ALTER COLUMN owner_id DROP NOT NULL;

-- History stays append-only. Erasure permits DELETE only for records owned by
-- an already closed account. No session toggle, UPDATE bypass or global disable.
CREATE OR REPLACE FUNCTION reject_beta_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE history_owner text;
BEGIN
 IF TG_OP='DELETE' THEN
   IF TG_TABLE_NAME IN ('weekly_mission_inputs','mission_review_versions','mission_followups') THEN
     history_owner := OLD.owner_id;
   ELSIF TG_TABLE_NAME='review_citations' THEN
     SELECT owner_id INTO history_owner FROM mission_review_versions WHERE id=OLD.review_id;
   ELSIF TG_TABLE_NAME='mission_measurement_snapshots' THEN
     SELECT owner_id INTO history_owner FROM missions WHERE id=OLD.mission_id;
   END IF;
   IF history_owner IS NOT NULL AND EXISTS(SELECT 1 FROM owners WHERE id=history_owner AND status='closed' AND closed_at IS NOT NULL) THEN
     RETURN OLD;
   END IF;
 END IF;
 RAISE EXCEPTION 'Beta history is immutable';
END $$;
