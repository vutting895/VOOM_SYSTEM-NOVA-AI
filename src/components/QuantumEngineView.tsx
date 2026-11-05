import React, { useEffect, useState } from 'react';
import { Check, Copy, Cpu, Download, Play, RefreshCw, Sliders, Terminal } from 'lucide-react';
const MARKET_PAIRS = [
  { symbol: 'XAU/USDm', name: 'Gold vs US Dollar (Exness)', category: 'Forex & Metals', atrPct: 1.12 },
  { symbol: 'EUR/USDm', name: 'Euro vs US Dollar (Exness)', category: 'Forex & Metals', atrPct: 0.58 },
  { symbol: 'GBP/USDm', name: 'British Pound vs US Dollar', category: 'Forex & Metals', atrPct: 0.65 },
  { symbol: 'BTC/USDT', name: 'Bitcoin Perpetual', category: 'Layer 1', atrPct: 2.35 },
  { symbol: 'ETH/USDT', name: 'Ethereum Perpetual', category: 'Layer 1', atrPct: 2.75 },
  { symbol: 'SOL/USDT', name: 'Solana Perpetual', category: 'Layer 1', atrPct: 3.85 },
];

interface QuantumSimulationResponse {
  vqc: {
    backend: string;
    nQubits: number;
    nLayers: number;
    encodingAnglesRad: number[];
    pauliZExpectations: number[];
    entanglementEntropy: number;
    regimeClassification: string;
    directionalProbabilityUp: number;
  };
  qubo: {
    solver: string;
    qaoaLayersP: number;
    groundStateEnergy: number;
    optimalBitstring: string;
    allocations: Record<string, number>;
    expectedPortfolioReturnPct: number;
    portfolioVolatilityPct: number;
    quantumSharpeRatio: number;
  };
  qrl: {
    instrument: string;
    recommendedLotFraction: number;
    riskGatePassed: boolean;
    qnnExpectationVector: number[];
    stopLossAtrMultiplier: number;
    executionMode: string;
  };
}

