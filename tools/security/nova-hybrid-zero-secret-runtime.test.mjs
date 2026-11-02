import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const runtimeDoc = read("../../docs/architecture/NOVA-HYBRID-ZERO-SECRET-RUNTIME.md");
const proxy = read("../../integrations/mt5-readonly-proxy/worker.js");
const relay = read("../../integrations/mt5-bridge-relay/worker.js");
const proxyConfig = read("../../integrations/mt5-readonly-proxy/wrangler.jsonc");
const relayConfig = read("../../integrations/mt5-bridge-relay/wrangler.jsonc");
const hubConfig = read("../../integrations/system-hub/wrangler.jsonc");
const deployWorkflow = read("../../.github/workflows/cloudflare-deploy.yml");
const frontendWorkflow = read("../../.github/workflows/frontend-ci.yml");
const gitignore = read("../../.gitignore");

test("hybrid-zero policy explicitly blocks customer credential custody and paid infrastructure", () => {
  assert.match(runtimeDoc, /hybrid-zero/);
  assert.match(runtimeDoc, /No Fly\.io machines/);
  assert.match(runtimeDoc, /Customer provider credentials[\s\S]*?BLOCKED/);
  assert.match(runtimeDoc, /Cloudflare Worker Secrets are deployment\/environment-level bindings, not a multi-tenant customer credential vault/);
  assert.match(runtimeDoc, /ordersEnabled=false/);
  assert.match(runtimeDoc, /liveTradingEnabled=false/);
});

test("MT5 route map is consumed only by the server-side Proxy and Relay runtime", () => {
  assert.match(proxy, /env\.MT5_TENANT_ROUTES/);
  assert.match(relay, /env\.MT5_TENANT_ROUTES/);
  assert.doesNotMatch(proxyConfig, /MT5_TENANT_ROUTES/);
  assert.doesNotMatch(relayConfig, /MT5_TENANT_ROUTES/);
  assert.doesNotMatch(hubConfig, /MT5_TENANT_ROUTES/);
});

test("Worker config files do not declare sensitive values in vars", () => {
  for (const config of [proxyConfig, relayConfig, hubConfig]) {
    assert.doesNotMatch(config, /(?:API_SECRET|PRIVATE_KEY|ACCESS_TOKEN|REFRESH_TOKEN|MT5_TENANT_ROUTES|CLOUDFLARE_API_TOKEN)/i);
  }
});

test("deployment workflow does not inject tenant route maps or customer credentials", () => {
  assert.match(deployWorkflow, /github\.event\.workflow_run\.head_branch == 'main'/);
  assert.match(deployWorkflow, /CLOUDFLARE_API_TOKEN:\s*\$\{\{\s*secrets\.CLOUDFLARE_API_TOKEN\s*\}\}/);
  assert.doesNotMatch(deployWorkflow, /MT5_TENANT_ROUTES|BINANCE_API_SECRET|BYBIT_API_SECRET|CUSTOMER_API_KEY|PRIVATE_KEY/i);
  assert.match(frontendWorkflow, /PR-controlled code must never receive Cloudflare deployment or Supabase service-role secrets/);
});

test("local environment files remain ignored and no secret values are added by this contract", () => {
  assert.match(gitignore, /^\.env$/m);
  assert.match(gitignore, /^\.env\.\*$/m);
  assert.match(gitignore, /^!\.env\.example$/m);
  assert.match(runtimeDoc, /No secret listing or value retrieval was performed/);
  assert.match(runtimeDoc, /does not run wrangler secret put/);
});
