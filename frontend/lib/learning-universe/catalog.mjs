export const READINESS = Object.freeze({
  planned: Object.freeze({
    label: "PLANNED · NOT IMPLEMENTED",
    shortLabel: "PLANNED",
  }),
  prototype: Object.freeze({
    label: "RESEARCH PROTOTYPE · NOT RUNTIME-VERIFIED",
    shortLabel: "PROTOTYPE",
  }),
  partial: Object.freeze({
    label: "PARTIAL IMPLEMENTATION · NOT PRODUCTION-READY",
    shortLabel: "PARTIAL",
  }),
});

export const LEARNING_TRACKS = Object.freeze([
  {
    id: "supervised-learning",
    number: "01",
    name: "Supervised Learning",
    description: "Model training and validation concepts",
    readiness: "planned",
    evidenceSummary: "No canonical supervised-learning runtime is verified on main.",
  },
  {
    id: "unsupervised-learning",
    number: "02",
    name: "Unsupervised Learning",
    description: "Clustering and regime discovery",
    readiness: "planned",
    evidenceSummary: "No canonical clustering or regime-discovery runtime is verified on main.",
  },
  {
    id: "cnn-vision-models",
    number: "03",
    name: "CNN / Vision Models",
    description: "Visual pattern extraction",
    readiness: "planned",
    evidenceSummary: "No image dataset, vision model artifact, or inference runtime is verified.",
  },
  {
    id: "graph-neural-networks",
    number: "04",
    name: "Graph Neural Networks",
    description: "Relationships between assets and signals",
    readiness: "planned",
    evidenceSummary: "No canonical graph dataset or GNN training/inference runtime is verified.",
  },
  {
    id: "sequence-models",
    number: "05",
    name: "Sequence Models",
    description: "Temporal pattern research",
    readiness: "planned",
    evidenceSummary: "No production-ready sequence-model pipeline is verified.",
  },
  {
    id: "reinforcement-learning",
    number: "06",
    name: "Reinforcement Learning",
    description: "Simulation-only policy research",
    readiness: "planned",
    evidenceSummary: "No approved offline/shadow RL experiment pipeline is verified.",
  },
  {
    id: "diffusion-models",
    number: "07",
    name: "Diffusion Models",
    description: "Synthetic data research with validation",
    readiness: "planned",
    evidenceSummary: "No validated synthetic-data generation pipeline is verified.",
  },
  {
    id: "neuro-symbolic-ai",
    number: "08",
    name: "Neuro-Symbolic AI",
    description: "Rules, constraints and model reasoning",
    readiness: "planned",
    evidenceSummary: "No integrated neuro-symbolic training or evaluation runtime is verified.",
  },
  {
    id: "market-microstructure",
    number: "09",
    name: "Market Microstructure",
    description: "Liquidity and execution-cost research",
    readiness: "planned",
    evidenceSummary: "No tick/order-book microstructure dataset and evaluator are verified.",
  },
  {
    id: "technical-pattern-lab",
    number: "10",
    name: "Technical Pattern Lab",
    description: "Pattern hypotheses and evidence",
    readiness: "prototype",
    evidenceSummary: "SMC structure and pattern research exists; detections remain heuristics requiring independent validation.",
    evidencePath: "workers/feature/smc_wave/",
  },
  {
    id: "sentiment-research",
    number: "11",
    name: "Sentiment Research",
    description: "News and text signal evaluation",
    readiness: "planned",
    evidenceSummary: "No validated sentiment labels, point-in-time corpus, or signal evaluator is verified.",
  },
  {
    id: "feature-engineering",
    number: "12",
    name: "Feature Engineering",
    description: "Data quality and signal construction",
    readiness: "prototype",
    evidenceSummary: "Feature research prototypes exist, but there is no approved canonical point-in-time feature registry.",
    evidencePath: "workers/feature/",
  },
  {
    id: "risk-intelligence",
    number: "13",
    name: "Risk Intelligence",
    description: "Exposure and drawdown controls",
    readiness: "partial",
    evidenceSummary: "A fail-closed paper-risk policy exists; it is not a complete autonomous portfolio-risk model.",
    evidencePath: "workers/risk/",
  },
  {
    id: "backtest-validation",
    number: "14",
    name: "Backtest Validation",
    description: "Out-of-sample and walk-forward tests",
    readiness: "partial",
    evidenceSummary: "A deterministic OHLCV EMA simulator exists; full strategy, cost and walk-forward validation remains separate work.",
    evidencePath: "workers/backtest/",
  },
  {
    id: "drift-monitoring",
    number: "15",
    name: "Drift Monitoring",
    description: "Model and data drift monitoring",
    readiness: "planned",
    evidenceSummary: "No monitored model/data-drift runtime with alert and review evidence is verified.",
  },
  {
    id: "auto-learning-loop",
    number: "16",
    name: "Auto-Learning Loop",
    description: "Human-reviewed feedback and retraining gates",
    readiness: "prototype",
    evidenceSummary: "A fail-closed lifecycle contract is provided; no scheduler, persistence, trainer, or automatic promotion is enabled.",
    evidencePath: "workers/learning_universe/lifecycle.py",
  },
].map((track) => Object.freeze(track)));

export function getReadinessLabel(readiness) {
  return READINESS[readiness]?.label ?? "NOT VERIFIED";
}

export function getReadinessCounts(tracks = LEARNING_TRACKS) {
  return tracks.reduce(
    (counts, track) => {
      counts[track.readiness] = (counts[track.readiness] ?? 0) + 1;
      return counts;
    },
    { planned: 0, prototype: 0, partial: 0 },
  );
}
