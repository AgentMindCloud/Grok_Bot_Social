ALTER TABLE missions DROP CONSTRAINT missions_status_check;
ALTER TABLE missions ADD CONSTRAINT missions_status_check CHECK(status IN ('queued','running','completed','failed','cancelled'));
