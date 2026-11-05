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

const sampleBars = () => {
  const closes=[10,9,8,9,11,10,9,12,13,11,10,14,15,13,12,16,17,15,14,18];
  return Array.from({length:5},()=>closes).flat().map((close,i)=>{
    const open=i%2?close-0.4:close+0.4;
    return {open,high:Math.max(open,close)+0.5,low:Math.min(open,close)-0.5,close};
  });
};

test("SMC backtest is research-only, cost-aware, and uses full history", async () => {
  const { runSmcBacktest } = await import("../src/index.js");
  const result=runSmcBacktest(sampleBars());
  assert.equal(result.strategy,"SMC_structure_break_baseline");
  assert.equal(result.mode,"research_backtest_only");
  assert.equal(result.bars_analyzed,100);
  assert.equal(result.orders_submitted,false);
  assert.equal(result.live_trading_enabled,false);
  assert.equal(result.cost_assumptions.fee_rate_per_side,0.001);
  assert.ok(Array.isArray(result.trades));
  for (const trade of result.trades) {
    assert.ok(trade.stop_swing_index < trade.signal_index);
    assert.equal(trade.entry_index,trade.signal_index+1);
  }
});

test("SMC backtest rejects invalid reward/risk", async () => {
  const { runSmcBacktest } = await import("../src/index.js");
  assert.throws(() => runSmcBacktest(sampleBars(),{rewardRisk:0}), /reward_risk must be between/);
});
