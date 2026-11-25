CREATE TABLE IF NOT EXISTS nova_brain_events (
  tenant_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  event_type TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL CHECK(length(payload_sha256) = 64),
  received_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_nova_brain_events_tenant_received
  ON nova_brain_events (tenant_id, received_at DESC);
