"""Unit tests for the isolated, research-only Neural Network runtime."""
import hashlib
import json
import math
import unittest
from datetime import datetime, timedelta, timezone

from neural_runtime import (
    FEATURES, build_causal_features, infer_research_candidate,
    load_candidate, train_candidate, validate_ohlcv,
)


def make_bars(count=220, timeframe="M5"):
    seconds = {"M1": 60, "M5": 300, "M15": 900, "M30": 1800, "H1": 3600, "H4": 14400, "D1": 86400}[timeframe]
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    bars = []
    price = 2000.0
    for index in range(count):
        drift = 0.00035 if (index // 30) % 2 == 0 else -0.0002
        close = price * math.exp(drift + 0.0008 * math.sin(index / 4))
        open_ = price
        bars.append({
            "time": (start + timedelta(seconds=index * seconds)).isoformat().replace("+00:00", "Z"),
            "open": open_, "high": max(open_, close) * 1.0005,
            "low": min(open_, close) * 0.9995, "close": close,
            "volume": 100 + (index % 17) * 3,
        })
        price = close
    return bars


class NeuralRuntimeTests(unittest.TestCase):
    def test_ohlcv_validation_rejects_duplicate_and_missing_intervals(self):
        bars = make_bars()
        duplicate = [*bars]
        duplicate[90] = dict(duplicate[89])
        with self.assertRaisesRegex(ValueError, "strictly increasing"):
            validate_ohlcv(duplicate, "M5")
        missing = [*bars]
        missing.pop(90)
        with self.assertRaisesRegex(ValueError, "missing or irregular"):
            validate_ohlcv(missing, "M5")

    def test_ohlcv_validation_rejects_impossible_bars_and_naive_timestamps(self):
        bars = make_bars()
        bars[40]["high"] = bars[40]["low"] - 1
        with self.assertRaisesRegex(ValueError, "impossible"):
            validate_ohlcv(bars, "M5")
        bars = make_bars()
        bars[30]["time"] = "2026-01-01T02:30:00"
        with self.assertRaisesRegex(ValueError, "include a timezone"):
            validate_ohlcv(bars, "M5")

    def test_session_gaps_split_features_and_never_bridge_sequences_or_labels(self):
        bars = make_bars(320)
        for row in bars[150:]:
            stamp = datetime.fromisoformat(row["time"].replace("Z", "+00:00")) + timedelta(hours=1)
            row["time"] = stamp.isoformat().replace("+00:00", "Z")

        with self.assertRaisesRegex(ValueError, "missing or irregular"):
            validate_ohlcv(bars, "M5")

        accepted = validate_ohlcv(bars, "M5", allow_session_gaps=True)
        features, valid = build_causal_features(accepted, timeframe="M5")
        self.assertTrue(math.isnan(float(features[150][0])))
        self.assertNotIn(150, valid)
        self.assertIn(170, valid)

        artifact, manifest = train_candidate(
            bars, "XAUUSDm", "M5", sequence_length=16, horizon=3,
            epochs=1, hidden_size=8, seed=11, allow_session_gaps=True,
        )
        self.assertEqual(manifest["data"]["gapPolicy"], "segment_on_interval_gap")
        self.assertEqual(manifest["data"]["intervalGaps"]["intervalGapCount"], 1)
        self.assertEqual(manifest["data"]["intervalGaps"]["gapIntervals"], [13])
        self.assertFalse(manifest["training"]["finalOosTouched"])

        newer = make_bars(321)
        for row in newer[150:]:
            stamp = datetime.fromisoformat(row["time"].replace("Z", "+00:00")) + timedelta(hours=1)
            row["time"] = stamp.isoformat().replace("+00:00", "Z")
        result = infer_research_candidate(
            artifact, hashlib.sha256(artifact).hexdigest(), newer,
            "XAUUSDm", "M5", allow_session_gaps=True,
        )
        self.assertTrue(result["researchOnly"])
        self.assertFalse(result["ordersEnabled"])

        with self.assertRaisesRegex(ValueError, "gap policy must match"):
            infer_research_candidate(
                artifact, hashlib.sha256(artifact).hexdigest(), newer,
                "XAUUSDm", "M5", allow_session_gaps=False,
            )

        irregular = make_bars(100)
        for row in irregular[50:]:
            stamp = datetime.fromisoformat(row["time"].replace("Z", "+00:00")) + timedelta(seconds=3610)
            row["time"] = stamp.isoformat().replace("+00:00", "Z")
        with self.assertRaisesRegex(ValueError, "missing or irregular"):
            validate_ohlcv(irregular, "M5", allow_session_gaps=True)

    def test_features_are_causal_and_have_a_fixed_schema(self):
        bars = make_bars()
        features, valid = build_causal_features(validate_ohlcv(bars, "M5"))
        self.assertEqual(features.shape, (len(bars), len(FEATURES)))
        self.assertTrue(valid)
        changed_future = [dict(row) for row in bars]
        changed_future[-1]["close"] *= 1.2
        changed_future[-1]["high"] = max(changed_future[-1]["open"], changed_future[-1]["close"]) * 1.0005
        changed_future[-1]["low"] = min(changed_future[-1]["open"], changed_future[-1]["close"]) * 0.9995
        future_features, _ = build_causal_features(validate_ohlcv(changed_future, "M5"))
        self.assertEqual(features[-2].tolist(), future_features[-2].tolist())

    def test_candidate_training_reserves_final_oos_and_shadow_inference_is_read_only(self):
        bars = make_bars(260)
        artifact, manifest = train_candidate(
            bars, "XAUUSDm", "M5", sequence_length=16, horizon=3,
            epochs=2, hidden_size=8, seed=7,
        )
        digest = hashlib.sha256(artifact).hexdigest()
        self.assertEqual(manifest["model"]["artifactSha256"], digest)
        self.assertEqual(manifest["evaluation"]["status"], "not_evaluated")
        self.assertEqual(manifest["featureManifest"]["normalization"]["fittedOn"], "training_partition_only")
        self.assertEqual(len(manifest["featureManifest"]["normalization"]["mean"]), len(FEATURES))
        self.assertFalse(manifest["training"]["finalOosTouched"])
        self.assertGreater(manifest["training"]["finalOosSamplesReserved"], 0)
        self.assertFalse(manifest["training"]["finalOosTouched"])
        self.assertTrue(manifest["training"]["finalOosFirstDecisionAt"])
        self.assertTrue(manifest["training"]["finalOosLastTargetAt"])
        self.assertEqual(len(manifest["training"]["finalOosBarsSha256"]), 64)
        self.assertFalse(manifest["evaluation"]["promotable"])
        model, loaded_manifest = load_candidate(artifact, digest, "XAUUSDm", "M5")
        self.assertEqual(loaded_manifest["model"]["status"], "research_candidate")
        self.assertFalse(model.training)

        with self.assertRaisesRegex(ValueError, "must advance beyond"):
            infer_research_candidate(artifact, digest, bars, "XAUUSDm", "M5")

        newer = make_bars(261)
        result = infer_research_candidate(artifact, digest, newer, "XAUUSDm", "M5")
        self.assertTrue(result["researchOnly"])
        self.assertEqual(result["evaluationStatus"], "not_evaluated")
        self.assertAlmostEqual(sum(result["output"]["probabilities"].values()), 1.0, places=5)
        self.assertIn(result["output"]["regime"], ("bullish", "bearish", "sideways"))
        self.assertGreaterEqual(result["output"]["uncertainty"]["score"], 0.0)
        self.assertLessEqual(result["output"]["uncertainty"]["score"], 1.0)
        self.assertFalse(result["executionEnabled"])
        self.assertFalse(result["liveTradingEnabled"])
        self.assertFalse(result["ordersEnabled"])

    def test_artifact_hash_and_market_identity_are_mandatory(self):
        bars = make_bars(260)
        artifact, manifest = train_candidate(bars, "XAUUSDm", "M5", sequence_length=16, epochs=1, hidden_size=8)
        digest = hashlib.sha256(artifact).hexdigest()
        with self.assertRaisesRegex(ValueError, "SHA-256 mismatch"):
            load_candidate(artifact, "0" * 64, "XAUUSDm", "M5")
        with self.assertRaisesRegex(ValueError, "symbol/timeframe"):
            load_candidate(artifact, digest, "BTCUSDT", "M5")

    def test_training_parameters_and_short_history_fail_closed(self):
        with self.assertRaisesRegex(ValueError, "at least 80"):
            train_candidate(make_bars(60), "XAUUSDm", "M5")
        with self.assertRaisesRegex(ValueError, "outside safe bounds"):
            train_candidate(make_bars(), "XAUUSDm", "M5", epochs=500)


if __name__ == "__main__":
    unittest.main()
