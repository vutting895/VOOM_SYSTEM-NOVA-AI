import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflow = await readFile(new URL("../.github/workflows/nova-staging-trusted-acceptance.yml", import.meta.url), "utf8");
const harness = await readFile(new URL("../scripts/staging/nova-pr-customer-isolation-acceptance.mjs", import.meta.url), "utf8");
const operations = await readFile(new URL("../docs/operations/NOVA-TRUSTED-STAGING-ACCEPTANCE.md", import.meta.url), "utf8");

test("trusted staging workflow is manual-only and main-ref only", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s*pull_request:/m);
  assert.match(workflow, /if: \$\{\{ github\.ref == 'refs\/heads\/main' \}\}/);
  assert.match(workflow, /ref: main/);
  assert.match(workflow, /persist-credentials: false/);
});

test("staging secrets are available only inside the protected environment job", () => {
  assert.match(workflow, /environment:\s*\n\s+name: nova-staging-acceptance/);
  assert.match(workflow, /vars\.NOVA_STAGING_ENVIRONMENT_PROTECTED/);
  assert.match(workflow, /secrets\.NOVA_STAGING_SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(workflow, /CLOUDFLARE_API_TOKEN/);
  assert.doesNotMatch(workflow, /pull_request_target/);
});

test("candidate preview is validated against an exact open same-repo PR head and successful Netlify status", () => {
  assert.match(workflow, /pr\.head\?\.sha !== HEAD_SHA/);
  assert.match(workflow, /pr\.base\?\.ref !== "main"/);
  assert.match(workflow, /pr\.head\?\.repo\?\.full_name !== REPOSITORY/);
  assert.match(workflow, /netlify\/voomsystem\/deploy-preview/);
  assert.match(workflow, /deploy-preview-\$\{PR_NUMBER\}--voomsystem\.netlify\.app/);
});

test("trusted harness never accepts a production Supabase project and uses system_test_only accounts", () => {
  assert.match(harness, /rovhmjeowracayicbqij/);
  assert.match(harness, /system_test_only/);
  assert.match(harness, /ordersEnabled/);
  assert.match(harness, /liveTradingEnabled/);
  assert.match(harness, /cleanup_verified/);
  assert.match(harness, /adminHeaders\(/);
});

test("modern Supabase secret keys are never sent as Bearer JWTs", () => {
  assert.match(harness, /serviceRoleKey\.startsWith\("sb_secret_"\)/);
  assert.match(harness, /apikey: serviceRoleKey/);
  assert.match(harness, /Authorization: "Bearer " \+ serviceRoleKey/);
  assert.match(harness, /!serviceRoleKey\.startsWith\("sb_secret_"\)/);
});

test("documentation makes required environment protection a precondition", () => {
  assert.match(operations, /required reviewers/i);
  assert.match(operations, /NOVA_STAGING_ENVIRONMENT_PROTECTED=true/);
  assert.ok(operations.includes("not active until this PR is reviewed and merged to"));
});
