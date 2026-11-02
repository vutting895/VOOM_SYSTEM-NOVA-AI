import test from "node:test";
import assert from "node:assert/strict";
import { getNovaSkill, listNovaSkills } from "../src/skill-registry.js";
import { tools } from "../src/index.js";

test("skill catalog is non-empty, grouped and fail-closed", () => {
  const result = listNovaSkills();
  assert.equal(result.count, 11);
  assert.equal(result.policy.executionEnabled, false);
  assert.equal(result.policy.mode, "catalog-only");
  assert.ok(result.skills.some((skill) => skill.id === "neural_model_research"));
  assert.ok(result.skills.some((skill) => skill.id === "security_tenant_isolation"));
  assert.ok(result.skills.every((skill) => skill.executionEnabled === false));
  assert.ok(result.skills.every((skill) => skill.status === "catalog_only"));
});

test("skill catalog supports a validated domain filter", () => {
  const result = listNovaSkills("trading_research");
  assert.equal(result.count, 3);
  assert.ok(result.skills.every((skill) => skill.domain === "trading_research"));
  assert.throws(() => listNovaSkills("unknown"), /nova_skill_domain_invalid/);
});

test("skill lookup returns a safe metadata copy and rejects unknown IDs", () => {
  const skill = getNovaSkill("neural_model_research");
  assert.equal(skill.executionEnabled, false);
  skill.capabilities.push("tampered");
  assert.equal(getNovaSkill("neural_model_research").capabilities.includes("tampered"), false);
  assert.throws(() => getNovaSkill("unknown_skill"), /nova_skill_not_found/);
  assert.throws(() => getNovaSkill("../secret"), /nova_skill_id_invalid/);
});

test("MCP exposes only metadata discovery tools for skills", () => {
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  assert.ok(byName.has("list_nova_skills"));
  assert.ok(byName.has("get_nova_skill"));
  assert.match(byName.get("list_nova_skills").description, /Metadata only/);
  assert.match(byName.get("get_nova_skill").description, /no skill execution/i);
});
