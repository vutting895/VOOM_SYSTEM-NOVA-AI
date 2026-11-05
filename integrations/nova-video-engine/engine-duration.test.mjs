import test from "node:test";
import assert from "node:assert/strict";
import { createStoryboard } from "./engine.mjs";

test("allocates remaining duration to partially timed scenes and covers the full brief", () => {
  const storyboard = createStoryboard({
    title: "Partial scene timings",
    durationSeconds: 10,
    scenes: [
      { description: "Opening", durationSeconds: 2 },
      { description: "Middle" },
      { description: "Closing", durationSeconds: 4 },
    ],
  });
  assert.deepEqual(storyboard.scenes.map((scene) => scene.durationSeconds), [2, 4, 4]);
  assert.equal(storyboard.scenes[0].startSeconds, 0);
  assert.equal(storyboard.scenes[1].startSeconds, 2);
  assert.equal(storyboard.scenes[2].startSeconds, 6);
  assert.equal(storyboard.scenes[2].endSeconds, 10);
  assert.equal(storyboard.durationSeconds, 10);
});

test("distributes odd millisecond remainders without losing timeline duration", () => {
  const storyboard = createStoryboard({
    title: "Millisecond allocation",
    durationSeconds: 10.007,
    scenes: [
      { description: "Fixed", durationSeconds: 2.002 },
      { description: "Auto one" },
      { description: "Auto two" },
    ],
  });
  assert.deepEqual(storyboard.scenes.map((scene) => scene.durationSeconds), [2.002, 4.003, 4.002]);
  assert.equal(storyboard.scenes[2].endSeconds, 10.007);
});

test("rejects partial scene timings that already exceed the requested video duration", () => {
  assert.throws(() => createStoryboard({
    title: "Over-allocated scenes",
    durationSeconds: 10,
    scenes: [
      { description: "First", durationSeconds: 6 },
      { description: "Second", durationSeconds: 5 },
      { description: "Third" },
    ],
  }), /scene_durations_exceed_video_duration/);
});

test("rejects a remainder too small to give every unspecified scene positive duration", () => {
  assert.throws(() => createStoryboard({
    title: "Insufficient remainder",
    durationSeconds: 3,
    scenes: [
      { description: "Fixed", durationSeconds: 2.999 },
      { description: "Automatic one" },
      { description: "Automatic two" },
    ],
  }), /scene_duration_remainder_too_small/);
});
