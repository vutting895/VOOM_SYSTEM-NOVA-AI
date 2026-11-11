import unittest

from workers.quant_engine.training import TrainingError, validate_training_inputs


class TrainingInputContractTests(unittest.TestCase):
    def setUp(self):
        self.train_x = [[[float(i), float(i + 1)] for _ in range(4)] for i in range(12)]
        self.train_y = [float(i) / 100 for i in range(12)]
        self.valid_x = [[[float(i), float(i + 1)] for _ in range(4)] for i in range(4)]
        self.valid_y = [float(i) / 100 for i in range(4)]

    def test_valid_shapes_are_returned(self):
        self.assertEqual(validate_training_inputs(
            self.train_x, self.train_y, self.valid_x, self.valid_y,
            epochs=5, batch_size=4, patience=2, learning_rate=0.001, seed=42,
        ), (2, 4))

    def test_misaligned_targets_and_shapes_rejected(self):
        with self.assertRaises(TrainingError):
            validate_training_inputs(self.train_x, self.train_y[:-1], self.valid_x, self.valid_y,
                                     epochs=5, batch_size=4, patience=2, learning_rate=0.001, seed=42)
        invalid = [[ [1.0], [2.0] ]]
        with self.assertRaises(TrainingError):
            validate_training_inputs(self.train_x, self.train_y, invalid, [0.1],
                                     epochs=5, batch_size=4, patience=2, learning_rate=0.001, seed=42)

    def test_nan_boolean_and_bad_configuration_rejected(self):
        bad = [[[float("nan"), 1.0] for _ in range(4)]]
        with self.assertRaises(TrainingError):
            validate_training_inputs(bad, [0.1], self.valid_x, self.valid_y,
                                     epochs=5, batch_size=4, patience=2, learning_rate=0.001, seed=42)
        with self.assertRaises(TrainingError):
            validate_training_inputs(self.train_x, self.train_y, self.valid_x, self.valid_y,
                                     epochs=True, batch_size=4, patience=2, learning_rate=0.001, seed=42)


if __name__ == "__main__":
    unittest.main(verbosity=2)
