import test from "node:test";
import assert from "node:assert/strict";

import {
  LEARNING_TRACKS,
  READINESS,
  getReadinessCounts,
  getReadinessLabel,
} from "../frontend/lib/learning-universe/catalog.mjs";

test("catalog contains exactly 16 uniquely identified tracks in canonical order", () => {
  assert.equal(LEARNING_TRACKS.length, 16);
  assert.deepEqual(
    LEARNING_TRACKS.map((track) => track.number),
    Array.from({ length: 16 }, (_, index) => String(index + 1).padStart(2, "0")),
  );
  assert.equal(new Set(LEARNING_TRACKS.map((track) => track.id)).size, 16);
});

test("every track has a valid readiness state and non-empty product copy", () => {
  for (const track of LEARNING_TRACKS) {
    assert.ok(track.id);
    assert.ok(track.name);
    assert.ok(track.description);
    assert.ok(Object.hasOwn(READINESS, track.readiness));
    assert.ok(getReadinessLabel(track.readiness));
  }
});

test("prototype and partial statuses carry evidence and explicit limitation text", () => {
  for (const track of LEARNING_TRACKS.filter((item) => item.readiness !== "planned")) {
    assert.ok(track.evidencePath, `${track.id} needs a source evidence path`);
    assert.ok(track.evidenceSummary, `${track.id} needs an evidence summary`);
  }
  assert.match(
    LEARNING_TRACKS.find((item) => item.id === "auto-learning-loop").evidenceSummary,
    /no scheduler, persistence, trainer, or automatic promotion/i,
  );
});

test("readiness counts reconcile to all 16 tracks", () => {
  const counts = getReadinessCounts();
  assert.equal(counts.planned + counts.prototype + counts.partial, 16);
  assert.equal(counts.prototype, 3);
  assert.equal(counts.partial, 2);
  assert.equal(counts.planned, 11);
});
