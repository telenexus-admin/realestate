ALTER TABLE visitor_logs
  ADD COLUMN IF NOT EXISTS registered_by uuid REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_visitor_logs_registered_by
  ON visitor_logs(registered_by);
