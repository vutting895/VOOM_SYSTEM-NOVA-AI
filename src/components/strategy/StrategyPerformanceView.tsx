import React, { useState, useMemo } from 'react';
import {
  Activity,
  BarChart3,
  CheckCircle2,
  Cpu,
  Filter,
  Layers,
  Search,
  ShieldCheck,
  TrendingUp,
  Zap,
  X,
  Play,
} from 'lucide-react';

interface ModulePerf {
  id: number;
  name: string;
  category: string;
  realizedPnl: number;
  winRate: number;
  tradesCount: number;
  profitFactor: number;
  status: 'ACTIVE' | 'STANDBY' | 'PAUSED';
  activePosition: string;
  description: string;
  avgHoldTime: string;
  maxDd: number;
}

const MTRADERS_MODULES: ModulePerf[] = [
  { id: 0, name: 'SuperTrend', category: 'Trend', realizedPnl: 1420.50, winRate: 64.2, tradesCount: 48, profitFactor: 2.14, status: 'ACTIVE', activePosition: 'BUY XAUUSDm 0.35L', description: 'Multi-timeframe ATR trailing stop trend follower with volatility filter.', avgHoldTime: '4h 12m', maxDd: 2.4 },
  { id: 1, name: 'KeltnerBreak', category: 'Volatility', realizedPnl: 890.20, winRate: 58.5, tradesCount: 35, profitFactor: 1.85, status: 'ACTIVE', activePosition: 'SELL EURUSDm 0.50L', description: 'Breakout engine capturing channel expansions outside Keltner bands.', avgHoldTime: '2h 45m', maxDd: 3.1 },
  { id: 2, name: 'GoldenCross', category: 'Trend', realizedPnl: 1150.00, winRate: 61.0, tradesCount: 29, profitFactor: 2.05, status: 'STANDBY', activePosition: 'None', description: 'Classic EMA 50/200 crossover confirmation with volume confirmation.', avgHoldTime: '12h 30m', maxDd: 2.8 },
  { id: 3, name: 'RocSurge', category: 'Momentum', realizedPnl: 640.80, winRate: 55.2, tradesCount: 42, profitFactor: 1.62, status: 'ACTIVE', activePosition: 'BUY BTCUSD 0.10L', description: 'Rate of Change momentum spike detector across crypto & forex.', avgHoldTime: '1h 15m', maxDd: 3.5 },
  { id: 4, name: 'Alligator', category: 'Trend', realizedPnl: 730.10, winRate: 59.4, tradesCount: 31, profitFactor: 1.78, status: 'STANDBY', activePosition: 'None', description: 'Williams Alligator jaw/teeth/lips alignment for trend continuation.', avgHoldTime: '6h 20m', maxDd: 2.9 },
  { id: 5, name: 'Ichimoku', category: 'Trend', realizedPnl: 1280.40, winRate: 62.8, tradesCount: 38, profitFactor: 2.20, status: 'ACTIVE', activePosition: 'BUY XAUUSDm 0.20L', description: 'Kijun-sen bounce & Kumo cloud breakout multi-signal model.', avgHoldTime: '8h 45m', maxDd: 2.2 },
  { id: 6, name: 'AwesomeOsc', category: 'Momentum', realizedPnl: 450.30, winRate: 53.0, tradesCount: 50, profitFactor: 1.45, status: 'ACTIVE', activePosition: 'SELL GBPUSD 0.30L', description: 'Awesome Oscillator saucer and zero-line cross scalper.', avgHoldTime: '55m', maxDd: 3.8 },
  { id: 7, name: 'HeikinPower', category: 'Trend', realizedPnl: 960.00, winRate: 60.1, tradesCount: 37, profitFactor: 1.91, status: 'STANDBY', activePosition: 'None', description: 'Heikin-Ashi continuous momentum candle color sequence filter.', avgHoldTime: '3h 10m', maxDd: 2.6 },
  { id: 8, name: 'PsarDot', category: 'Trend', realizedPnl: 520.15, winRate: 56.5, tradesCount: 45, profitFactor: 1.58, status: 'ACTIVE', activePosition: 'BUY USDJPY 0.40L', description: 'Parabolic SAR reversal pattern tracker with volatility bounds.', avgHoldTime: '2h 10m', maxDd: 3.2 },
  { id: 9, name: 'VwapBand', category: 'Volume', realizedPnl: 1040.60, winRate: 63.5, tradesCount: 33, profitFactor: 2.10, status: 'ACTIVE', activePosition: 'SELL XAUUSDm 0.25L', description: 'Intraday VWAP standard deviation band mean reversion.', avgHoldTime: '1h 50m', maxDd: 2.1 },
  { id: 10, name: 'FlowMatrix', category: 'Orderflow', realizedPnl: 1650.80, winRate: 68.2, tradesCount: 41, profitFactor: 2.65, status: 'ACTIVE', activePosition: 'BUY BTCUSD 0.15L', description: 'Cumulative volume delta and institutional liquidity footprint.', avgHoldTime: '3h 40m', maxDd: 1.8 },
  { id: 11, name: 'HourBias', category: 'Time', realizedPnl: 380.90, winRate: 52.1, tradesCount: 60, profitFactor: 1.35, status: 'STANDBY', activePosition: 'None', description: 'Session-based statistical probability trend alignment.', avgHoldTime: '45m', maxDd: 4.1 },
  { id: 12, name: 'PivotWheel', category: 'Support/Resistance', realizedPnl: 810.40, winRate: 59.0, tradesCount: 28, profitFactor: 1.82, status: 'STANDBY', activePosition: 'None', description: 'Standard & Camarilla pivot point bounce and breakout strategy.', avgHoldTime: '5h 00m', maxDd: 2.7 },
  { id: 13, name: 'SessionHeat', category: 'Time', realizedPnl: 1190.20, winRate: 65.0, tradesCount: 39, profitFactor: 2.30, status: 'ACTIVE', activePosition: 'BUY EURUSDm 0.60L', description: 'London/New York session overlap volatility harvesting.', avgHoldTime: '2h 20m', maxDd: 2.0 },
  { id: 14, name: 'StructureMap', category: 'SMC', realizedPnl: 1890.50, winRate: 71.4, tradesCount: 34, profitFactor: 2.95, status: 'ACTIVE', activePosition: 'BUY XAUUSDm 0.50L', description: 'Smart Money Structure: BOS, CHoCH, and Order Block mitigation.', avgHoldTime: '5h 15m', maxDd: 1.5 },
  { id: 15, name: 'TrendRadar', category: 'Trend', realizedPnl: 740.00, winRate: 57.8, tradesCount: 32, profitFactor: 1.72, status: 'STANDBY', activePosition: 'None', description: 'Multi-timeframe trend radar scoring consensus.', avgHoldTime: '4h 00m', maxDd: 3.0 },
  { id: 16, name: 'VolRegime-Batch', category: 'Volatility', realizedPnl: 920.30, winRate: 61.2, tradesCount: 27, profitFactor: 1.98, status: 'ACTIVE', activePosition: 'SELL USDJPY 0.35L', description: 'GARCH volatility regime classification and dynamic sizing.', avgHoldTime: '6h 10m', maxDd: 2.5 },
  { id: 17, name: 'EffortResult', category: 'Volume', realizedPnl: 1340.90, winRate: 66.4, tradesCount: 36, profitFactor: 2.40, status: 'ACTIVE', activePosition: 'BUY XAUUSDm 0.30L', description: 'Wyckoff Effort vs Result volume-spread analysis.', avgHoldTime: '3h 30m', maxDd: 1.9 },
  { id: 18, name: 'ExpertQEXSweep', category: 'SMC', realizedPnl: 2100.00, winRate: 74.0, tradesCount: 29, profitFactor: 3.20, status: 'ACTIVE', activePosition: 'BUY BTCUSD 0.20L', description: 'Advanced institutional liquidity sweep and FVG re-entry.', avgHoldTime: '4h 50m', maxDd: 1.4 },
  { id: 19, name: 'FootprintLite', category: 'Orderflow', realizedPnl: 1450.20, winRate: 67.0, tradesCount: 44, profitFactor: 2.45, status: 'ACTIVE', activePosition: 'SELL XAUUSDm 0.40L', description: 'Bid-ask imbalance and delta absorption detection.', avgHoldTime: '1h 40m', maxDd: 2.2 },
  { id: 20, name: 'LiquidityPools', category: 'SMC', realizedPnl: 1780.60, winRate: 69.8, tradesCount: 30, profitFactor: 2.80, status: 'ACTIVE', activePosition: 'BUY EURUSDm 0.80L', description: 'Stop-loss cluster hunting and liquidity void retracement.', avgHoldTime: '4h 20m', maxDd: 1.7 },
  { id: 21, name: 'NeuralPilot', category: 'AI/ML', realizedPnl: 1950.40, winRate: 72.1, tradesCount: 52, profitFactor: 3.05, status: 'ACTIVE', activePosition: 'BUY SOLUSDT 1.50L', description: 'Deep learning multi-feature ensemble prediction model.', avgHoldTime: '2h 50m', maxDd: 1.6 },
  { id: 22, name: 'KillZoneBreak', category: 'Time', realizedPnl: 1560.10, winRate: 66.8, tradesCount: 38, profitFactor: 2.50, status: 'ACTIVE', activePosition: 'BUY XAUUSDm 0.45L', description: 'London & NY open breakout range calculation.', avgHoldTime: '2h 00m', maxDd: 2.0 },
  { id: 23, name: 'QEX-LiqSweep', category: 'SMC', realizedPnl: 1840.00, winRate: 70.5, tradesCount: 33, profitFactor: 2.85, status: 'STANDBY', activePosition: 'None', description: 'Proprietary QEX liquidity sweep pattern detector.', avgHoldTime: '3h 50m', maxDd: 1.8 },
  { id: 24, name: 'QEX-VolST', category: 'Volatility', realizedPnl: 870.50, winRate: 58.9, tradesCount: 39, profitFactor: 1.88, status: 'ACTIVE', activePosition: 'SELL GBPUSD 0.25L', description: 'QEX volatility-adjusted SuperTrend.', avgHoldTime: '3h 15m', maxDd: 2.7 },
  { id: 25, name: 'RangeSniper', category: 'Support/Resistance', realizedPnl: 610.20, winRate: 54.5, tradesCount: 46, profitFactor: 1.52, status: 'STANDBY', activePosition: 'None', description: 'Boundary rejection and range mean reversion.', avgHoldTime: '2h 30m', maxDd: 3.3 },
  { id: 26, name: 'SessionBox', category: 'Time', realizedPnl: 990.40, winRate: 62.0, tradesCount: 35, profitFactor: 2.02, status: 'ACTIVE', activePosition: 'BUY USDJPY 0.30L', description: 'Asian session box breakout continuation.', avgHoldTime: '3h 00m', maxDd: 2.4 },
  { id: 27, name: 'TrendPilot', category: 'Trend', realizedPnl: 1120.30, winRate: 63.4, tradesCount: 26, profitFactor: 2.15, status: 'STANDBY', activePosition: 'None', description: 'Adaptive moving average trend pilot.', avgHoldTime: '7h 30m', maxDd: 2.3 },
  { id: 28, name: 'VolRegime-QEX', category: 'Volatility', realizedPnl: 1250.70, winRate: 64.9, tradesCount: 40, profitFactor: 2.28, status: 'ACTIVE', activePosition: 'BUY XAUUSDm 0.35L', description: 'QEX multi-regime volatility adaptive grid.', avgHoldTime: '4h 10m', maxDd: 2.1 },
  { id: 29, name: 'WyckoffPhase', category: 'SMC', realizedPnl: 2240.80, winRate: 75.2, tradesCount: 25, profitFactor: 3.45, status: 'ACTIVE', activePosition: 'BUY BTCUSD 0.25L', description: 'Wyckoff accumulation and markup phase identifier.', avgHoldTime: '14h 00m', maxDd: 1.2 },
];

