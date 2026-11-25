"""Synthetic optimizer benchmark; never represents market or trading performance."""
from __future__ import annotations
import argparse, json, math, statistics, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from workers.quant_engine.optimizers import optimize

def objectives(dim):
    def sphere(x): return -sum(v*v for v in x)
    def rastrigin(x): return -(10*len(x) + sum(v*v - 10*math.cos(2*math.pi*v) for v in x))
    def step(x): return -sum(round(v*2)**2 for v in x)
    return {"sphere": sphere, "rastrigin": rastrigin, "step_rounded": step}

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--evaluations",type=int,default=10000)
    parser.add_argument("--seeds",type=int,default=10)
    parser.add_argument("--dimensions",type=int,default=10)
    parser.add_argument("--population",type=int,default=10)
    args=parser.parse_args()
    if args.seeds<1 or args.dimensions<1: parser.error("seeds and dimensions must be positive")
    methods=("aca","pso","ga","random"); bounds=[(-5.12,5.12)]*args.dimensions
    report={"benchmark_type":"synthetic_optimizer_only_not_market_backtest",
      "evaluation_budget_per_method_seed_objective":args.evaluations,"seeds":list(range(args.seeds)),
      "dimensions":args.dimensions,"population_size":args.population,"results":{}}
    for name, objective in objectives(args.dimensions).items():
        report["results"][name]={}
        for method in methods:
            scores=[]; calls=0
            for seed in range(args.seeds):
                result=optimize(method,objective,bounds,evaluation_budget=args.evaluations,
                                seed=seed,population_size=args.population)
                scores.append(result.best_fitness); calls+=result.evaluations
            report["results"][name][method]={"mean_best_fitness":statistics.fmean(scores),
              "median_best_fitness":statistics.median(scores),"stdev_best_fitness":statistics.pstdev(scores),
              "total_objective_calls":calls,"calls_per_seed":args.evaluations}
    print(json.dumps(report,indent=2,sort_keys=True))
if __name__=="__main__": main()
