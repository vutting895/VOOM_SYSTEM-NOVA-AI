import unittest

from workers.strategy_signal import (
    SCHEMA_VERSION,
    StrategySignalValidationError,
    strategy_signal_sha256,
    validate_strategy_signal,
)


def sample():
    return {
        "schema_version": SCHEMA_VERSION,
        "strategy_id": "sniper.wave3",
        "strategy_version": "0.1.0",
        "run_id": "run-001",
        "symbol": "XAUUSDm",
        "timeframe": "H1",
        "bar_closed_at_utc": "2026-11-07T10:00:00Z",
        "generated_at_utc": "2026-11-07T10:00:02Z",
        "decision": "BUY_CANDIDATE",
        "reason_codes": ["WAVE_CONFIRMATION", "SMC_DEMAND"],
        "evidence_refs": ["bar:2026-11-07T10:00:00Z"],
        "feature_version": "features.v1",
        "model_version": "untrained-baseline",
        "config_hash": "a" * 64,
        "dataset_sha256": "b" * 64,
        "data_freshness": "FRESH",
        "coverage_status": "COMPLETE",
    }


class StrategySignalTests(unittest.TestCase):
    def test_valid_signal_normalizes_symbol_and_utc(self):
        item = sample()
        item["symbol"] = "xauusdm"
        item["bar_closed_at_utc"] = "2026-11-07T17:00:00+07:00"
        result = validate_strategy_signal(item)
        self.assertEqual(result["symbol"], "XAUUSDM")
        self.assertEqual(result["bar_closed_at_utc"], "2026-11-07T10:00:00Z")

    def test_hash_is_deterministic_and_key_order_independent(self):
        item = sample()
        reversed_item = dict(reversed(list(item.items())))
        self.assertEqual(strategy_signal_sha256(item), strategy_signal_sha256(reversed_item))

    def test_rejects_unknown_or_sensitive_identity_fields(self):
        item = sample()
        item["tenant_id"] = "forged"
        with self.assertRaises(StrategySignalValidationError):
            validate_strategy_signal(item)

    def test_rejects_stale_or_incomplete_candidate(self):
        item = sample()
        item["data_freshness"] = "STALE"
        with self.assertRaises(StrategySignalValidationError):
            validate_strategy_signal(item)

    def test_allows_rejected_signal_with_incomplete_data(self):
        item = sample()
        item["decision"] = "REJECTED"
        item["data_freshness"] = "STALE"
        item["coverage_status"] = "INCOMPLETE"
        self.assertEqual(validate_strategy_signal(item)["decision"], "REJECTED")

    def test_rejects_generation_before_closed_bar(self):
        item = sample()
        item["generated_at_utc"] = "2026-11-07T09:59:59Z"
        with self.assertRaises(StrategySignalValidationError):
            validate_strategy_signal(item)

    def test_confidence_requires_calibration_reference(self):
        item = sample()
        item["confidence"] = 0.9
        with self.assertRaises(StrategySignalValidationError):
            validate_strategy_signal(item)

    def test_rejects_non_finite_confidence(self):
        item = sample()
        item["confidence"] = float("nan")
        item["calibration_ref"] = "calibration-01"
        with self.assertRaises(StrategySignalValidationError):
            validate_strategy_signal(item)


if __name__ == "__main__":
    unittest.main()
