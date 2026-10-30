import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const config = readFileSync(new URL("./supabase/config.toml", import.meta.url), "utf8");
const migration = readFileSync(new URL("./supabase/migrations/20261031000100_vault_access_proof.sql", import.meta.url), "utf8");
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
