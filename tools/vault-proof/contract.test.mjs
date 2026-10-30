import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const config = readFileSync(new URL("./supabase/config.toml", import.meta.url), "utf8");
const migration = readFileSync(new URL("./supabase/migrations/20261031000100_vault_access_proof.sql", import.meta.url), "utf8");
const signedMigration = readFileSync(new URL("./supabase/migrations/20261031000200_signed_identity_proof.sql", import.meta.url), "utf8");
const workflow = readFileSync(new URL("../../.github/workflows/vault-local-isolation-proof.yml", import.meta.url), "utf8");
const readme = readFileSync(new URL("./README.md", import.meta.url), "utf8");

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

test("only a signed, short-lived assertion can enter the local Vault accessor", () => {
  assert.match(signedMigration, /create extension if not exists pgcrypto with schema extensions/i);
  assert.match(signedMigration, /extensions\.hmac\(/i);
  assert.match(signedMigration, /NOVA-VAULT-ASSERTION-V1/);
  assert.match(signedMigration, /p_expires_at - p_issued_at > 60/);
  assert.match(signedMigration, /assertion_nonce_consumption/);
  assert.match(signedMigration, /constant_time_equal_32/);
  assert.match(signedMigration, /revoke all on function nova_vault_private\.get_secret_for_connection_use/i);
  assert.match(signedMigration, /grant execute on function nova_vault_private\.get_secret_for_signed_connection_use/i);
  assert.match(signedMigration, /SYNTHETIC|LOCAL-ONLY-HMAC/);
  assert.doesNotMatch(signedMigration, /ALTER ROLE/i);
});

test("runtime role cannot directly read assertion key or nonce metadata", () => {
  assert.match(signedMigration, /revoke all on table nova_vault_private\.assertion_verifier_keys/i);
  assert.match(signedMigration, /revoke all on table nova_vault_private\.assertion_nonce_consumption/i);
  assert.match(signedMigration, /revoke all on function nova_vault_private\.constant_time_equal_32/i);
});
