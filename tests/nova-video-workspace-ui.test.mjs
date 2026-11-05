import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDirectorPlan } from "../integrations/nova-video-engine/director-intelligence.mjs";
import { createVideoProductionPlan } from "../integrations/nova-video-api/video-production-planner.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("NOVA Video Studio is reachable from the application route and primary navigation", () => {
  const app = read("../src/App.tsx");
  const nav = read("../src/components/QuickitMarketFleetView.tsx");
  assert.match(app, /import NovaVideoWorkspaceView from ['"]\.\/components\/NovaVideoWorkspaceView['"]/);
  assert.match(app, /path=["']\/video["'] element={<NovaVideoWorkspaceView \/>}/);
  assert.match(nav, /to=["']\/video["']/);
  assert.match(nav, /Video Studio/);
});

test("NOVA Video Studio uses the canonical Director and Production Planner modules", () => {
  const view = read("../src/components/NovaVideoWorkspaceView.tsx");
  assert.match(view, /createDirectorPlan\(payload\)/);
  assert.match(view, /createVideoProductionPlan\(directorPlan\)/);
  assert.match(view, /LOCAL DRAFT ONLY/);
  assert.match(view, /Export JSON/);
  assert.match(view, /Save to API · Not connected/);
  assert.match(view, /Generate Video · Locked/);
  assert.match(view, /generationStatus: 'blocked_no_free_gpu'/);
  assert.doesNotMatch(view, /\bfetch\s*\(/, "the draft workspace must not bypass Auth or call a deployed API");
  assert.doesNotMatch(view, /service[_-]?role|SUPABASE_SERVICE_ROLE_KEY|GEMINI_API_KEY/i);
});

test("NOVA Video Studio creates a frame-accurate plan and blocked Engine task contracts", () => {
  const brief = {
    title: "NOVA UI Acceptance",
    concept: "A handcrafted ceramic cup on a warm morning table",
    audience: "Coffee lovers",
    platform: "Short-form video",
    language: "th",
    style: "Cinematic, minimal and warm",
    callToAction: "Discover the collection",
    durationSeconds: 15,
    aspectRatio: "9:16",
    goal: "product_ad",
    verifiedFacts: ["Handcrafted ceramic cup"],
    mustAvoid: ["Unverified claims"],
  };
  const director = createDirectorPlan(brief);
  const production = createVideoProductionPlan(director);
  assert.equal(director.frameRate, 24);
  assert.equal(director.totalFrames, 360);
  assert.equal(director.scenes.length, 3);
  assert.equal(director.scenes.at(-1).visualPrompt.includes("Discover the collection"), true);
  assert.equal(production.generationTasks.length, director.scenes.length);
  assert.ok(production.generationTasks.every((task) => task.state === "blocked_no_free_gpu"));
  assert.ok(production.generationTasks.every((task) => task.task.executionEnabled === false));
  assert.equal(production.executionEnabled, false);
  assert.equal(production.estimatedCost, 0);
  assert.equal(production.requiresHumanApproval, true);
  assert.equal(production.status, "blocked_no_free_gpu");
});
