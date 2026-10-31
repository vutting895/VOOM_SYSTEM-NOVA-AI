-- Synthetic-only prototype schema. Do not bind this database to a public/production Worker.
-- Stores authenticated ciphertext and wrapped DEKs only; never plaintext credentials.
CREATE TABLE IF NOT EXISTS synthetic_credentials (
  id TEXT PRIMARY KEY,
  fixture_id TEXT NOT NULL CHECK (fixture_id = 'fixture-001'),
  algorithm TEXT NOT NULL CHECK (algorithm = 'A256GCM'),
  nonce TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  wrapped_dek TEXT NOT NULL,
  wrap_nonce TEXT NOT NULL,
  key_version TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_synthetic_credentials_fixture_created
  ON synthetic_credentials (fixture_id, created_at DESC);
