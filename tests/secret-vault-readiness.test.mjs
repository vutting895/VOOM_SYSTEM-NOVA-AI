import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const sql = readFileSync(new URL("supabase/verification/secret-vault-readiness.sql", root), "utf8");
const compose = readFileSync(new URL("infra/docker-compose.yml", root), "utf8");
const readinessDoc = readFileSync(new URL("docs/implementation/NOVA-AUTO-API-SECRET-MANAGER-READINESS.md", root), "utf8");

test("Vault readiness SQL is read-only and never selects credential values", () => {
  const executableSql = sql.replace(/^\s*--.*$/gm, "");
  assert.doesNotMatch(executableSql, /\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|CALL|DO)\b/i);
  assert.match(executableSql, /pg_extension/);
  assert.match(executableSql, /role_table_grants/);
  assert.match(executableSql, /role_routine_grants/);
  assert.match(executableSql, /has_schema_privilege/);
  assert.doesNotMatch(executableSql, /select\s+decrypted_secret\s+from/i);
  assert.doesNotMatch(executableSql, /vault\.create_secret\s*\(/i);
});

test("local frontend Compose service does not receive provider or Bridge credentials", () => {
  assert.doesNotMatch(compose, /BINANCE_API_(KEY|SECRET)/i);
  assert.doesNotMatch(compose, /BYBIT_API_(KEY|SECRET)/i);
  assert.doesNotMatch(compose, /MT5_BRIDGE_(TOKEN|HEALTH_URL)/i);
  assert.match(compose, /frontend:/);
  assert.match(compose, /NODE_ENV: development/);
});

test("readiness document keeps credential operations disabled until every Vault gate passes", () => {
  assert.match(readinessDoc, /BLOCK credential writes and reads/);
  assert.match(readinessDoc, /credential_vault_unavailable/);
  assert.match(readinessDoc, /dedicated server-side role\/path/);
  assert.match(readinessDoc, /two staging users/);
  assert.match(readinessDoc, /Live Trading/);
});


test("read-only Vault audit reports legacy credential metadata without reading user_brokers rows", () => {
  const executableSql = sql.replace(/^\s*--.*$/gm, "");
  assert.match(executableSql, /role_column_grants/);
  assert.match(executableSql, /pg_policies/);
  assert.match(executableSql, /legacy_user_brokers_credential_surface/);
  assert.match(executableSql, /api_key/);
  assert.match(executableSql, /api_secret_encrypted/);
  assert.match(executableSql, /passphrase_encrypted/);
  assert.doesNotMatch(executableSql, /select\s+.+\s+from\s+public\.user_brokers/i);
});

test("readiness document records legacy credential surface as a blocked cleanup item", () => {
  assert.match(readinessDoc, /legacy `public\.user_brokers` table/);
  assert.match(readinessDoc, /RLS policies/);
  assert.match(readinessDoc, /Do not read credential rows/);
});