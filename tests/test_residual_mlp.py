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
