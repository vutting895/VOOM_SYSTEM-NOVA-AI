"""Reproducible synthetic benchmark for the reconstructed ACA optimizer.

Run from repository root:
    python scripts/research/benchmark_aca.py --evaluations 10000 --seeds 10
"""
from __future__ import annotations

import argparse
import json
import math
import random
import statistics
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from workers.quant_engine.aca import ACAOptimizer  # noqa: E402


def sphere(x: tuple[float, ...]) -> float:
    return -sum(value * value for value in x)


def rastrigin(x: tuple[float, ...]) -> float:
    return -(10 * len(x) + sum(
        value * value - 10 * math.cos(2 * math.pi * value) for value in x
    ))


def stepped(x: tuple[float, ...]) -> float:
    return -sum(round(value, 1) ** 2 for value in x)


def random_search(objective, bounds, budget: int, seed: int) -> float:
    rng = random.Random(seed)
    best = -math.inf
    for _ in range(budget):
        point = tuple(rng.uniform(lo, hi) for lo, hi in bounds)
        best = max(best, objective(point))
    return best


def summarize(values: list[float]) -> dict[str, float]:
    return {
        "mean_best_fitness": statistics.mean(values),
        "median_best_fitness": statistics.median(values),
        "best": max(values),
        "worst": min(values),
    }


def run(evaluations: int, seeds: int) -> dict:
    cases = {
        "sphere_10d": (sphere, [(-5.0, 5.0)] * 10),
        "rastrigin_10d": (rastrigin, [(-5.12, 5.12)] * 10),
        "step_rounded_10d": (stepped, [(-5.0, 5.0)] * 10),
    }
    results = {}
    for name, (objective, bounds) in cases.items():
        results[name] = {}
        for population in (2, 5, 10, 25):
            values = [
                ACAOptimizer(population_size=population, seed=seed).optimize(
                    objective, bounds, max_evaluations=evaluations
                ).best_fitness
                for seed in range(seeds)
            ]
            results[name][f"aca_population_{population}"] = summarize(values)
        baseline = [
            random_search(objective, bounds, evaluations, seed)
            for seed in range(seeds)
        ]
        results[name]["uniform_random"] = summarize(baseline)
    return {
        "schema": "nova.aca.synthetic-benchmark.v1",
        "objective_direction": "maximize",
        "evaluations_per_run": evaluations,
        "seeds": list(range(seeds)),
        "dp": 0.5,
        "pc": 0.2,
        "results": results,
        "not_market_data": True,
        "orders_submitted": False,
        "live_trading_enabled": False,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--evaluations", type=int, default=10_000)
    parser.add_argument("--seeds", type=int, default=10)
    args = parser.parse_args()
    if args.evaluations < 25 or args.seeds < 1:
        parser.error("evaluations must be >= 25 and seeds must be >= 1")
    print(json.dumps(run(args.evaluations, args.seeds), indent=2, sort_keys=True))
