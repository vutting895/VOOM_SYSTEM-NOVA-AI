"""Budget-matched, deterministic optimizers for isolated quant research.

All methods maximize a finite objective and consume exactly the requested number
of evaluations. This module has no broker, filesystem, network, or execution API.
"""
from __future__ import annotations
from dataclasses import dataclass
import math
import random
from typing import Callable, Sequence
from .aca import ACAOptimizer

Objective = Callable[[tuple[float, ...]], float]
Bounds = Sequence[tuple[float, float]]

@dataclass(frozen=True)
class OptimizerResult:
    method: str
    best_position: tuple[float, ...]
    best_fitness: float
    evaluations: int
    seed: int

def _validate(bounds: Bounds, budget: int, population_size: int) -> tuple[tuple[float, float], ...]:
    if isinstance(population_size, bool) or not isinstance(population_size, int) or population_size < 2:
        raise ValueError("population_size must be an integer >= 2")
    if isinstance(budget, bool) or not isinstance(budget, int) or budget < population_size:
        raise ValueError("evaluation budget must be an integer >= population_size")
    if not bounds:
        raise ValueError("bounds must not be empty")
    clean = []
    for pair in bounds:
        if len(pair) != 2:
            raise ValueError("each bound must contain lower and upper")
        lo, hi = pair
        if isinstance(lo, bool) or isinstance(hi, bool) or not math.isfinite(float(lo)) or not math.isfinite(float(hi)) or lo >= hi:
            raise ValueError("bounds must be finite and lower < upper")
        clean.append((float(lo), float(hi)))
    return tuple(clean)

def optimize(method: str, objective: Objective, bounds: Bounds, *, evaluation_budget: int,
             seed: int = 0, population_size: int = 10) -> OptimizerResult:
    """Run ACA, PSO, GA, or uniform random with an identical call budget."""
    clean = _validate(bounds, evaluation_budget, population_size)
    if not callable(objective):
        raise ValueError("objective must be callable")
    if not isinstance(method, str):
        raise ValueError("method must be a string")
    if isinstance(seed, bool) or not isinstance(seed, int):
        raise ValueError("seed must be an integer")
    key = method.strip().lower()
    if key == "aca":
        result = ACAOptimizer(population_size=population_size, seed=seed).optimize(
            lambda x: _finite_score(objective, x), clean, evaluation_budget)
        return OptimizerResult(key, tuple(result.best_position), result.best_fitness, result.evaluations, seed)

    rng = random.Random(seed)
    calls = 0
    best_x: tuple[float, ...] | None = None
    best_y = -math.inf
    def evaluate(position: Sequence[float]) -> float:
        nonlocal calls, best_x, best_y
        if calls >= evaluation_budget:
            raise RuntimeError("optimizer exceeded evaluation budget")
        if len(position) != len(clean):
            raise ValueError("objective position dimension does not match bounds")
        x = tuple(min(hi, max(lo, float(v))) for v, (lo, hi) in zip(position, clean))
        y = _finite_score(objective, x)
        calls += 1
        if y > best_y:
            best_x, best_y = x, y
        return y
    def random_position() -> list[float]:
        return [rng.uniform(lo, hi) for lo, hi in clean]

    if key == "random":
        while calls < evaluation_budget:
            evaluate(random_position())
    elif key == "pso":
        positions = [random_position() for _ in range(population_size)]
        velocities = [[rng.uniform(-(hi-lo)*0.1, (hi-lo)*0.1) for lo, hi in clean] for _ in positions]
        personal = [p[:] for p in positions]
        personal_scores = [evaluate(p) for p in positions]
        global_index = max(range(population_size), key=lambda i: personal_scores[i])
        global_best = personal[global_index][:]
        while calls < evaluation_budget:
            for i, pos in enumerate(positions):
                if calls >= evaluation_budget:
                    break
                for d, (lo, hi) in enumerate(clean):
                    r1, r2 = rng.random(), rng.random()
                    velocities[i][d] = (0.729 * velocities[i][d]
                        + 1.49445 * r1 * (personal[i][d] - pos[d])
                        + 1.49445 * r2 * (global_best[d] - pos[d]))
                    velocities[i][d] = max(-(hi-lo)*0.5, min((hi-lo)*0.5, velocities[i][d]))
                    pos[d] = max(lo, min(hi, pos[d] + velocities[i][d]))
                score = evaluate(pos)
                if score > personal_scores[i]:
                    personal[i], personal_scores[i] = pos[:], score
                    if score >= best_y:
                        global_best = pos[:]
    elif key == "ga":
        population = [random_position() for _ in range(population_size)]
        scores = [evaluate(p) for p in population]
        while calls < evaluation_budget:
            def tournament() -> list[float]:
                candidates = [rng.randrange(len(population)) for _ in range(3)]
                return population[max(candidates, key=lambda i: scores[i])][:]
            next_population: list[list[float]] = []
            while len(next_population) < population_size:
                a, b = tournament(), tournament()
                child = []
                for d, (lo, hi) in enumerate(clean):
                    alpha = rng.random()
                    value = alpha * a[d] + (1-alpha) * b[d]
                    if rng.random() < 0.2:
                        value += rng.gauss(0, (hi-lo)*0.12)
                    child.append(max(lo, min(hi, value)))
                next_population.append(child)
            population, scores = [], []
            for child in next_population:
                if calls >= evaluation_budget:
                    break
                population.append(child)
                scores.append(evaluate(child))
    else:
        raise ValueError("method must be one of: aca, pso, ga, random")
    assert best_x is not None and calls == evaluation_budget
    return OptimizerResult(key, best_x, best_y, calls, seed)

def _finite_score(objective: Objective, position: Sequence[float]) -> float:
    score = objective(tuple(float(v) for v in position))
    if isinstance(score, bool) or not isinstance(score, (int, float)) or not math.isfinite(float(score)):
        raise ValueError("objective must return a finite numeric score")
    return float(score)
