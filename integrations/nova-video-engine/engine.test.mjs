import test from "node:test";
import assert from "node:assert/strict";
import { createNovaVideoEngine, createStoryboard, ENGINE_STATES } from "./engine.mjs";
import { buildFfmpegArgs, resolveWithinRoot } from "./ffmpeg-renderer.mjs";

const brief = {
  title: "NOVA product story", aspectRatio: "9:16", durationSeconds: 10,
  scenes: [
    { description: "Opening product shot", imagePath: "assets/scene-1.png" },
    { description: "Close-up detail", imagePath: "assets/scene-2.jpg" },
  ],
};

test("creates a deterministic, duration-bounded storyboard", () => {
  const first = createStoryboard(brief);
  assert.deepEqual(first, createStoryboard(brief));
  assert.equal(first.scenes.length, 2);
  assert.equal(first.scenes[0].startSeconds, 0);
  assert.equal(first.scenes[1].endSeconds, 10);
  assert.equal(first.executionEnabled, false);
  assert.equal(first.estimatedCost, 0);
});

test("rejects malformed briefs and excessive scenes", () => {
  assert.throws(() => createStoryboard({ ...brief, durationSeconds: 0 }), /invalid_duration_seconds/);
  assert.throws(() => createStoryboard({ ...brief, scenes: [] }), /invalid_scene_count/);
  assert.throws(() => createStoryboard({ ...brief, scenes: Array(13).fill({ description: "x" }) }), /invalid_scene_count/);
});

test("keeps rendering blocked by default even when a renderer is supplied", async () => {
  let calls = 0;
  const engine = createNovaVideoEngine({ renderer: { render: async () => { calls += 1; } } });
  const result = await engine.render(brief);
  assert.equal(result.state, ENGINE_STATES.BLOCKED);
  assert.equal(result.reason, "execution_disabled");
  assert.equal(calls, 0);
});

test("does not pretend to render when no renderer is configured", async () => {
  const result = await createNovaVideoEngine({ executionEnabled: true }).render(brief);
  assert.equal(result.state, ENGINE_STATES.BLOCKED);
  assert.equal(result.reason, "renderer_unavailable");
});

test("rejects media path traversal and absolute paths", () => {
  assert.throws(() => resolveWithinRoot("/workspace", "../secret.png"), /media_path_outside_workspace/);
  assert.throws(() => resolveWithinRoot("/workspace", "/tmp/secret.png"), /relative_media_path_required/);
});

test("builds an FFmpeg command without shell interpolation", () => {
  const { args, outputPath } = buildFfmpegArgs(createStoryboard(brief), "/workspace");
  assert.equal(args.includes("-filter_complex"), true);
  assert.equal(args.includes("-an"), true);
  assert.equal(args.includes("/workspace/assets/scene-1.png"), true);
  assert.equal(outputPath, "/workspace/renders/video.mp4");
  assert.equal(args.some((arg) => arg.includes("&&") || arg.includes("; rm")), false);
});

test("requires each scene to have a supported still-image input", () => {
  const noImage = createStoryboard({ ...brief, scenes: [{ description: "No image supplied" }] });
  assert.throws(() => buildFfmpegArgs(noImage, "/workspace"), /scene_image_required_1/);
  assert.throws(() => buildFfmpegArgs({
    ...noImage, scenes: [{ ...noImage.scenes[0], imagePath: "assets/clip.mp4" }],
  }, "/workspace"), /unsupported_scene_image_type/);
});
