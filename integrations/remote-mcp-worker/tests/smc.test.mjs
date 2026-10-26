import test from "node:test";
import assert from "node:assert/strict";
import { classifyStructureEvent } from "../src/index.js";

test("first structure break is BOS", () => {
  assert.equal(classifyStructureEvent(null, "bullish"), "BOS");
  assert.equal(classifyStructureEvent(null, "bearish"), "BOS");
});

test("break in the same direction remains BOS", () => {
  assert.equal(classifyStructureEvent("bullish", "bullish"), "BOS");
  assert.equal(classifyStructureEvent("bearish", "bearish"), "BOS");
});

test("break against the current structure bias is CHoCH", () => {
  assert.equal(classifyStructureEvent("bullish", "bearish"), "CHoCH");
  assert.equal(classifyStructureEvent("bearish", "bullish"), "CHoCH");
});

test("invalid structure direction is rejected", () => {
  assert.throws(() => classifyStructureEvent(null, "sideways"), /direction must be bullish or bearish/);
});
