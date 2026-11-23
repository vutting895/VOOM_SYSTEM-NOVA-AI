import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const catalog = JSON.parse(await readFile(new URL("../shared/integration-provider-catalog.json", import.meta.url), "utf8"));
const schema = JSON.parse(await readFile(new URL("../shared/schemas/integration-provider.schema.json", import.meta.url), "utf8"));

function validate(value, rule, path = "$") {
  const errors = [];
  if (rule.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [`${path} must be an object`];
    for (const key of rule.required ?? []) if (!(key in value)) errors.push(`${path}.${key} is required`);
    if (rule.additionalProperties === false) {
      for (const key of Object.keys(value)) if (!(key in (rule.properties ?? {}))) errors.push(`${path}.${key} is not allowed`);
    }
    for (const [key, child] of Object.entries(rule.properties ?? {})) {
      if (key in value) errors.push(...validate(value[key], child, `${path}.${key}`));
    }
  }
  if (rule.type === "array") {
    if (!Array.isArray(value)) return [`${path} must be an array`];
    if (rule.uniqueItems && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) errors.push(`${path} must contain unique items`);
    if (rule.items) value.forEach((item, index) => errors.push(...validate(item, rule.items, `${path}[${index}]`)));
  }
  if (rule.type === "string") {
    if (typeof value !== "string") return [`${path} must be a string`];
    if (rule.minLength !== undefined && value.length < rule.minLength) errors.push(`${path} is too short`);
    if (rule.maxLength !== undefined && value.length > rule.maxLength) errors.push(`${path} is too long`);
    if (rule.pattern && !(new RegExp(rule.pattern).test(value))) errors.push(`${path} has an invalid format`);
  }
  if (rule.type === "boolean" && typeof value !== "boolean") errors.push(`${path} must be a boolean`);
  if (rule.enum && !rule.enum.includes(value)) errors.push(`${path} has an unsupported value`);
  if ("const" in rule && value !== rule.const) errors.push(`${path} must equal ${rule.const}`);
  return errors;
}

test("provider catalog validates against the checked-in schema", () => {
  assert.equal(catalog.version, 1);
  assert.equal(catalog.status, "descriptive_catalog_not_runtime_proof");
  assert.ok(Array.isArray(catalog.providers) && catalog.providers.length > 0);
  const ids = catalog.providers.map((provider) => provider.id);
  assert.equal(new Set(ids).size, ids.length, "provider IDs must be unique");
  const errors = catalog.providers.flatMap((provider, index) => validate(provider, schema, `providers[${index}]`));
  assert.deepEqual(errors, []);
});

test("existing NOVA AI provider keeps the System Hub's canonical ID", () => {
  const ids = catalog.providers.map((provider) => provider.id);
  assert.ok(ids.includes("nova-ai"));
  assert.ok(!ids.includes("nova-ai-worker"));
});

test("planned providers cannot expose secrets to the browser or enable writes by default", () => {
  for (const provider of catalog.providers) {
    assert.equal(provider.security.leastPrivilege, true, provider.id);
    assert.equal(provider.security.userConsent, true, provider.id);
    assert.equal(provider.security.browserSecretAccess, false, provider.id);
    assert.equal(provider.security.readOnlyDefault, true, provider.id);
    if (provider.lifecycle === "planned") {
      assert.equal(provider.security.secretHandling, "approved_server_custody_required", provider.id);
      assert.equal(provider.verification, "not_checked", provider.id);
    }
  }
});

test("broker catalog remains Exness Demo read-only only", () => {
  const brokers = catalog.providers.filter((provider) => provider.category === "broker");
  assert.deepEqual(brokers.map((provider) => provider.id), ["exness-mt5-demo"]);
  assert.ok(!brokers[0].capabilities.some((capability) => /order|trade\.write|withdraw|transfer/i.test(capability)));
});
