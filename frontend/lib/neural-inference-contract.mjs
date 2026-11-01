const SHA256 = /^[a-f0-9]{64}$/i;
const REGIMES = new Set(["bullish", "bearish", "sideways", "unknown"]);

function object(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finiteUnit(value) {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

/**
 * Validate an inference result against caller-owned market context.
 * This function does not load a model, generate a prediction or accept an order.
 */
export function validateNeuralInferenceResult(candidate, expected = {}) {
  if (!object(candidate)) throw new TypeError("inference result must be an object");
  if (candidate.schemaVersion !== "nova.neural-inference.v1") {
    throw new TypeError("unsupported neural inference schema version");
  }

  const model = candidate.model;
  const data = candidate.data;
  const evaluation = candidate.evaluation;
  const output = candidate.output;
  if (![model, data, evaluation, output].every(object)) {
    throw new TypeError("model, data, evaluation and output metadata are required");
  }

  if (model.status !== "validated" || !["pytorch", "torchscript"].includes(model.runtime)) {
    throw new Error("model runtime or lifecycle is not validated");
  }
  if (typeof model.id !== "string" || !model.id.trim() ||
      typeof model.version !== "string" || !model.version.trim() ||
      !SHA256.test(model.artifactSha256 || "")) {
    throw new TypeError("model id, version and artifact SHA-256 are required");
  }
  if (typeof data.symbol !== "string" || typeof data.timeframe !== "string" ||
      !SHA256.test(data.datasetSha256 || "") ||
      !SHA256.test(data.featureManifestSha256 || "") ||
      !Number.isInteger(data.barsUsed) || data.barsUsed < 1 ||
      typeof data.lastClosedBarAt !== "string" || !Number.isFinite(Date.parse(data.lastClosedBarAt))) {
    throw new TypeError("inference data provenance is incomplete");
  }
  if (expected.symbol && data.symbol !== expected.symbol) throw new Error("inference symbol does not match requested symbol");
  if (expected.timeframe && data.timeframe !== expected.timeframe) throw new Error("inference timeframe does not match requested timeframe");
  if (expected.lastClosedBarAt && data.lastClosedBarAt !== expected.lastClosedBarAt) {
    throw new Error("inference timestamp does not match the latest closed bar");
  }

  if (evaluation.status !== "passed" || evaluation.finalOosUntouched !== true ||
      !SHA256.test(evaluation.finalOosManifestSha256 || "") ||
      !Number.isInteger(evaluation.walkForwardFolds) || evaluation.walkForwardFolds < 5 ||
      !Number.isInteger(evaluation.closedTrades) || evaluation.closedTrades < 30 ||
      !Number.isFinite(evaluation.netProfitAfterCosts) || evaluation.netProfitAfterCosts <= 0 ||
      !Number.isFinite(evaluation.profitFactor) || evaluation.profitFactor <= 1 ||
      evaluation.calibration?.status !== "validated" ||
      !SHA256.test(evaluation.calibration?.manifestSha256 || "") ||
      !Number.isFinite(evaluation.calibration?.brierScore) ||
      !finiteUnit(evaluation.calibration.brierScore) ||
      !Number.isFinite(evaluation.calibration?.expectedCalibrationError) ||
      !finiteUnit(evaluation.calibration.expectedCalibrationError)) {
    throw new Error("model evaluation, net-of-cost OOS or calibration gates have not passed");
  }

  const probabilities = output.probabilities;
  if (!object(probabilities) ||
      !["bullish", "bearish", "sideways"].every((key) => finiteUnit(probabilities[key])) ||
      Math.abs(probabilities.bullish + probabilities.bearish + probabilities.sideways - 1) > 0.01 ||
      !REGIMES.has(output.regime) ||
      typeof output.generatedAt !== "string" || !Number.isFinite(Date.parse(output.generatedAt))) {
    throw new TypeError("inference probabilities, regime or timestamp are invalid");
  }

  if (Object.hasOwn(candidate, "order") || Object.hasOwn(candidate, "orders") ||
      Object.hasOwn(candidate, "entryPrice") || Object.hasOwn(candidate, "stopLoss") ||
      Object.hasOwn(candidate, "takeProfit")) {
    throw new Error("neural inference payload must not contain broker or trade instructions");
  }

  return Object.freeze({
    schemaVersion: candidate.schemaVersion,
    model: Object.freeze({
      id: model.id,
      version: model.version,
      runtime: model.runtime,
      artifactSha256: model.artifactSha256
    }),
    data: Object.freeze({
      symbol: data.symbol,
      timeframe: data.timeframe,
      datasetSha256: data.datasetSha256,
      featureManifestSha256: data.featureManifestSha256,
      barsUsed: data.barsUsed,
      lastClosedBarAt: data.lastClosedBarAt
    }),
    evaluation: Object.freeze({
      status: evaluation.status,
      finalOosManifestSha256: evaluation.finalOosManifestSha256,
      walkForwardFolds: evaluation.walkForwardFolds,
      closedTrades: evaluation.closedTrades,
      netProfitAfterCosts: evaluation.netProfitAfterCosts,
      profitFactor: evaluation.profitFactor,
      calibration: Object.freeze({
        status: evaluation.calibration.status,
        manifestSha256: evaluation.calibration.manifestSha256,
        brierScore: evaluation.calibration.brierScore,
        expectedCalibrationError: evaluation.calibration.expectedCalibrationError
      })
    }),
    output: Object.freeze({
      regime: output.regime,
      probabilities: Object.freeze({
        bullish: probabilities.bullish,
        bearish: probabilities.bearish,
        sideways: probabilities.sideways
      }),
      generatedAt: output.generatedAt
    }),
    executionEnabled: false,
    liveTradingEnabled: false,
    ordersEnabled: false
  });
}
