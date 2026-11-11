import React from 'react';
import ReadonlySafetyBadge from '../common/ReadonlySafetyBadge';

const MTRADERS_MODULES = [
  { id: 0, name: "SuperTrend", category: "Trend" },
  { id: 1, name: "KeltnerBreak", category: "Volatility" },
  { id: 2, name: "GoldenCross", category: "Trend" },
  { id: 3, name: "RocSurge", category: "Momentum" },
  { id: 4, name: "Alligator", category: "Trend" },
  { id: 5, name: "Ichimoku", category: "Trend" },
  { id: 6, name: "AwesomeOsc", category: "Momentum" },
  { id: 7, name: "HeikinPower", category: "Trend" },
  { id: 8, name: "PsarDot", category: "Trend" },
  { id: 9, name: "VwapBand", category: "Volume" },
  { id: 10, name: "FlowMatrix", category: "Orderflow" },
  { id: 11, name: "HourBias", category: "Time" },
  { id: 12, name: "PivotWheel", category: "Support/Resistance" },
  { id: 13, name: "SessionHeat", category: "Time" },
  { id: 14, name: "StructureMap", category: "SMC" },
  { id: 15, name: "TrendRadar", category: "Trend" },
  { id: 16, name: "VolRegime-Batch", category: "Volatility" },
  { id: 17, name: "EffortResult", category: "Volume" },
  { id: 18, name: "ExpertQEXSweep", category: "SMC" },
  { id: 19, name: "FootprintLite", category: "Orderflow" },
  { id: 20, name: "LiquidityPools", category: "SMC" },
  { id: 21, name: "NeuralPilot", category: "AI/ML" },
  { id: 22, name: "KillZoneBreak", category: "Time" },
  { id: 23, name: "QEX-LiqSweep", category: "SMC" },
  { id: 24, name: "QEX-VolST", category: "Volatility" },
  { id: 25, name: "RangeSniper", category: "Support/Resistance" },
  { id: 26, name: "SessionBox", category: "Time" },
  { id: 27, name: "TrendPilot", category: "Trend" },
  { id: 28, name: "VolRegime-QEX", category: "Volatility" },
  { id: 29, name: "WyckoffPhase", category: "SMC" },
];

export default function StrategyPerformanceView() {
  return (
    <div className="space-y-6 text-slate-100">
      <ReadonlySafetyBadge />
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-sm text-amber-100">
        <strong>STRATEGY CATALOGUE ONLY — NOT CONNECTED.</strong>
        <p className="mt-1">No verified broker session, trade ledger, strategy runtime, or evaluation artifacts are connected. P/L, win rate, profit factor, open positions, module status, and walk-forward results are intentionally not displayed.</p>
      </div>
      <section className="rounded-2xl border border-slate-800 bg-[#0D111A] p-5">
        <div className="flex flex-col gap-2 border-b border-slate-800 pb-4">
          <h2 className="text-lg font-bold text-white">MTRADERS 30 Strategy Catalogue</h2>
          <p className="text-xs text-slate-400">This is descriptive strategy metadata only. It does not indicate that any strategy is running or has verified performance.</p>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MTRADERS_MODULES.map((module) => (
            <div key={module.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-mono text-cyan-400">#{module.id + 1}</span>
                <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] text-slate-400">{module.category}</span>
              </div>
              <h3 className="mt-2 text-sm font-semibold text-white">{module.name}</h3>
              <p className="mt-2 text-[11px] font-mono text-amber-300">Status: NOT CONNECTED</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
