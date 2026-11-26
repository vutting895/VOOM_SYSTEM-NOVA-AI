CREATE TABLE IF NOT EXISTS github_deliveries (
  delivery_id TEXT PRIMARY KEY NOT NULL,
  repository TEXT NOT NULL,
  event_name TEXT NOT NULL,
  action TEXT,
  ref TEXT,
  commit_sha TEXT,
  pull_request_number INTEGER,
  issue_number INTEGER,
  workflow_status TEXT,
  payload_sha256 TEXT NOT NULL,
  received_at TEXT NOT NULL,
  processing_status TEXT NOT NULL DEFAULT 'received'
    CHECK (processing_status IN ('received', 'processing', 'processed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_github_deliveries_repo_received
  ON github_deliveries (repository, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_github_deliveries_status_received
  ON github_deliveries (processing_status, received_at ASC);
