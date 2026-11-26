import test from "node:test";
import assert from "node:assert/strict";
import { DATA_SOURCE_CATALOG_VERSION, getDataSourceCatalog } from "../data-source-catalog.js";

test("catalog has a stable version and unique source identifiers", () => {
  assert.equal(DATA_SOURCE_CATALOG_VERSION, "1.0.0");
  const sources = getDataSourceCatalog();
  assert.ok(sources.length >= 3);
  assert.equal(new Set(sources.map((source) => source.id)).size, sources.length);
});

test("catalog only describes read-only sources and owner-scoped access", () => {
  for (const source of getDataSourceCatalog()) {
    assert.equal(source.mode, "read-only");
    assert.ok(source.tenantBoundary);
    assert.ok(source.verification);
  }
  const mt5 = getDataSourceCatalog().find((source) => source.id === "exness-mt5-demo");
  assert.deepEqual(mt5.capabilities, ["mt5.account.read", "mt5.quotes.read"]);
  assert.ok(mt5.prohibitedCapabilities.includes("order.submit"));
});

test("catalog results cannot mutate the canonical registry", () => {
  const first = getDataSourceCatalog();
  first[0].resources.push("injected_resource");
  const second = getDataSourceCatalog();
  assert.ok(!second[0].resources.includes("injected_resource"));
});
