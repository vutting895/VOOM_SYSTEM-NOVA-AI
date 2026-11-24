import test from "node:test";
import assert from "node:assert/strict";
import { getDatasetRecord, listDatasetRegistry, listLearningRuns, listModelRegistry } from "../src/learning-registry.js";

const originalFetch = globalThis.fetch;
const token = "Bearer signed-user-session";

test.afterEach(() => { globalThis.fetch = originalFetch; });

test("dataset registry reader forwards the user's session and bounded filters", async () => {
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url: new URL(url), init };
    return new Response(JSON.stringify([{ id: "dataset-1", validation_status: "passed" }]), { status: 200 });
  };
  const result = await listDatasetRegistry({ limit: 10, symbol: "xauusdm", timeframe: "h1" }, {
    headers: new Headers({ Authorization: token })
  }, { SUPABASE_URL: "https://example.supabase.co", SUPABASE_PUBLISHABLE_KEY: "public-key" });
  assert.equal(result.count, 1);
  assert.equal(captured.url.pathname, "/rest/v1/nova_dataset_registry");
  assert.equal(captured.url.searchParams.get("symbol"), "eq.XAUUSDM");
  assert.equal(captured.url.searchParams.get("timeframe"), "eq.H1");
  assert.equal(captured.init.headers.Authorization, token);
  assert.equal(captured.init.method, "GET");
});

test("registry list readers reject unbounded limits and invalid record identifiers", async () => {
  const request = { headers: new Headers({ Authorization: token }) };
  const env = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_PUBLISHABLE_KEY: "public-key" };
  await assert.rejects(() => listModelRegistry({ limit: 101 }, request, env), /limit must be/);
  await assert.rejects(() => getDatasetRecord({ dataset_id: "../other-tenant" }, request, env), /must be a UUID/);
  await assert.rejects(() => listLearningRuns({ limit: 0 }, request, env), /limit must be/);
});

test("model and learning registry reads are read-only and never send mutation methods", async () => {
  const methods = [];
  globalThis.fetch = async (_url, init) => {
    methods.push(init.method);
    return new Response("[]", { status: 200 });
  };
  const request = { headers: new Headers({ Authorization: token }) };
  const env = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_PUBLISHABLE_KEY: "public-key" };
  await listModelRegistry({ limit: 5 }, request, env);
  await listLearningRuns({ limit: 5 }, request, env);
  assert.deepEqual(methods, ["GET", "GET"]);
});
