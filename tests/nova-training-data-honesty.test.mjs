import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const server = readFileSync(new URL("server.ts", root), "utf8");
const learningView = readFileSync(new URL("src/components/learning/LearningUniverseView.tsx", root), "utf8");
const intelligenceView = readFileSync(new URL("src/components/intelligence/TradingIntelligenceView.tsx", root), "utf8");
const infrastructureView = readFileSync(new URL("src/components/infrastructure/TradingInfrastructureView.tsx", root), "utf8");
const chartView = readFileSync(new URL("src/components/dashboard/CandlestickChart.tsx", root), "utf8");

test("auto-training reports unavailable until a real training runner is connected", () => {
  assert.match(server, /mode: 'NOT_CONFIGURED'/);
  assert.match(server, /validationAccuracyPct: null/);
  assert.match(server, /samplesIngested: null/);
  assert.match(server, /training_pipeline_not_configured/);
  assert.doesNotMatch(server, /setInterval\(\(\) => \{\s*runBackendTrainingCycle/);
});

test("Learning Universe never publishes fabricated dataset or model metrics", () => {
  assert.match(server, /totalSamplesStored: 0/);
  assert.match(server, /dailyUpdateStatus: 'NOT_CONFIGURED'/);
  assert.match(server, /modelPerformanceByRegime: \[\]/);
  assert.match(server, /trainingHistory: \[\]/);
  assert.match(learningView, /No verified training runs are available/);
  assert.match(learningView, /No verified model evaluation metrics are available/);
  assert.match(learningView, /Training Not Configured/);
  assert.match(learningView, /NOT CONFIGURED/);
});

test("intelligence API does not claim unverified model performance", () => {
  assert.match(server, /status: 'NOT_CONFIGURED'/);
  assert.match(server, /models: \[\]/);
  assert.match(server, /ensembleConfidencePct: null/);
  assert.match(intelligenceView, /AI Models Not Configured/);
});

test("market overview and generated candles identify sample data as unverified", () => {
  assert.match(server, /dataMode: 'STATIC_SAMPLE_UNVERIFIED'/);
  assert.match(server, /Static sample - not connected to Exness MT5/);
  assert.doesNotMatch(server, /feedSource: 'Exness MT5 Demo Terminal'/);
  assert.match(server, /dataMode: 'SIMULATED_SAMPLE_UNVERIFIED'/);
  assert.match(chartView, /DATA SOURCE UNVERIFIED/);
  assert.match(chartView, /dataModeLabel.includes\("SAMPLE"\)/);
  assert.match(infrastructureView, /TARGET ONLY - NOT CONNECTED/);
  assert.match(infrastructureView, /Training Runner \(not configured\)/);
});


test("backtest output is labelled simulated sample data rather than verified Exness history", () => {
  const backtest = readFileSync(new URL("src/components/backtest/BacktestSimulatorView.tsx", root), "utf8");
  assert.match(backtest, /SIMULATED SAMPLE ONLY/);
  assert.match(backtest, /not a backtest on verified Exness history/);
  assert.doesNotMatch(backtest, /ข้อมูลจริงของ Exness Demo/);
});

test("MTRADERS performance UI shows catalogue metadata only without fabricated P/L or positions", () => {
  const strategy = readFileSync(new URL("src/components/strategy/StrategyPerformanceView.tsx", root), "utf8");
  assert.match(strategy, /STRATEGY CATALOGUE ONLY — NOT CONNECTED/);
  assert.match(strategy, /P\/L, win rate, profit factor, open positions/);
  assert.doesNotMatch(strategy, /TOTAL REALIZED P\/L|WFE Score 89\.2%|BUY XAUUSDm/);
});

test("Neural Studio exposes no fabricated inference metrics or active module telemetry", () => {
  const neural = readFileSync(new URL("src/components/strategy/NovaNeuralStudioView.tsx", root), "utf8");
  assert.match(neural, /LOCAL MOCK SIMULATION — BACKEND NOT CONFIGURED/);
  assert.match(neural, /No quantum backend, model inference runtime/);
  assert.match(neural, /NOT CONNECTED/);
  assert.doesNotMatch(neural, /Math\.random|READ-ONLY LIVE LAB|30 \/ 30 Active|Win:/);
});

test("MTRADERS EA defaults are disabled and match the configured NOVA risk policy", () => {
  const ea = readFileSync(new URL("integrations/mt5/MTRADERS_All_In_One_v1.01.mq5", root), "utf8");
  assert.match(ea, /InpTradeEnabled\s*=\s*false/);
  assert.match(ea, /InpRiskPercent\s*=\s*1\.0/);
  assert.match(ea, /InpMaxSingleRiskPct\s*=\s*1\.0/);
  assert.match(ea, /InpMaxOpenRiskPct\s*=\s*9\.0/);
  assert.match(ea, /InpDailyLossPct\s*=\s*10\.0/);
  assert.doesNotMatch(ea, /InpTradeEnabled\s*=\s*true|InpRiskPercent\s*=\s*5\.0|InpMaxOpenRiskPct\s*=\s*30\.0|InpDailyLossPct\s*=\s*35\.0/);
  assert.doesNotMatch(ea, /OrderSend|OrderSendAsync|trade\.Buy|trade\.Sell/);
});
