-- VOOM commercial skills access: schema scaffold only; not connected to a public service.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS tenants (
    tenant_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','suspended','closed')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS api_keys (
    key_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id),
    key_hash TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    scopes_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT,
    last_used_at TEXT
);

CREATE TABLE IF NOT EXISTS skill_entitlements (
    entitlement_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id),
    skill_name TEXT NOT NULL,
    allowed_version TEXT NOT NULL DEFAULT '*',
    plan_code TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','past_due','revoked','expired')),
    quota_units INTEGER,
    period_start TEXT,
    period_end TEXT,
    UNIQUE(tenant_id, skill_name)
);

CREATE TABLE IF NOT EXISTS usage_events (
    event_id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL UNIQUE,
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id),
    key_id TEXT REFERENCES api_keys(key_id),
    skill_name TEXT NOT NULL,
    skill_version TEXT NOT NULL,
    operation TEXT NOT NULL,
    units INTEGER NOT NULL DEFAULT 1 CHECK(units >= 0),
    outcome TEXT NOT NULL,
    occurred_at TEXT NOT NULL DEFAULT (datetime('now')),
    metadata_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_usage_tenant_time ON usage_events(tenant_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_usage_skill_time ON usage_events(skill_name, occurred_at);

-- Prices and payment-provider IDs belong in a separately secured billing integration.
-- Never store raw API keys, card data, or secrets in this database.
