import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const sql = readFileSync(new URL("supabase/verification/secret-vault-readiness.sql", root), "utf8");
const compose = readFileSync(new URL("infra/docker-compose.yml", root), "utf8");
const readinessDoc = readFileSync(new URL("docs/implementation/NOVA-AUTO-API-SECRET-MANAGER-READINESS.md", root), "utf8");
const rotationPolicy = readFileSync(new URL("docs/implementation/NOVA-SECRET-ROTATION-ON-NEXT-USE.md", root), "utf8");

test("Vault readiness SQL is read-only and never selects credential values", () => {
  const executableSql = sql.replace(/^\\s*--.*$/gm, "");
  assert.doesNotMatch(executableSql, /\\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|CALL|DO)\\b/i);
  assert.match(executableSql, /pg_extension/);
  assert.match(executableSql, /role_table_grants/);
  assert.match(executableSql, /role_routine_grants/);
  assert.match(executableSql, /has_schema_privilege/);
  assert.doesNotMatch(executableSql, /select\\s+decrypted_secret\\s+from/i);
  assert.doesNotMatch(executableSql, /vault\\.create_secret\\s*\\(/i);
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
  assert.match(readinessDoc, /dedicated server-side role\\/path/);
  assert.match(readinessDoc, /two staging users/);
  assert.match(readinessDoc, /Live Trading/);
});

test("rotation policy is before the next distinct use, not immediately after the current use", () => {
  assert.match(rotationPolicy, /ROTATE_ON_NEXT_USE/);
  assert.match(rotationPolicy, /After that provider operation succeeds, persist \`ROTATION_REQUIRED\`/);
  assert.match(rotationPolicy, /Before the next distinct use, rotate\\/refresh the credential/);
  assert.match(rotationPolicy, /V1 for use 1, V2 for use 2, V3 for use 3/);
});

test("only a confirmed successful authorized provider operation counts as a use", () => {
  assert.match(rotationPolicy, /completes successfully with a confirmed success response/);
  assert.match(rotationPolicy, /do not count as successful uses/);
  assert.match(rotationPolicy, /USE_OUTCOME_UNKNOWN/);
  assert.match(rotationPolicy, /same idempotency key is the same logical operation/);
});

test("next use requires serialized rotation, validation, version switch, and retirement", () => {
  const lock = rotationPolicy.indexOf("Acquire a per-connection rotation lock/lease");
  const rotate = rotationPolicy.indexOf("create a successor credential");
  const validate = rotationPolicy.indexOf("Validate the successor");
  const switchVersion = rotationPolicy.indexOf("Atomically compare-and-set the active version");
  const revoke = rotationPolicy.indexOf("Revoke the previous credential version");
  const execute = rotationPolicy.indexOf("Execute the requested operation with the new active version");
  assert.ok(lock >= 0 && rotate > lock && validate > rotate && switchVersion > validate);
  assert.ok(revoke > switchVersion && execute > revoke);
});

test("provider incompatibility and rotation failures fail closed", () => {
  assert.match(rotationPolicy, /ROTATION_UNSUPPORTED/);
  assert.match(rotationPolicy, /do not silently fall back to indefinite reuse/);
  assert.match(rotationPolicy, /do not execute the requested customer operation using the stale version/);
  assert.match(rotationPolicy, /REAUTH_REQUIRED/);
});

test("policy requires tenant isolation, secret redaction, and read-only provider capabilities", () => {
  assert.match(rotationPolicy, /Customer A cannot read, rotate, use, or revoke Customer B/);
  assert.match(rotationPolicy, /must never reach browser code, generated UI, the AI model, MCP payloads/);
  assert.match(rotationPolicy, /Keep provider capabilities read-only/);
  assert.match(rotationPolicy, /does not enable the Vault, create customer credentials, grant database privileges/);
});
