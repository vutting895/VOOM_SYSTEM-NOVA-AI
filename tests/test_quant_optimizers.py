import unittest
from workers.quant_engine.objective import calculate_trade_metrics, make_trade_objective, score_trade_metrics
from workers.quant_engine.optimizers import optimize

class OptimizerBudgetTests(unittest.TestCase):
    def test_all_methods_use_exact_same_budget_and_are_repeatable(self):
        bounds = [(-5.0, 5.0), (-2.0, 2.0)]
        for method in ("aca", "pso", "ga", "random"):
            calls = []
            fn = lambda x: calls.append(x) or -sum(v*v for v in x)
            result = optimize(method, fn, bounds, evaluation_budget=103, seed=19, population_size=10)
            self.assertEqual(result.evaluations, 103)
            self.assertEqual(len(calls), 103)
            calls2 = []
            fn2 = lambda x: calls2.append(x) or -sum(v*v for v in x)
            again = optimize(method, fn2, bounds, evaluation_budget=103, seed=19, population_size=10)
            self.assertEqual(result, again)
    def test_non_finite_objective_rejected(self):
        with self.assertRaises(ValueError):
            optimize("pso", lambda _: float("nan"), [(0, 1)], evaluation_budget=20, population_size=5)

class ObjectiveTests(unittest.TestCase):
    def test_trade_metrics_include_net_pnl_and_drawdown(self):
        metrics = calculate_trade_metrics([{"net_pnl": 20}, {"net_pnl": -10}, {"net_pnl": 30}], 100)
        self.assertEqual(metrics.closed_trades, 3)
        self.assertEqual(metrics.net_profit, 40)
        self.assertEqual(metrics.profit_factor, 5)
        self.assertAlmostEqual(metrics.max_drawdown_pct, 10 / 120 * 100)
    def test_minimum_trade_gate_blocks_small_samples(self):
        metrics = calculate_trade_metrics([{"net_pnl": 10}] * 5, 100)
        self.assertLess(score_trade_metrics(metrics, minimum_closed_trades=30), -100_000)
    def test_objective_requires_cost_inclusive_runner(self):
        with self.assertRaises(ValueError):
            make_trade_objective(lambda *_: [], [], {"rr": (1, 3)}, strategy_id="smc",
                                 initial_equity=1000, costs_included=False)
    def test_objective_maps_parameters_and_scores_trades(self):
        seen = {}
        def runner(data, params):
            seen.update(params)
            return [{"net_pnl": 20.0}, {"net_pnl": -5.0}] * 20
        objective = make_trade_objective(runner, object(), {"rr": (1.0, 3.0)}, strategy_id="smc",
                                         initial_equity=1000, costs_included=True)
        self.assertEqual(objective([2.0]) > 0, True)
        self.assertEqual(seen, {"rr": 2.0})

if __name__ == "__main__":
    unittest.main(verbosity=2)
