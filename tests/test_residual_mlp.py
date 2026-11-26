import unittest

from workers.quant_engine.torch_models import build_residual_mlp_model


class ResidualMLPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        try:
            import torch
        except ImportError:
            raise unittest.SkipTest("PyTorch is optional in core CI")
        cls.torch = torch

    def test_fixed_causal_window_forward_shape(self):
        model = build_residual_mlp_model(input_size=6, sequence_length=24,
                                         hidden_size=32, num_blocks=2, dropout=0.0)
        output = model(self.torch.randn(4, 24, 6))
        self.assertEqual(tuple(output.shape), (4,))
        self.assertTrue(self.torch.isfinite(output).all())
        self.assertEqual(len(model.blocks), 2)

    def test_shared_trainer_produces_real_hashed_checkpoint(self):
        from workers.quant_engine.training import train_sequence_model
        model = build_residual_mlp_model(input_size=3, sequence_length=4,
                                         hidden_size=16, num_blocks=1, dropout=0.0)
        train_x = self.torch.randn(8, 4, 3).tolist()
        valid_x = self.torch.randn(4, 4, 3).tolist()
        train_y = self.torch.randn(8).tolist()
        valid_y = self.torch.randn(4).tolist()
        result = train_sequence_model(
            model, train_x, train_y, valid_x, valid_y,
            model_version="residual-mlp-contract-v1",
            dataset_sha256="a" * 64, feature_schema_sha256="b" * 64,
            epochs=2, batch_size=4, patience=2, seed=13,
        )
        import hashlib
        self.assertEqual(result.checkpoint_sha256,
                         hashlib.sha256(result.checkpoint_bytes).hexdigest())
        self.assertGreaterEqual(result.best_epoch, 1)
        self.assertTrue(self.torch.isfinite(self.torch.tensor(result.best_validation_loss)))
        self.assertGreater(len(result.checkpoint_bytes), 100)

    def test_trainer_rejects_bad_dataset_digest(self):
        from workers.quant_engine.training import train_sequence_model
        model = build_residual_mlp_model(input_size=3, sequence_length=4,
                                         hidden_size=16, num_blocks=1)
        with self.assertRaisesRegex(ValueError, "dataset_sha256"):
            train_sequence_model(
                model, [[[1, 2, 3]] * 4] * 2, [0, 1],
                [[[1, 2, 3]] * 4], [0],
                model_version="test-v1", dataset_sha256="invalid",
                feature_schema_sha256="b" * 64, epochs=1,
            )

    def test_invalid_window_shape_rejected(self):
        model = build_residual_mlp_model(input_size=6, sequence_length=24,
                                         hidden_size=32, num_blocks=2)
        with self.assertRaises(ValueError):
            model(self.torch.randn(4, 23, 6))

    def test_invalid_dimensions_and_dropout_rejected(self):
        with self.assertRaises(ValueError):
            build_residual_mlp_model(input_size=6, sequence_length=0)
        with self.assertRaises(ValueError):
            build_residual_mlp_model(dropout=1.0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
