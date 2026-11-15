import React from 'react';
import ReadonlySafetyBadge from '../common/ReadonlySafetyBadge';

const MODULES = [
  "SuperTrend", "KeltnerBreak", "GoldenCross", "RocSurge", "Alligator",
  "Ichimoku", "AwesomeOsc", "HeikinPower", "PsarDot", "VwapBand",
  "FlowMatrix", "HourBias", "PivotWheel", "SessionHeat", "StructureMap",
  "TrendRadar", "VolRegime-Batch", "EffortResult", "ExpertQEXSweep", "FootprintLite",
  "LiquidityPools", "NeuralPilot", "KillZoneBreak", "QEX-LiqSweep", "QEX-VolST",
  "RangeSniper", "SessionBox", "TrendPilot", "VolRegime-QEX", "WyckoffPhase",
];

export default function NovaNeuralStudioView() {
  return (
    <div className="min-h-screen bg-[#07070e] p-6 text-slate-100 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <ReadonlySafetyBadge />
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-sm text-amber-100">
          <strong>LOCAL MOCK SIMULATION — BACKEND NOT CONFIGURED.</strong>
          <p className="mt-1">No quantum backend, model inference runtime, broker session, live market feed, or real-time telemetry is connected. No prediction, expected return, Sharpe ratio, drawdown, or win-probability result is available. This page is a catalogue only and cannot affect trading.</p>
        </div>
        <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
          <div className="flex flex-col gap-2 border-b border-slate-800 pb-4">
            <h1 className="text-xl font-bold text-white">NOVA Neural & MTRADERS Strategy Catalogue</h1>
            <p className="text-xs text-slate-400">Thirty strategy names are listed for architecture reference. Runtime and performance status remain unverified.</p>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {MODULES.map((name, index) => (
              <div key={name} className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                <span className="text-[10px] font-mono text-indigo-300">MODULE #{index + 1}</span>
                <h2 className="mt-1 text-xs font-semibold text-white">{name}</h2>
                <p className="mt-2 text-[10px] font-mono text-amber-300">NOT CONNECTED</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