export default function QuantumEngineView() {
  const [activeTab, setActiveTab] = useState<'workbench' | 'code'>('workbench');
  const [instrument, setInstrument] = useState('XAU/USDm');
  const [backendDevice, setBackendDevice] = useState('pennylane:default.qubit');
  const [nQubits, setNQubits] = useState(4);
  const [nLayers, setNLayers] = useState(3);
  const [qaoaLayersP, setQaoaLayersP] = useState(3);
  const [riskAversion, setRiskAversion] = useState(0.55);
  const [signalConfidence, setSignalConfidence] = useState(0.78);
  const [atrPct, setAtrPct] = useState(1.12);
  const [drawdownPct, setDrawdownPct] = useState(0.45);

  const [running, setRunning] = useState(false);
  const [simResult, setSimResult] = useState<QuantumSimulationResponse | null>(null);
  const [pythonSource, setPythonSource] = useState('');
  const [copied, setCopied] = useState(false);

  async function runQuantumSimulation() {
    setRunning(true);
    try {
      const res = await fetch('/api/quantum/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instrument,
          backendDevice,
          nQubits,
          nLayers,
          qaoaLayersP,
          riskAversion,
          signalConfidence,
          atrPct,
          drawdownPct,
        }),
      });
      const data = await res.json();
      setSimResult(data);
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => {
    void runQuantumSimulation();
    fetch('/api/quantum/source')
      .then((r) => r.json())
      .then((d) => {
        if (d?.code) setPythonSource(d.code);
      })
      .catch(() => {});
  }, []);

  function copyPythonCode() {
    if (!pythonSource) return;
    navigator.clipboard?.writeText(pythonSource);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function downloadPythonFile() {
    if (!pythonSource) return;
    const blob = new Blob([pythonSource], { type: 'text/x-python;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'quant_engine.py';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800/80">
        <div>
          <p className="text-xs font-medium text-cyan-600 dark:text-cyan-400">
            Hybrid Quantum-Classical Architecture · PennyLane & Qiskit Ready
          </p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Quantum Machine Learning Engine (quant_engine.py)
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 max-w-3xl">
            ยกระดับสมองกลประมวลผลด้วย 3 แกนหลัก: 1) Quantum Time-Series VQC/QLSTM (Angle Encoding RX, RY, CNOT), 2) Quantum Portfolio QAOA/VQE (QUBO Optimization), และ 3) Quantum Reinforcement Learning (QRL Policy Network)
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setActiveTab('workbench')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                activeTab === 'workbench'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Quantum Simulator Workbench
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('code')}
              className={`px-3 py-1.5 text-xs font-mono font-medium rounded-md transition-colors whitespace-nowrap ${
                activeTab === 'code'
                  ? 'bg-white dark:bg-slate-800 text-cyan-600 dark:text-cyan-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              backend/quant_engine.py
            </button>
          </div>
        </div>
      </div>

      {activeTab === 'code' ? (
        <div className="p-5 rounded-xl bg-white dark:bg-[#0B111E] border border-slate-200 dark:border-slate-800/80 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-200 dark:border-slate-800/80">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white font-mono">
                backend/quant_engine.py
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                รองรับ PennyLane Simulator (`default.qubit` / `lightning.qubit`) และพร้อมสลับไปยัง IBM Quantum หรือ Amazon Braket QPU
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={copyPythonCode}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'คัดลอกโค้ดแล้ว' : 'คัดลอกโค้ด Python'}
              </button>
              <button
                type="button"
                onClick={downloadPythonFile}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 rounded-lg transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                ดาวน์โหลด quant_engine.py
              </button>
            </div>
          </div>

          <pre className="p-4 rounded-xl bg-slate-950 text-slate-200 font-mono text-xs leading-relaxed overflow-x-auto max-h-[640px]">
            <code>{pythonSource || 'Loading backend/quant_engine.py...'}</code>
          </pre>
        </div>
      ) : (
        <>
          {/* Quantum Control Bar */}
          <div className="p-5 rounded-xl bg-white dark:bg-[#0B111E] border border-slate-200 dark:border-slate-800/80">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Target Instrument
                </label>
                <select
                  value={instrument}
                  onChange={(e) => setInstrument(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white"
                >
                  {MARKET_PAIRS.map((m) => (
                    <option key={m.symbol} value={m.symbol}>
                      {m.symbol} ({m.category})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Quantum Device / QPU Backend
                </label>
                <select
                  value={backendDevice}
                  onChange={(e) => setBackendDevice(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white"
                >
                  <option value="pennylane:default.qubit">pennylane:default.qubit (CPU/GPU Sim)</option>
                  <option value="pennylane:lightning.qubit">pennylane:lightning.qubit (C++ Adjoint)</option>
                  <option value="qiskit:ibm_brisbane">qiskit:ibm_brisbane (127-Qubit QPU)</option>
                  <option value="braket:sv1.simulator">braket:sv1.simulator (AWS Braket)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  VQC Layers / QAOA Depth (p)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={nLayers}
                    onChange={(e) => setNLayers(Number(e.target.value))}
                    className="w-full px-2.5 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white"
                  >
                    {[2, 3, 4, 6].map((l) => (
                      <option key={l} value={l}>
                        VQC L={l}
                      </option>
                    ))}
                  </select>
                  <select
                    value={qaoaLayersP}
                    onChange={(e) => setQaoaLayersP(Number(e.target.value))}
                    className="w-full px-2.5 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white"
                  >
                    {[1, 2, 3, 4, 5].map((p) => (
                      <option key={p} value={p}>
                        QAOA p={p}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  QUBO Risk Aversion (λ = {riskAversion.toFixed(2)})
                </label>
                <input
                  type="range"
                  min={0.15}
                  max={1.2}
                  step={0.05}
                  value={riskAversion}
                  onChange={(e) => setRiskAversion(Number(e.target.value))}
                  className="w-full accent-cyan-500"
                />
              </div>

              <button
                type="button"
                onClick={runQuantumSimulation}
                disabled={running}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 rounded-lg transition-colors h-[38px]"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${running ? 'animate-spin' : ''}`} />
                {running ? 'Executing Circuit...' : 'Execute Quantum Circuit'}
              </button>
            </div>
          </div>

          {simResult && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Pillar 1: Quantum Time-Series Forecasting (QLSTM / PQC / VQC) */}
              <div className="p-5 rounded-xl bg-white dark:bg-[#0B111E] border border-slate-200 dark:border-slate-800/80 flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800/80">
                    <div>
                      <span className="text-[11px] font-mono text-cyan-600 dark:text-cyan-400">
                        PILLAR 01 · PQC / VQC CIRCUIT
                      </span>
                      <h2 className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                        Quantum Time-Series Forecasting
                      </h2>
                    </div>
                    <span className="text-xs font-mono text-slate-500">
                      {simResult.vqc.nQubits} Qubits
                    </span>
                  </div>

                  <p className="mt-3 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    เข้ารหัสสถานะตลาด (Angle Encoding <span className="font-mono">RX, RY</span>) และคำนวณความพัวพันควอนตัม (<span className="font-mono">CNOT Ring</span>) เพื่อวัดค่าคาดหวัง <span className="font-mono">⟨Z_i⟩</span>
                  </p>

                  {/* Visual Quantum Circuit Diagram */}
                  <div className="mt-4 p-3 rounded-lg bg-slate-50 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800 font-mono text-[11px] space-y-2">
                    {simResult.vqc.pauliZExpectations.map((expVal, qIdx) => {
                      const angle = simResult.vqc.encodingAnglesRad[qIdx] ?? 0;
                      return (
                        <div key={qIdx} className="flex items-center justify-between gap-2">
                          <span className="text-slate-500 shrink-0">|q{qIdx}⟩ ─[RX({angle.toFixed(2)})]─[RY]─●─</span>
                          <span
                            className={`font-bold tabular-nums shrink-0 ${
                              expVal >= 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-amber-600 dark:text-amber-400'
                            }`}
                          >
                            ⟨Z_{qIdx}⟩ = {expVal >= 0 ? '+' : ''}{expVal.toFixed(4)}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-4 space-y-2 text-xs font-mono tabular-nums">
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-sans">Detected Quantum Regime</span>
                      <span className="font-bold text-cyan-600 dark:text-cyan-400 font-sans">
                        {simResult.vqc.regimeClassification}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-sans">Directional Prob P(Up)</span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {(simResult.vqc.directionalProbabilityUp * 100).toFixed(2)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-sans">Von Neumann Entropy S(ρ)</span>
                      <span className="text-slate-700 dark:text-slate-300">
                        {simResult.vqc.entanglementEntropy}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-200 dark:border-slate-800/80 text-[11px] font-mono text-slate-500 flex justify-between">
                  <span>Device: {simResult.vqc.backend}</span>
                  <span>Gates: RX · RY · CNOT</span>
                </div>
              </div>

              {/* Pillar 2: Quantum Portfolio & Risk Optimization (QAOA / VQE - QUBO) */}
              <div className="p-5 rounded-xl bg-white dark:bg-[#0B111E] border border-slate-200 dark:border-slate-800/80 flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800/80">
                    <div>
                      <span className="text-[11px] font-mono text-cyan-600 dark:text-cyan-400">
                        PILLAR 02 · QAOA / VQE SOLVER
                      </span>
                      <h2 className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                        QUBO Portfolio Optimization
                      </h2>
                    </div>
                    <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400">
                      |{simResult.qubo.optimalBitstring}⟩
                    </span>
                  </div>

                  <p className="mt-3 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    แก้สมการแฮมิลโทเนียน <span className="font-mono">H_QUBO(x) = -μᵀx + λxᵀΣx</span> เพื่อหาสัดส่วนพอร์ตที่ให้ค่าพลังงานสถานะพื้นต่ำสุด
                  </p>

                  <div className="mt-4 space-y-3">
                    {Object.entries(simResult.qubo.allocations).map(([asset, pct]) => (
                      <div key={asset} className="space-y-1">
                        <div className="flex justify-between text-xs font-mono tabular-nums">
                          <span className="font-semibold text-slate-800 dark:text-slate-200">{asset}</span>
                          <span className="text-cyan-600 dark:text-cyan-400 font-bold">{pct.toFixed(2)}%</span>
                        </div>
                        <div className="w-full h-2 bg-slate-100 dark:bg-slate-900 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-cyan-500 rounded-full transition-all duration-200"
                            style={{ width: `${Math.min(100, pct)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800/70 space-y-2 text-xs font-mono tabular-nums">
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-sans">Ground State Energy ⟨H⟩</span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {simResult.qubo.groundStateEnergy} Ha
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-sans">Expected Return / Vol</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                        +{simResult.qubo.expectedPortfolioReturnPct}% / {simResult.qubo.portfolioVolatilityPct}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-sans">Quantum Sharpe Ratio</span>
                      <span className="font-bold text-cyan-600 dark:text-cyan-400">
                        {simResult.qubo.quantumSharpeRatio}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-200 dark:border-slate-800/80 text-[11px] font-mono text-slate-500 flex justify-between">
                  <span>{simResult.qubo.solver}</span>
                  <span>Ising Z-Basis</span>
                </div>
              </div>

              {/* Pillar 3: Quantum Reinforcement Learning (QRL Policy Network) */}
              <div className="p-5 rounded-xl bg-white dark:bg-[#0B111E] border border-slate-200 dark:border-slate-800/80 flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800/80">
                    <div>
                      <span className="text-[11px] font-mono text-cyan-600 dark:text-cyan-400">
                        PILLAR 03 · QUANTUM POLICY NETWORK
                      </span>
                      <h2 className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                        QRL Lot Sizing & Risk Filter
                      </h2>
                    </div>
                    <span
                      className={`text-xs font-mono font-bold ${
                        simResult.qrl.riskGatePassed
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {simResult.qrl.riskGatePassed ? 'PERMITTED' : 'GATED / BLOCKED'}
                    </span>
                  </div>

                  <p className="mt-3 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    ใช้ Quantum Neural Network (QNN) แทน Policy Network เดิมเพื่อคำนวณสัดส่วน Lot Size และระยะ Stop-Loss ตามความผันผวนจริง
                  </p>

                  {/* Interactive State Sliders for QRL */}
                  <div className="mt-4 space-y-3">
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-500">Signal Confidence Input</span>
                        <span className="font-mono font-semibold">{(signalConfidence * 100).toFixed(0)}%</span>
                      </div>
                      <input
                        type="range"
                        min={0.4}
                        max={0.95}
                        step={0.02}
                        value={signalConfidence}
                        onChange={(e) => setSignalConfidence(Number(e.target.value))}
                        className="w-full accent-cyan-500"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-500">Current Portfolio Drawdown (%)</span>
                        <span className="font-mono font-semibold">{drawdownPct.toFixed(2)}%</span>
                      </div>
                      <input
                        type="range"
                        min={0.0}
                        max={4.5}
                        step={0.15}
                        value={drawdownPct}
                        onChange={(e) => setDrawdownPct(Number(e.target.value))}
                        className="w-full accent-cyan-500"
                      />
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800/70 space-y-2 text-xs font-mono tabular-nums">
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-sans">QNN Optimal Capital Fraction</span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {(simResult.qrl.recommendedLotFraction * 100).toFixed(2)}% of Equity
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-sans">Adaptive Stop-Loss Distance</span>
                      <span className="font-bold text-amber-600 dark:text-amber-400">
                        {simResult.qrl.stopLossAtrMultiplier} × ATR(14)
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-sans">QNN Expectation Vector</span>
                      <span className="text-slate-500">
                        [{simResult.qrl.qnnExpectationVector.join(', ')}]
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-200 dark:border-slate-800/80 text-[11px] font-mono text-slate-500 flex justify-between">
                  <span>Mode: {simResult.qrl.executionMode}</span>
                  <button
                    type="button"
                    onClick={() => setActiveTab('code')}
                    className="text-cyan-600 dark:text-cyan-400 hover:underline font-sans font-semibold"
                  >
                    View quant_engine.py →
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
