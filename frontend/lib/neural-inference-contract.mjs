const SHA256 = /^[a-f0-9]{64}$/i;
const REGIMES = new Set(["bullish", "bearish", "sideways", "unknown"]);
const UNCERTAINTY_METHODS = new Set(["ensemble_variance", "mc_dropout", "predictive_entropy"]);

function object(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finiteUnit(value) {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function exactKeys(value, expected, label) {
  if (!object(value)) throw new TypeError(label + " must be an object");
  const actual = Object.keys(value).sort();
  const allowed = [...expected].sort();
  if (actual.length !== allowed.length || actual.some((key, index) => key !== allowed[index])) {
    throw new TypeError("unexpected or missing " + label + " fields");
  }
}

/**
 * Validate a versioned inference result against caller-owned market context.
 * It does not load a model, generate a prediction or accept a broker action.
 */
export function validateNeuralInferenceResult(candidate, expected = {}) {
  exactKeys(candidate, ["schemaVersion", "model", "data", "evaluation", "output"], "inference result");
  if (candidate.schemaVersion !== "nova.neural-inference.v1") {
    throw new TypeError("unsupported neural inference schema version");
  }

  const model = candidate.model;
  const data = candidate.data;
  const evaluation = candidate.evaluation;
  const output = candidate.output;
  exactKeys(model, ["id", "version", "status", "runtime", "artifactSha256"], "model");
  exactKeys(data, ["symbol", "timeframe", "datasetSha256", "featureManifestSha256", "barsUsed", "lastClosedBarAt"], "data");
  exactKeys(evaluation, [
    "status", "finalOosUntouched", "finalOosManifestSha256", "walkForwardFolds",
    "closedTrades", "netProfitAfterCosts", "profitFactor", "calibration"
  ], "evaluation");
  exactKeys(evaluation.calibration, [
    "status", "manifestSha256", "brierScore", "expectedCalibrationError"
  ], "calibration");
  exactKeys(output, ["regime", "probabilities", "uncertainty", "generatedAt"], "output");
  exactKeys(output.probabilities, ["bullish", "bearish", "sideways"], "probabilities");
  exactKeys(output.uncertainty, ["score", "method"], "uncertainty");

  if (model.status !== "validated" || !["pytorch", "torchscript"].includes(model.runtime)) {
    throw new Error("model runtime or lifecycle is not validated");
  }
  if (typeof model.id !== "string" || !model.id.trim() ||
      typeof model.version !== "string" || !model.version.trim() ||
      !SHA256.test(model.artifactSha256 || "")) {
    throw new TypeError("model id, version and artifact SHA-256 are required");
  }
  if (typeof data.symbol !== "string" || !data.symbol.trim() ||
      typeof data.timeframe !== "string" || !data.timeframe.trim() ||
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

  const calibration = evaluation.calibration;
  if (evaluation.status !== "passed" || evaluation.finalOosUntouched !== true ||
      !SHA256.test(evaluation.finalOosManifestSha256 || "") ||
      !Number.isInteger(evaluation.walkForwardFolds) || evaluation.walkForwardFolds < 5 ||
      !Number.isInteger(evaluation.closedTrades) || evaluation.closedTrades < 30 ||
      !Number.isFinite(evaluation.netProfitAfterCosts) || evaluation.netProfitAfterCosts <= 0 ||
      !Number.isFinite(evaluation.profitFactor) || evaluation.profitFactor <= 1 ||
      calibration.status !== "validated" ||
      !SHA256.test(calibration.manifestSha256 || "") ||
      !finiteUnit(calibration.brierScore) ||
      !finiteUnit(calibration.expectedCalibrationError)) {
    throw new Error("model evaluation, net-of-cost OOS or calibration gates have not passed");
  }

  const probabilities = output.probabilities;
  const generatedAt = Date.parse(output.generatedAt);
  if (!Object.values(probabilities).every(finiteUnit) ||
      Math.abs(probabilities.bullish + probabilities.bearish + probabilities.sideways - 1) > 0.01 ||
      !REGIMES.has(output.regime) ||
      !Number.isFinite(generatedAt) ||
      generatedAt < Date.parse(data.lastClosedBarAt) ||
      !finiteUnit(output.uncertainty.score) ||
      !UNCERTAINTY_METHODS.has(output.uncertainty.method)) {
    throw new TypeError("inference probabilities, uncertainty, regime or timestamp are invalid");
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
        status: calibration.status,
        manifestSha256: calibration.manifestSha256,
        brierScore: calibration.brierScore,
        expectedCalibrationError: calibration.expectedCalibrationError
      })
    }),
    output: Object.freeze({
      regime: output.regime,
      probabilities: Object.freeze({
        bullish: probabilities.bullish,
        bearish: probabilities.bearish,
        sideways: probabilities.sideways
      }),
      uncertainty: Object.freeze({
        score: output.uncertainty.score,
        method: output.uncertainty.method
      }),
      generatedAt: output.generatedAt
    }),
    executionEnabled: false,
    liveTradingEnabled: false,
    ordersEnabled: false
  });
}
