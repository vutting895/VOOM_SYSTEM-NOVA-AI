import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";

const config = readFileSync(new URL("./supabase/config.toml", import.meta.url), "utf8");
const migration = readFileSync(new URL("./supabase/migrations/20261031000100_vault_access_proof.sql", import.meta.url), "utf8");
const signedMigration = readFileSync(new URL("./supabase/migrations/20261031000200_signed_identity_assertion_proof.sql", import.meta.url), "utf8");
const workflow = readFileSync(new URL("../../.github/workflows/vault-local-isolation-proof.yml", import.meta.url), "utf8");
const readme = readFileSync(new URL("./README.md", import.meta.url), "utf8");
const signedIdentityTests = readFileSync(new URL("./supabase/tests/signed_identity_assertion.test.sql", import.meta.url), "utf8");
const hmacKnownAnswerTest = readFileSync(new URL("./hmac-known-answer.test.mjs", import.meta.url), "utf8");

test("proof project is isolated from hosted Supabase projects", () => {
  assert.match(config, /project_id = "nova-vault-isolation-proof"/);
  assert.doesNotMatch(config, /^\[remotes\./m);
  assert.doesNotMatch(config, /env\(/i);
  assert.match(config, /major_version = 17/);
  assert.match(readme, /Do not run supabase link/);
});

test("API schema list excludes the Vault and private function schemas", () => {
  assert.match(config, /schemas = \["public", "storage", "graphql_public"\]/);
  const apiSchemas = config.match(/^\s*schemas\s*=\s*(.+)$/m)?.[1] ?? "";
  assert.doesNotMatch(apiSchemas, /vault|nova_vault_private/i);
});

test("migration grants runtime access to one private function, not Vault tables", () => {
  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path = ''/i);
  assert.match(migration, /grant execute on function nova_vault_private\.get_secret_for_connection_use/i);
  assert.match(migration, /grant select on table vault\.decrypted_secrets to nova_vault_fn_owner/i);
  assert.doesNotMatch(migration, /grant\s+(select|all).*vault\.(secrets|decrypted_secrets)\s+to\s+nova_vault_api/i);
  assert.doesNotMatch(migration, /grant\s+.*service_role/i);
  assert.match(migration, /grant nova_vault_fn_owner to current_user with set true/i);
  assert.doesNotMatch(migration, /alter role nova_vault_(fn_owner|api)/i);
  assert.match(migration, /grant execute on function %s to nova_vault_fn_owner/i);
  assert.match(migration, /_crypto_aead_det_decrypt/);
  assert.doesNotMatch(migration, /grant execute on all functions in schema vault to nova_vault_api/i);
  assert.equal((migration.match(/grant nova_vault_api to current_user with set true;/g) ?? []).length, 1);
});

test("fixture material is synthetic and the proof does not enable a Worker route", () => {
  assert.match(migration, /SYNTHETIC-LOCAL-ONLY-VAULT-PROOF-CUSTOMER-A/);
  assert.match(migration, /SYNTHETIC-LOCAL-ONLY-VAULT-PROOF-CUSTOMER-B/);
  assert.match(readme, /does not .*add a System Hub route/i);
});

test("CI runs only disposable local Supabase commands and injects no platform credentials", () => {
  assert.match(workflow, /supabase start/);
  assert.match(workflow, /supabase db reset --local --yes/);
  assert.match(workflow, /supabase test db --local/);
  assert.match(workflow, /supabase stop/);
  assert.doesNotMatch(workflow, /SUPABASE_ACCESS_TOKEN|SUPABASE_SERVICE_ROLE|CLOUDFLARE_API_TOKEN|DATABASE_URL|supabase link|db push --linked/i);
});


const assertionUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function canonicalVaultAssertion(claims) {
  assert.equal(claims.version, 1);
  assert.equal(claims.issuer, "voom-system-hub");
  assert.equal(claims.audience, "nova-vault-access");
  for (const field of ["ownerId", "tenantId", "connectionId", "operationId", "nonce"]) {
    assert.match(claims[field], assertionUuid, `invalid ${field}`);
  }
  assert.match(claims.keyId, /^[A-Za-z0-9_-]{1,64}$/);
  assert.match(claims.provider, /^[a-z0-9_-]{1,64}$/);
  assert.match(claims.environment, /^[a-z0-9_-]{1,32}$/);
  assert.equal(claims.capability, "secret.use.readonly");
  for (const field of ["generation", "issuedAt", "expiresAt"]) {
    assert.ok(Number.isSafeInteger(claims[field]), `invalid ${field}`);
  }
  assert.ok(claims.generation >= 1);
  return [
    "NOVA-VAULT-ASSERTION-V1",
    claims.issuer,
    claims.audience,
    claims.keyId,
    claims.ownerId.toLowerCase(),
    claims.tenantId.toLowerCase(),
    claims.connectionId.toLowerCase(),
    claims.provider,
    claims.environment,
    claims.capability,
    String(claims.generation),
    claims.operationId.toLowerCase(),
    claims.nonce.toLowerCase(),
    String(claims.issuedAt),
    String(claims.expiresAt)
  ].join("\n");
}

function validVaultAssertionWindow(issuedAt, expiresAt, now) {
  return Number.isSafeInteger(issuedAt)
    && Number.isSafeInteger(expiresAt)
    && Number.isSafeInteger(now)
    && issuedAt >= now - 60
    && issuedAt <= now + 5
    && expiresAt > now
    && expiresAt > issuedAt
    && expiresAt <= issuedAt + 60;
}

async function verifyVaultAssertion(key, claims, signature) {
  try {
    const message = new TextEncoder().encode(canonicalVaultAssertion(claims));
    return await webcrypto.subtle.verify("HMAC", key, signature, message);
  } catch {
    return false;
  }
}

test("signed-identity migration is local-only and removes runtime access to unsigned identity assertions", () => {
  assert.match(signedMigration, /LOCAL PROOF ONLY/i);
  assert.match(signedMigration, /create extension if not exists pgcrypto with schema extensions/i);
  assert.match(signedMigration, /get_secret_for_connection_use_signed/i);
  assert.match(signedMigration, /revoke all on function nova_vault_private\.get_secret_for_connection_use\([\s\S]*?from public, anon, authenticated, service_role, nova_vault_api/i);
  assert.match(signedMigration, /assertion_nonce_replay/);
  assert.match(signedMigration, /on conflict \(key_id, nonce\) do nothing/i);
  assert.doesNotMatch(signedMigration, /grant\s+.*service_role/i);
  assert.match(signedMigration, /MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=/);
});

test("Worker Web Crypto HMAC-SHA-256 matches RFC 4231 known-answer vector", async () => {
  const rawKey = new Uint8Array(20).fill(0x0b);
  const key = await webcrypto.subtle.importKey(
    "raw", rawKey, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]
  );
  const message = new TextEncoder().encode("Hi There");
  const signature = new Uint8Array(await webcrypto.subtle.sign("HMAC", key, message));
  assert.equal(signature.length, 32);
  assert.equal(
    Buffer.from(signature).toString("hex"),
    "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7"
  );
  assert.equal(await webcrypto.subtle.verify("HMAC", key, signature, message), true);
});

test("canonical HMAC assertion detects claim tampering across every bound claim", async () => {
  const keyBytes = new TextEncoder().encode("0123456789abcdef0123456789abcdef");
  const key = await webcrypto.subtle.importKey(
    "raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]
  );
  const original = {
    version: 1,
    issuer: "voom-system-hub",
    audience: "nova-vault-access",
    keyId: "proof-hmac-v1",
    ownerId: "00000000-0000-4000-8000-000000000001",
    tenantId: "00000000-0000-4000-8000-000000000011",
    connectionId: "00000000-0000-4000-8000-000000000101",
    provider: "proof_provider",
    environment: "demo",
    capability: "secret.use.readonly",
    generation: 1,
    operationId: "10000000-0000-4000-8000-000000000001",
    nonce: "20000000-0000-4000-8000-000000000001",
    issuedAt: 1793390000,
    expiresAt: 1793390060
  };
  const originalBytes = new TextEncoder().encode(canonicalVaultAssertion(original));
  const signature = await webcrypto.subtle.sign("HMAC", key, originalBytes);
  assert.equal(await verifyVaultAssertion(key, original, signature), true);

  const mutations = [
    ["version", c => { c.version = 2; }],
    ["issuer", c => { c.issuer = "untrusted"; }],
    ["audience", c => { c.audience = "wrong-audience"; }],
    ["keyId", c => { c.keyId = "other-key"; }],
    ["ownerId", c => { c.ownerId = "00000000-0000-4000-8000-000000000002"; }],
    ["tenantId", c => { c.tenantId = "00000000-0000-4000-8000-000000000012"; }],
    ["connectionId", c => { c.connectionId = "00000000-0000-4000-8000-000000000102"; }],
    ["provider", c => { c.provider = "other_provider"; }],
    ["environment", c => { c.environment = "production"; }],
    ["capability", c => { c.capability = "trade.submit"; }],
    ["generation", c => { c.generation = 2; }],
    ["operationId", c => { c.operationId = "10000000-0000-4000-8000-000000000002"; }],
    ["nonce", c => { c.nonce = "20000000-0000-4000-8000-000000000002"; }],
    ["issuedAt", c => { c.issuedAt += 1; }],
    ["expiresAt", c => { c.expiresAt -= 1; }]
  ];
  for (const [field, mutate] of mutations) {
    const changed = structuredClone(original);
    mutate(changed);
    assert.equal(await verifyVaultAssertion(key, changed, signature), false, `${field} tampering must fail`);
  }
});

test("signed assertion expiry and canonical field bounds fail closed", () => {
  const now = 1793390000;
  assert.equal(validVaultAssertionWindow(now, now + 60, now), true);
  assert.equal(validVaultAssertionWindow(now - 61, now - 1, now), false);
  assert.equal(validVaultAssertionWindow(now + 6, now + 60, now), false);
  assert.equal(validVaultAssertionWindow(now, now + 61, now), false);
  assert.equal(validVaultAssertionWindow(now, now, now), false);

  const valid = {
    version: 1, issuer: "voom-system-hub", audience: "nova-vault-access",
    keyId: "proof-hmac-v1",
    ownerId: "00000000-0000-4000-8000-000000000001",
    tenantId: "00000000-0000-4000-8000-000000000011",
    connectionId: "00000000-0000-4000-8000-000000000101",
    provider: "proof_provider", environment: "demo",
    capability: "secret.use.readonly", generation: 1,
    operationId: "10000000-0000-4000-8000-000000000001",
    nonce: "20000000-0000-4000-8000-000000000001",
    issuedAt: now, expiresAt: now + 60
  };
  assert.doesNotThrow(() => canonicalVaultAssertion(valid));
  assert.throws(() => canonicalVaultAssertion({ ...valid, keyId: "bad\\nkey" }));
  assert.throws(() => canonicalVaultAssertion({ ...valid, provider: "bad\\nprovider" }));
  assert.throws(() => canonicalVaultAssertion({ ...valid, capability: "trade.submit" }));
});

test("Worker Web Crypto and PostgreSQL pgcrypto match the canonical assertion HMAC vector", () => {
  assert.match(hmacKnownAnswerTest, /webcrypto\.subtle\.sign/);
  assert.match(hmacKnownAnswerTest, /ecfd257bb3dfff3d0fa34e8d1d01506b2e063a2dbeb4284c3737bb283602a001/);
  assert.match(signedIdentityTests, /PostgreSQL pgcrypto matches the Web Crypto canonical assertion known-answer vector/);
  assert.match(signedIdentityTests, /ecfd257bb3dfff3d0fa34e8d1d01506b2e063a2dbeb4284c3737bb283602a001/);
  assert.match(signedIdentityTests, /extensions\.plan\(25\)/);
});
