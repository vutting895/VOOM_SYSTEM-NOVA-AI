import test from "node:test";
import assert from "node:assert/strict";
import {
  getNovaCodeAgents,
  getNovaCodeSkillRegistry,
} from "../frontend/lib/nova-code-ai-registry.js";

test("NOVA CODE AI exposes six named agents with execution disabled", () => {
  const registry = getNovaCodeAgents();
  assert.equal(registry.agentCount, 6);
  assert.deepEqual(registry.agents.map((agent) => agent.id), [
    "code_generator",
    "code_reviewer",
    "debugging_agent",
    "testing_agent",
    "security_agent",
    "devops_agent",
  ]);
  assert.ok(registry.agents.every((agent) => agent.executionEnabled === false && agent.estimatedCost === 0));
  assert.equal(registry.policy.paidApiAllowed, false);
  assert.equal(registry.policy.arbitraryShellExecution, false);
});

test("skill registry contains video, affiliate, API and social media skills", () => {
  const registry = getNovaCodeSkillRegistry();
  assert.deepEqual(registry.groups.map((group) => group.id), ["video", "affiliate", "api", "social_media"]);
  assert.equal(registry.skillCount, 46);
  assert.ok(registry.groups.every((group) => group.skills.length > 0));
  assert.ok(registry.groups.flatMap((group) => group.skills)
    .every((skill) => skill.executionEnabled === false && skill.estimatedCost === 0));
  assert.equal(registry.policy.costMode, "free_only");
});

test("registry responses are fresh objects and cannot mutate the source catalog", () => {
  const first = getNovaCodeSkillRegistry();
  first.groups[0].skills[0].name = "mutated";
  const second = getNovaCodeSkillRegistry();
  assert.equal(second.groups[0].skills[0].name, "Text-to-Video");
});
