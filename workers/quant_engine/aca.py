"""Reconstructed Andean Condor Algorithm (ACA) for bounded maximization.

Implements the MQL5 article's rank/DP/PC status split, coordinate-reset
exploration, four-scale one-coordinate intensification, and greedy acceptance.
Search coordinates are normalized to [-1, 1] so perturbation scales are
comparable across EA parameters with different physical units.
"""
from __future__ import annotations

from dataclasses import dataclass
import math
import random
from typing import Callable, Sequence


@dataclass(frozen=True)
class ACAResult:
    best_position: tuple[float, ...]
    best_fitness: float
    evaluations: int
    generations: int
    best_history: tuple[float, ...]


class ACAOptimizer:
    """ACA minimization wrapper expressed as bounded objective maximization."""

    def __init__(
        self,
        population_size: int = 2,
        distribution_parameter: float = 0.5,
        perturbation_coefficient: float = 0.2,
        seed: int = 1,
    ) -> None:
        if isinstance(population_size, bool) or population_size < 2:
            raise ValueError("population_size must be an integer >= 2")
        if not isinstance(population_size, int):
            raise ValueError("population_size must be an integer >= 2")
        if not 0.0 <= distribution_parameter <= 1.0:
            raise ValueError("distribution_parameter must be in [0, 1]")
        if not 0.0 <= perturbation_coefficient <= 1.0:
            raise ValueError("perturbation_coefficient must be in [0, 1]")
        self.population_size = population_size
        self.dp = float(distribution_parameter)
        self.pc = float(perturbation_coefficient)
        self.seed = seed

    def optimize(
        self,
        objective: Callable[[tuple[float, ...]], float],
        bounds: Sequence[tuple[float, float]],
        max_evaluations: int = 10_000,
    ) -> ACAResult:
        if not bounds:
            raise ValueError("bounds must contain at least one dimension")
        if max_evaluations < self.population_size:
            raise ValueError("max_evaluations must be >= population_size")
        clean_bounds: list[tuple[float, float]] = []
        for lo, hi in bounds:
            if not (math.isfinite(lo) and math.isfinite(hi) and lo < hi):
                raise ValueError("each bound must be finite and lower < upper")
            clean_bounds.append((float(lo), float(hi)))

        rng = random.Random(self.seed)
        dim = len(clean_bounds)
        population = [[rng.uniform(-1.0, 1.0) for _ in range(dim)]
                      for _ in range(self.population_size)]

        def decode(z: Sequence[float]) -> tuple[float, ...]:
            return tuple(lo + (v + 1.0) * 0.5 * (hi - lo)
                         for v, (lo, hi) in zip(z, clean_bounds))

        def evaluate(z: Sequence[float]) -> float:
            value = float(objective(decode(z)))
            if not math.isfinite(value):
                raise ValueError("objective must return a finite number")
            return value

        fitness = [evaluate(agent) for agent in population]
        evaluations = len(population)
        best_idx = max(range(self.population_size), key=fitness.__getitem__)
        best_z = population[best_idx][:]
        best_fitness = fitness[best_idx]
        history = [best_fitness]
        generations = 0

        while evaluations < max_evaluations:
            ranked = sorted(range(self.population_size),
                            key=lambda i: (-fitness[i], i))
            ranks = [0] * self.population_size
            for rank, idx in enumerate(ranked):
                ranks[idx] = rank

            snapshot = [agent[:] for agent in population]
            snapshot_fitness = fitness[:]
            candidate_count = min(self.population_size,
                                  max_evaluations - evaluations)
            candidates: list[list[float]] = []

            for i in range(candidate_count):
                intensify = (ranks[i] / self.population_size) < self.dp
                if rng.random() < self.pc:
                    intensify = not intensify
                candidate = snapshot[i][:]

                if intensify:
                    j = rng.randrange(dim)
                    theta = rng.randrange(4)
                    if theta == 0:
                        delta = rng.uniform(-0.3, 0.3)
                    elif theta == 1:
                        delta = rng.uniform(-0.1, 0.1)
                    elif theta == 2:
                        delta = rng.uniform(-1.0, 1.0)
                    else:
                        delta = rng.uniform(-0.05, 0.05)
                    candidate[j] = min(1.0, max(-1.0, candidate[j] + delta))
                else:
                    count = dim // 2
                    if count:
                        for j in rng.sample(range(dim), count):
                            candidate[j] = rng.uniform(-1.0, 1.0)
                candidates.append(candidate)

            for i, candidate in enumerate(candidates):
                candidate_fitness = evaluate(candidate)
                evaluations += 1
                if candidate_fitness >= snapshot_fitness[i]:
                    population[i] = candidate
                    fitness[i] = candidate_fitness
                else:
                    population[i] = snapshot[i]
                    fitness[i] = snapshot_fitness[i]
                if fitness[i] > best_fitness:
                    best_fitness = fitness[i]
                    best_z = population[i][:]
            generations += 1
            history.append(best_fitness)

        return ACAResult(
            best_position=decode(best_z),
            best_fitness=best_fitness,
            evaluations=evaluations,
            generations=generations,
            best_history=tuple(history),
        )
