import unittest

from workers.quant_engine.model_plugin import (
    ModelInput, ModelOutput, ModelPluginError, ModelPluginRegistry, feature_schema_sha256,
)

DATA_SHA = "a" * 64
FEATURES = ["return_1", "volatility_20"]
SCHEMA_SHA = feature_schema_sha256(FEATURES)
TIMESTAMP = "2026-11-12T00:00:00Z"


class FakePlugin:
    family = "lstm"
    model_version = "test-v1"
    feature_schema_sha256 = SCHEMA_SHA

    def predict(self, model_input):
        return ModelOutput(
            family=self.family, model_version=self.model_version,
            decision_timestamp=model_input.decision_timestamp,
            dataset_sha256=model_input.dataset_sha256,
            feature_schema_sha256=model_input.feature_schema_sha256,
            direction=1, score=0.8, evaluation_ref="evaluation://walk-forward/run-001",
        )


def sample_input(**overrides):
    values = dict(decision_timestamp=TIMESTAMP, dataset_sha256=DATA_SHA,
                  feature_schema_sha256=SCHEMA_SHA,
                  feature_values={"return_1": 0.01, "volatility_20": 0.02}, timeframe="H1")
    values.update(overrides)
    return ModelInput(**values)


class ModelPluginContractTests(unittest.TestCase):
    def test_registered_plugin_emits_valid_point_in_time_vote(self):
        registry = ModelPluginRegistry()
        registry.register(FakePlugin())
        output = registry.predict("lstm", "test-v1", sample_input())
        self.assertEqual(output.direction, 1)
        self.assertEqual(output.dataset_sha256, DATA_SHA)

    def test_duplicate_registration_rejected(self):
        registry = ModelPluginRegistry()
        registry.register(FakePlugin())
        with self.assertRaises(ModelPluginError):
            registry.register(FakePlugin())

    def test_unknown_plugin_rejected(self):
        with self.assertRaises(ModelPluginError):
            ModelPluginRegistry().predict("lstm", "missing", sample_input())

    def test_dataset_or_schema_mismatch_rejected(self):
        registry = ModelPluginRegistry()
        registry.register(FakePlugin())
        with self.assertRaises(ModelPluginError):
            registry.predict("lstm", "test-v1", sample_input(dataset_sha256="b" * 64))
        with self.assertRaises(ModelPluginError):
            registry.predict("lstm", "test-v1", sample_input(feature_schema_sha256="c" * 64))

    def test_invalid_timestamp_and_non_finite_features_rejected(self):
        with self.assertRaises(ModelPluginError):
            sample_input(decision_timestamp="2026-11-12T00:00:00")
        with self.assertRaises(ModelPluginError):
            sample_input(feature_values={"return_1": float("nan")})

    def test_plugin_output_with_future_timestamp_rejected(self):
        class FuturePlugin(FakePlugin):
            def predict(self, model_input):
                output = super().predict(model_input)
                return ModelOutput(**{**output.__dict__, "decision_timestamp": "2026-11-12T00:01:00Z"})
        registry = ModelPluginRegistry()
        registry.register(FuturePlugin())
        with self.assertRaises(ModelPluginError):
            registry.predict("lstm", "test-v1", sample_input())

    def test_neutral_direction_requires_zero_score(self):
        class InvalidNeutral(FakePlugin):
            def predict(self, model_input):
                return ModelOutput("lstm", "test-v1", model_input.decision_timestamp,
                    model_input.dataset_sha256, model_input.feature_schema_sha256,
                    0, 0.2, "evaluation://test")
        registry = ModelPluginRegistry()
        registry.register(InvalidNeutral())
        with self.assertRaises(ModelPluginError):
            registry.predict("lstm", "test-v1", sample_input())


if __name__ == "__main__":
    unittest.main(verbosity=2)
