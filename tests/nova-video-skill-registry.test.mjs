import test from "node:test";
import assert from "node:assert/strict";
import { getVideoSkillRegistry, VIDEO_SKILL_REGISTRY_VERSION } from "../frontend/lib/video-skill-registry.js";

test("NOVA Video skill registry is versioned and exposes all 20 skills", () => {
  const registry = getVideoSkillRegistry();
  assert.equal(VIDEO_SKILL_REGISTRY_VERSION, "1.0.0");
  assert.equal(registry.registryVersion, "1.0.0");
  assert.equal(registry.deliveryModel, "api_only");
  assert.equal(registry.skillCount, 20);
  assert.deepEqual(registry.skillGroups.map((group) => group.id), ["generation", "analysis", "editing", "production"]);
});

test("registry never advertises an executable or billable skill", () => {
  const registry = getVideoSkillRegistry();
  assert.equal(registry.policy.executionEnabled, false);
  assert.equal(registry.policy.paidApiAllowed, false);
  assert.equal(registry.policy.paidGpuAllowed, false);
  for (const group of registry.skillGroups) {
    for (const skill of group.skills) {
      assert.equal(skill.executionEnabled, false);
      assert.equal(skill.estimatedCost, 0);
      assert.notEqual(skill.status, "production_enabled");
    }
  }
});

test("registry returns isolated objects so callers cannot mutate shared state", () => {
  const first = getVideoSkillRegistry();
  first.skillGroups[0].skills[0].status = "production_enabled";
  const second = getVideoSkillRegistry();
  assert.equal(second.skillGroups[0].skills[0].status, "blocked_no_free_compute");
});
