import unittest

from workers.quant_engine.sequence_data import (
    SequenceDataError, build_sequence_samples, chronological_sequence_split,
    fit_feature_normalizer,
)


def rows(count=100):
    result = []
    for i in range(count):
        result.append({
            "timestamp": f"2026-01-{1 + i // 24:02d}T{i % 24:02d}:00:00Z",
            "close": 100.0 + i,
            "return_1": i / 1000.0,
            "volatility": (i % 7) / 100.0,
        })
    return result


class SequenceDatasetTests(unittest.TestCase):
    def test_forward_labels_drop_unavailable_tail(self):
        samples = build_sequence_samples(rows(30), feature_names=["return_1", "volatility"],
                                         sequence_length=5, label_horizon_bars=3)
        self.assertEqual(len(samples), 30 - 3 - 5 + 1)
        self.assertEqual(samples[-1].source_end_index, 26)
        self.assertAlmostEqual(samples[-1].forward_return, (129.0 / 126.0) - 1.0)

    def test_each_sample_uses_only_current_and_prior_features(self):
        data = rows(30)
        samples = build_sequence_samples(data, feature_names=["return_1"], sequence_length=4,
                                         label_horizon_bars=2)
        self.assertEqual(samples[0].features, ((0.0,), (0.001,), (0.002,), (0.003,)))
        self.assertEqual(samples[0].decision_timestamp, data[3]["timestamp"])

    def test_invalid_timestamps_nan_and_nonpositive_close_rejected(self):
        data = rows(20)
        data[4]["timestamp"] = data[3]["timestamp"]
        with self.assertRaises(SequenceDataError):
            build_sequence_samples(data, feature_names=["return_1"], sequence_length=3, label_horizon_bars=1)
        data = rows(20)
        data[5]["return_1"] = float("nan")
        with self.assertRaises(SequenceDataError):
            build_sequence_samples(data, feature_names=["return_1"], sequence_length=3, label_horizon_bars=1)
        data = rows(20)
        data[5]["close"] = 0
        with self.assertRaises(SequenceDataError):
            build_sequence_samples(data, feature_names=["return_1"], sequence_length=3, label_horizon_bars=1)

    def test_split_purges_at_least_forward_horizon(self):
        samples = build_sequence_samples(rows(100), feature_names=["return_1"], sequence_length=4,
                                          label_horizon_bars=3)
        split = chronological_sequence_split(samples, purge_bars=3, label_horizon_bars=3)
        self.assertEqual(len(split.purged_sample_indices), 6)
        self.assertLess(split.train[-1].source_end_index + 3, split.validation[0].source_end_index + 1)
        self.assertLess(split.validation[-1].source_end_index + 3, split.test[0].source_end_index + 1)
        with self.assertRaises(SequenceDataError):
            chronological_sequence_split(samples, purge_bars=2, label_horizon_bars=3)

    def test_normalizer_is_fit_on_training_partition_only(self):
        samples = build_sequence_samples(rows(100), feature_names=["return_1", "volatility"],
                                         sequence_length=4, label_horizon_bars=2)
        split = chronological_sequence_split(samples, purge_bars=2, label_horizon_bars=2)
        normalizer = fit_feature_normalizer(split.train, feature_names=["return_1", "volatility"])
        train_values = [row[0] for sample in split.train for row in sample.features]
        self.assertAlmostEqual(normalizer.means[0], sum(train_values) / len(train_values))
        transformed = normalizer.transform_sequence(split.test[0].features)
        self.assertEqual(len(transformed), 4)
        self.assertGreater(transformed[0][0], 0.0)

    def test_constant_feature_uses_unit_scale(self):
        data = rows(20)
        for row in data:
            row["constant"] = 5.0
        samples = build_sequence_samples(data, feature_names=["constant"], sequence_length=3,
                                         label_horizon_bars=1)
        normalizer = fit_feature_normalizer(samples, feature_names=["constant"])
        self.assertEqual(normalizer.scales, (1.0,))


if __name__ == "__main__":
    unittest.main(verbosity=2)
