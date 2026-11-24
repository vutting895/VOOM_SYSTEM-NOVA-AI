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

    def test_shared_trainer_produces_hashed_checkpoint(self):
        from workers.quant_engine.training import train_sequence_model
        model = build_residual_mlp_model(input_size=3, sequence_length=4,
                                         hidden_size=16, num_blocks=1, dropout=0.0)
        train_x = self.torch.randn(8, 4, 3).tolist()
        valid_x = self.torch.randn(4, 4, 3).tolist()
        train_y = self.torch.randn(8).tolist()
        valid_y = self.torch.randn(4).tolist()
        initial_state = {key: value.detach().clone() for key, value in model.state_dict().items()}
        result = train_sequence_model(
            model, train_x, train_y, valid_x, valid_y,
            model_version="residual-mlp-contract-v1",
            dataset_sha256="a" * 64, feature_schema_sha256="b" * 64,
            epochs=5, batch_size=4, patience=3, seed=13,
        )
        import hashlib
        import io
        self.assertEqual(result.checkpoint_sha256,
                         hashlib.sha256(result.checkpoint_bytes).hexdigest())
        self.assertNotEqual(result.checkpoint_bytes, b"mock-checkpoint-bytes")
        self.assertGreaterEqual(result.best_epoch, 1)
        self.assertTrue(self.torch.isfinite(self.torch.tensor(result.best_validation_loss)))
        self.assertTrue(any(not self.torch.equal(initial_state[key], value)
                            for key, value in model.state_dict().items()))
        checkpoint = self.torch.load(io.BytesIO(result.checkpoint_bytes), map_location="cpu")
        self.assertEqual(checkpoint["format"], "nova.pytorch-checkpoint.v1")
        self.assertEqual(checkpoint["model_version"], "residual-mlp-contract-v1")
        self.assertEqual(checkpoint["dataset_sha256"], "a" * 64)
        self.assertEqual(checkpoint["feature_schema_sha256"], "b" * 64)
        self.assertEqual(checkpoint["best_epoch"], result.best_epoch)
        self.assertTrue(all(self.torch.equal(checkpoint["state_dict"][key], value.cpu())
                            for key, value in model.state_dict().items()))

    def test_trainer_rejects_bad_provenance_and_non_finite_inputs(self):
        from workers.quant_engine.training import train_sequence_model
        model = build_residual_mlp_model(input_size=3, sequence_length=4, hidden_size=8)
        x = self.torch.ones(4, 4, 3)
        y = self.torch.ones(4)
        with self.assertRaises(ValueError):
            train_sequence_model(model, x, y, x, y, "v1", "not-a-hash", "b" * 64)
        bad_x = x.clone()
        bad_x[0, 0, 0] = float("nan")
        with self.assertRaises(ValueError):
            train_sequence_model(model, bad_x, y, x, y, "v1", "a" * 64, "b" * 64)

    def test_invalid_window_shape_rejected(self):
        model = build_residual_mlp_model(input_size=6, sequence_length=24,
                                         hidden_size=32, num_blocks=2)
        with self.assertRaises(ValueError):
            model(self.torch.randn(4, 23, 6))

    def test_invalid_dimensions_rejected(self):
        with self.assertRaises(ValueError):
            build_residual_mlp_model(input_size=6, sequence_length=0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
