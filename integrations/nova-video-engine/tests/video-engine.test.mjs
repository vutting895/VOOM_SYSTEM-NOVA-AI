import test from "node:test";
import assert from "node:assert/strict";
import {
  createVideoDirection,
  planVideoWorkflow,
  buildFfmpegTrimArgs,
  buildFfmpegConcatArgs,
  buildFfprobeArgs,
} from "../src/index.mjs";

test("Video Director creates deterministic scenes whose durations sum exactly", () => {
  const input = {
    brief: "A short introduction to a reusable stainless steel water bottle",
    durationSeconds: 31,
    sceneCount: 4,
    aspectRatio: "9:16",
    style: "product",
  };
  const first = createVideoDirection(input);
  const second = createVideoDirection(input);

  assert.deepEqual(first, second);
  assert.equal(first.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0), 31);
  assert.equal(first.scenes[0].startSeconds, 0);
  assert.equal(first.scenes.at(-1).shots.at(-1).startSeconds + first.scenes.at(-1).shots.at(-1).durationSeconds, 31);
  assert.equal(first.executionEnabled, false);
  assert.equal(first.estimatedCost, 0);
});

test("Video Director rejects invalid briefs and unapproved presets", () => {
  assert.throws(() => createVideoDirection({ brief: "too short" }), /brief must contain/);
  assert.throws(() => createVideoDirection({ brief: "A sufficiently detailed brief", durationSeconds: 181 }), /durationSeconds/);
  assert.throws(() => createVideoDirection({ brief: "A sufficiently detailed brief", style: "arbitrary-model" }), /approved NOVA preset/);
  assert.throws(() => createVideoDirection({ brief: "A sufficiently detailed brief", aspectRatio: "4:3" }), /aspectRatio/);
});

test("workflow planner returns a DAG and keeps real execution blocked", () => {
  const direction = createVideoDirection({ brief: "A clear educational explainer about solar energy" });
  const plan = planVideoWorkflow(direction);
  const nodeIds = new Set(plan.nodes.map((node) => node.id));

  assert.equal(plan.state, "blocked");
  assert.equal(plan.executionEnabled, false);
  assert.equal(plan.estimatedCost, 0);
  assert.ok(plan.blockedReasons.includes("blocked_no_free_gpu"));
  for (const edge of plan.edges) {
    assert.ok(nodeIds.has(edge.from));
    assert.ok(nodeIds.has(edge.to));
  }
  assert.equal(plan.nodes.find((node) => node.id === "generation").status, "blocked_no_free_gpu");
  assert.equal(plan.nodes.find((node) => node.id === "assembly").status, "blocked_worker_unavailable");
});

test("FFmpeg plans are argument arrays and preserve paths with spaces", () => {
  const trim = buildFfmpegTrimArgs({
    inputPath: "assets/source clip.mp4",
    outputPath: "work/trimmed clip.mp4",
    startSeconds: 1.25,
    durationSeconds: 8,
  });
  assert.ok(trim.includes("assets/source clip.mp4"));
  assert.ok(trim.includes("work/trimmed clip.mp4"));
  assert.ok(!trim.some((arg) => arg.includes("&&") || arg.includes(";")));

  const concat = buildFfmpegConcatArgs({ manifestPath: "work/concat.txt", outputPath: "exports/final.mp4" });
  assert.ok(concat.includes("-safe"));
  assert.ok(concat.includes("1"));
  assert.deepEqual(buildFfprobeArgs({ inputPath: "assets/source.mp4" }).slice(-1), ["assets/source.mp4"]);
});

test("FFmpeg plans reject traversal, absolute paths, and invalid time ranges", () => {
  assert.throws(() => buildFfprobeArgs({ inputPath: "../secret.mp4" }), /unsafe workspace/);
  assert.throws(() => buildFfprobeArgs({ inputPath: "/etc/passwd" }), /unsafe path/);
  assert.throws(() => buildFfmpegTrimArgs({
    inputPath: "assets/in.mp4", outputPath: "assets/out.mp4", startSeconds: 0, durationSeconds: 0,
  }), /durationSeconds/);
});
