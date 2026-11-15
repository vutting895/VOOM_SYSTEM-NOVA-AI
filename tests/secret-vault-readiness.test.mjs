import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const sql = readFileSync(new URL("supabase/verification/secret-vault-readiness.sql", root), "utf8");
const compose = readFileSync(new URL("infra/docker-compose.yml", root), "utf8");
const readinessDoc = readFileSync(new URL("docs/implementation/NOVA-AUTO-API-SECRET-MANAGER-READINESS.md", root), "utf8");
const rotationPolicy = readFileSync(new URL("docs/implementation/NOVA-SECRET-ROTATION-ON-NEXT-USE.md", root), "utf8");
const accessDesign = readFileSync(new URL("docs/implementation/NOVA-DEDICATED-VAULT-ACCESS-DESIGN.md", root), "utf8");

const executableSql = sql.replace(/^\s*--.*$/gm, "");
const has = (text, pattern) => assert.match(text, pattern, "Expected document to contain " + pattern);

test("Vault readiness SQL is catalog-only, read-only and never selects credential values", () => {
  assert.doesNotMatch(executableSql, /\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|CALL|DO)\b/i);
  has(executableSql, /pg_extension/);
  has(executableSql, /role_table_grants/);
  has(executableSql, /role_routine_grants/);
  has(executableSql, /has_schema_privilege/);
  assert.doesNotMatch(executableSql, /select\s+decrypted_secret\s+from/i);
  assert.doesNotMatch(executableSql, /vault\.create_secret\s*\(/i);
});

test("read-only Vault audit reports legacy user_brokers credential metadata without reading rows", () => {
  has(executableSql, /role_column_grants/);
  has(executableSql, /pg_policies/);
  has(executableSql, /legacy_user_brokers_credential_surface/);
  for (const column of ["api_key", "api_secret_encrypted", "passphrase_encrypted"]) {
    has(executableSql, new RegExp(column));
  }
  assert.doesNotMatch(executableSql, /select\s+.+\s+from\s+public\.user_brokers/i);
});

test("local frontend Compose does not receive provider or Bridge credentials", () => {
  assert.doesNotMatch(compose, /BINANCE_API_(KEY|SECRET)/i);
  assert.doesNotMatch(compose, /BYBIT_API_(KEY|SECRET)/i);
  assert.doesNotMatch(compose, /MT5_BRIDGE_(TOKEN|HEALTH_URL)/i);
  has(compose, /frontend:/);
  has(compose, /NODE_ENV: development/);
});

test("readiness gate keeps customer credential reads and writes blocked", () => {
  has(readinessDoc, /BLOCK credential writes and reads/i);
  has(readinessDoc, /credential_vault_unavailable/);
  has(readinessDoc, /dedicated server-side role\/path/i);
  has(readinessDoc, /two staging users/i);
  has(readinessDoc, /Live Trading/i);
  has(readinessDoc, /Do not read credential rows/i);
});

test("rotation policy defines before-next-distinct-use version semantics", () => {
  has(rotationPolicy, /ROTATE_ON_NEXT_USE/);
  has(rotationPolicy, /After that provider operation succeeds, persist .*ROTATION_REQUIRED/i);
  has(rotationPolicy, /Before the next distinct use, rotate\/refresh the credential/i);
  has(rotationPolicy, /V1 for use 1, V2 for use 2, V3 for use 3/);
});

test("only a confirmed successful authorized logical provider operation counts as a use", () => {
  has(rotationPolicy, /completes successfully with a confirmed success response/);
  has(rotationPolicy, /do not count as successful uses/i);
  has(rotationPolicy, /USE_OUTCOME_UNKNOWN/);
  has(rotationPolicy, /same idempotency key is the same logical operation/i);
});

test("next use requires lease, successor, validation, switch, retirement, then execution", () => {
  const steps = [
    "Acquire a per-connection rotation lock/lease",
    "create a successor credential",
    "Validate the successor",
    "Atomically compare-and-set the active version",
    "Revoke the previous credential version",
    "Execute the requested operation with the new active version",
  ];
  const sequenceStart = rotationPolicy.indexOf("When the state is `ROTATION_REQUIRED`, the Hub must:");
  assert.ok(sequenceStart >= 0, "Rotation state-machine section must exist");
  const positions = steps.map((step) => rotationPolicy.toLowerCase().indexOf(step.toLowerCase(), sequenceStart));
  assert.ok(positions.every((position) => position >= 0), "All rotation state-machine steps must exist");
  for (let index = 1; index < positions.length; index += 1) {
    assert.ok(positions[index] > positions[index - 1], "Rotation step out of order: " + steps[index]);
  }
});

test("rotation failures fail closed and do not fall back to indefinite stale-secret reuse", () => {
  has(rotationPolicy, /ROTATION_UNSUPPORTED/);
  has(rotationPolicy, /do not silently fall back to indefinite reuse/i);
  has(rotationPolicy, /do not execute the requested customer operation using the stale version/i);
  has(rotationPolicy, /REAUTH_REQUIRED/);
});

test("rotation policy preserves tenant isolation, secret redaction and read-only capabilities", () => {
  has(rotationPolicy, /Customer A cannot read, rotate, use, or revoke Customer B/);
  has(rotationPolicy, /must never reach browser code, generated UI, the AI model, MCP payloads/i);
  has(rotationPolicy, /Keep provider capabilities read-only/i);
  has(rotationPolicy, /does \*\*not\*\* enable the Vault, create customer credentials, grant database privileges/i);
});

test("dedicated Vault design extends the existing Hub and uses least-privilege roles", () => {
  has(accessDesign, /existing Cloudflare Worker/i);
  has(accessDesign, /nova_vault_api/);
  has(accessDesign, /nova_vault_fn_owner/);
  has(accessDesign, /must not be a member of .{0,3}service_role/i);
  has(accessDesign, /no direct table\/view access/i);
  has(accessDesign, /does not independently verify the Supabase JWT/i);
});

test("Vault access design requires cache-disabled Hyperdrive and no secret leakage", () => {
  has(accessDesign, /--caching-disabled/);
  has(accessDesign, /all Vault\/auth\/permission\/rotation calls/i);
  has(accessDesign, /Cache-Control: no-store/i);
  has(accessDesign, /query caching/i);
  has(accessDesign, /must never return secret material to the client or AI\/MCP/i);
});

test("Hyperdrive network, pooling and activation gates are explicitly documented", () => {
  has(accessDesign, /Free plan is IPv6-only/i);
  has(accessDesign, /minimum origin connection pool of five connections/i);
  has(accessDesign, /transaction pooling/i);
  has(accessDesign, /session-level state is reset when a connection returns to the pool/i);
  has(accessDesign, /Do not upgrade Supabase/i);
  has(accessDesign, /candidate, not a green light/i);
  has(accessDesign, /Do not create Hyperdrive resources/i);
  has(accessDesign, /Staging remains blocked/i);
});
