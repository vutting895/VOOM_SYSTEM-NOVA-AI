import math
import unittest

from workers.quant_engine.aca import ACAOptimizer


class ACAOptimizerTests(unittest.TestCase):
    def test_exact_evaluation_budget_and_bounds(self):
        calls = []

        def objective(x):
            calls.append(x)
            return -sum(value * value for value in x)

        result = ACAOptimizer(population_size=5, seed=7).optimize(
            objective,
            [(-3.0, 7.0), (10.0, 20.0), (-0.1, 0.1)],
            max_evaluations=103,
        )
        self.assertEqual(result.evaluations, 103)
        self.assertEqual(len(calls), 103)
        self.assertTrue(all(-3 <= x[0] <= 7 and 10 <= x[1] <= 20 and -0.1 <= x[2] <= 0.1
                            for x in calls))
        self.assertTrue(all(a <= b for a, b in zip(result.best_history, result.best_history[1:])))

    def test_deterministic_seed(self):
        fn = lambda x: -sum(value * value for value in x)
        bounds = [(-5, 5)] * 10
        first = ACAOptimizer(population_size=2, seed=42).optimize(fn, bounds, 1000)
        second = ACAOptimizer(population_size=2, seed=42).optimize(fn, bounds, 1000)
        self.assertEqual(first, second)

    def test_non_finite_objective_rejected(self):
        with self.assertRaises(ValueError):
            ACAOptimizer(population_size=2).optimize(lambda _: math.nan, [(0, 1)], 10)

    def test_invalid_population_and_budget_rejected(self):
        with self.assertRaises(ValueError):
            ACAOptimizer(population_size=1)
        with self.assertRaises(ValueError):
            ACAOptimizer(population_size=5).optimize(lambda x: -sum(x), [(0, 1)], 4)

    def test_constant_objective_stays_finite_and_monotonic(self):
        result = ACAOptimizer(population_size=2, seed=1).optimize(
            lambda _: 1.0, [(-1, 1)] * 4, 27
        )
        self.assertEqual(result.evaluations, 27)
        self.assertEqual(result.best_fitness, 1.0)
        self.assertTrue(all(value == 1.0 for value in result.best_history))


if __name__ == "__main__":
    unittest.main()