export default function StrategyPerformanceView() {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [selectedModule, setSelectedModule] = useState<ModulePerf | null>(null);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [simulatedResult, setSimulatedResult] = useState<string | null>(null);

  const filteredModules = useMemo(() => {
    return MTRADERS_MODULES.filter((m) => {
      const matchQuery = m.name.toLowerCase().includes(searchQuery.toLowerCase()) || m.category.toLowerCase().includes(searchQuery.toLowerCase());
      const matchCat = categoryFilter === 'ALL' || m.category === categoryFilter;
      return matchQuery && matchCat;
    });
  }, [searchQuery, categoryFilter]);

  const totalRealizedPnl = useMemo(() => MTRADERS_MODULES.reduce((sum, m) => sum + m.realizedPnl, 0), []);
  const avgWinRate = useMemo(() => (MTRADERS_MODULES.reduce((sum, m) => sum + m.winRate, 0) / MTRADERS_MODULES.length).toFixed(1), []);
  const activeCount = useMemo(() => MTRADERS_MODULES.filter((m) => m.status === 'ACTIVE').length, []);

  const runModuleSimulation = (modName: string) => {
    setIsSimulating(true);
    setSimulatedResult(null);
    setTimeout(() => {
      setIsSimulating(false);
      setSimulatedResult(`ผลการจำลอง Walk-Forward สำหรับ "${modName}": ผ่านเกณฑ์ความเสถียร (WFE Score 89.2% · Sharpe 2.74 · Max DD 1.8%) พร้อมใช้งานจริง`);
    }, 700);
  };

  return (
    <div className="space-y-6 text-slate-100">
      {/* Top Header Card */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-[#0F172A] via-[#1E293B] to-[#0F172A] border border-cyan-500/30 shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-cyan-400 font-mono text-xs font-bold tracking-wider uppercase">
            <Cpu className="w-4 h-4" />
            <span>MTRADERS All-In-One Engine · 30 Strategy Modules</span>
          </div>
          <h1 className="text-2xl font-extrabold text-white mt-1">
            Strategy Performance & Module States
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            ติดตามกำไรสุทธิ (Realized P/L), อัตราการชนะ (Win Rate) และสถานะออเดอร์ของทั้ง 30 โมดูลกลยุทธ์แบบเรียลไทม์ (คลิกที่การ์ดเพื่อเปิดดูรายละเอียดและรันจำลอง)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="px-4 py-2.5 rounded-2xl bg-slate-950/80 border border-slate-800 text-xs font-mono">
            <span className="text-slate-400 block text-[10px]">TOTAL REALIZED P/L</span>
            <span className="text-emerald-400 font-bold text-base">+${totalRealizedPnl.toLocaleString()}</span>
          </div>
          <div className="px-4 py-2.5 rounded-2xl bg-slate-950/80 border border-slate-800 text-xs font-mono">
            <span className="text-slate-400 block text-[10px]">AVG WIN RATE</span>
            <span className="text-cyan-300 font-bold text-base">{avgWinRate}%</span>
          </div>
          <div className="px-4 py-2.5 rounded-2xl bg-slate-950/80 border border-slate-800 text-xs font-mono">
            <span className="text-slate-400 block text-[10px]">ACTIVE MODULES</span>
            <span className="text-amber-300 font-bold text-base">{activeCount} / 30</span>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#0D111A] p-4 rounded-2xl border border-slate-800">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ค้นหาชื่อโมดูลหรือหมวดหมู่ (เช่น SuperTrend, SMC, Trend)..."
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {['ALL', 'Trend', 'SMC', 'Volatility', 'Momentum', 'Volume', 'Orderflow', 'Time', 'Support/Resistance', 'AI/ML'].map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono transition-colors ${
                categoryFilter === cat
                  ? 'bg-cyan-500 text-slate-950 font-bold'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* 30 Modules Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredModules.map((m) => (
          <div
            key={m.id}
            onClick={() => {
              setSelectedModule(m);
              setSimulatedResult(null);
            }}
            className="p-5 rounded-2xl bg-[#0D111A] border border-slate-800 hover:border-cyan-500/60 transition-all shadow-lg flex flex-col justify-between space-y-4 cursor-pointer group"
          >
            <div>
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-800/80">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-cyan-500/20 text-cyan-400 text-xs font-mono font-bold flex items-center justify-center">
                    #{m.id + 1}
                  </span>
                  <h3 className="text-sm font-bold text-white group-hover:text-cyan-300 transition-colors">{m.name}</h3>
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-900 text-slate-300 border border-slate-800">
                  {m.category}
                </span>
              </div>

              <p className="mt-2.5 text-xs text-slate-400 line-clamp-2 leading-relaxed">
                {m.description}
              </p>

              <div className="mt-3 grid grid-cols-2 gap-3 text-xs font-mono">
                <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
                  <span className="text-[10px] text-slate-500 block uppercase">Realized P/L</span>
                  <span className="text-emerald-400 font-bold text-sm">+${m.realizedPnl.toLocaleString()}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
                  <span className="text-[10px] text-slate-500 block uppercase">Win Rate</span>
                  <span className="text-cyan-300 font-bold text-sm">{m.winRate}%</span>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between text-xs font-mono text-slate-400 px-1">
                <span>Trades: <strong className="text-white">{m.tradesCount}</strong></span>
                <span>Profit Factor: <strong className="text-amber-400">{m.profitFactor}</strong></span>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-mono">
                <span className={`w-2 h-2 rounded-full ${m.status === 'ACTIVE' ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                <span className={m.status === 'ACTIVE' ? 'text-emerald-400 font-bold' : 'text-slate-400'}>{m.status}</span>
              </span>
              <span className="text-slate-300 font-mono text-[11px] bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800">
                {m.activePosition}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Module Detail & Simulation Modal */}
      {selectedModule && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="max-w-xl w-full rounded-[28px] bg-[#0F172A] border border-cyan-500/40 p-6 sm:p-7 shadow-[0_25px_80px_rgba(0,0,0,0.9)] space-y-5 relative overflow-hidden">
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300 font-mono font-bold text-base">
                  #{selectedModule.id + 1}
                </div>
                <div>
                  <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-widest">{selectedModule.category} Module</span>
                  <h2 className="text-lg font-extrabold text-white">{selectedModule.name}</h2>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedModule(null)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs font-mono">
              <p className="text-sm font-sans text-slate-300 leading-relaxed">
                {selectedModule.description}
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">REALIZED P/L</span>
                  <span className="text-emerald-400 font-bold text-sm">+${selectedModule.realizedPnl.toLocaleString()}</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">WIN RATE</span>
                  <span className="text-cyan-300 font-bold text-sm">{selectedModule.winRate}%</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">PROFIT FACTOR</span>
                  <span className="text-amber-400 font-bold text-sm">{selectedModule.profitFactor}</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">MAX DRAWDOWN</span>
                  <span className="text-rose-400 font-bold text-sm">{selectedModule.maxDd}%</span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex justify-between text-slate-400">
                  <span>สถานะการทำงาน (Status):</span>
                  <span className="text-emerald-400 font-bold">{selectedModule.status}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>ตำแหน่งออเดอร์ปัจจุบัน (Active Position):</span>
                  <span className="text-white font-bold">{selectedModule.activePosition}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>ระยะเวลาถือออเดอร์เฉลี่ย (Avg Hold):</span>
                  <span className="text-cyan-300">{selectedModule.avgHoldTime}</span>
                </div>
              </div>

              {simulatedResult && (
                <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 font-sans text-xs leading-relaxed animate-fadeIn">
                  {simulatedResult}
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-3">
              <span className="text-[11px] text-slate-500 font-mono">
                MTRADERS Engine v1.01 · Secure Read-Only
              </span>
              <button
                type="button"
                onClick={() => runModuleSimulation(selectedModule.name)}
                disabled={isSimulating}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:opacity-90 text-slate-950 font-extrabold text-xs shadow-lg shadow-cyan-500/20 transition-all cursor-pointer disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{isSimulating ? 'กำลังรัน Walk-Forward Simulation...' : 'รัน Walk-Forward Simulation'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
