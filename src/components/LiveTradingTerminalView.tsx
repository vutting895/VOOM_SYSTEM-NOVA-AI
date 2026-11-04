import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Atom,
  CheckCircle2,
  Play,
  RefreshCw,
  ShieldCheck,
  Sliders,
  TrendingUp,
  XCircle,
  Zap,
} from 'lucide-react';
export interface MarketPair {
  symbol: string;
  name: string;
  category: 'Forex & Metals' | 'Layer 1' | 'Exchange' | 'Macro';
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volume24h: string;
  rsi14: number;
  atrPct: number;
  fundingRate: string;
  regime: string;
  series: {
    '15m': number[];
    '1h': number[];
    '4h': number[];
    '1d': number[];
  };
}

const MARKET_PAIRS: MarketPair[] = [
  {
    symbol: 'XAU/USDm',
    name: 'Gold Spot (Exness)',
    category: 'Forex & Metals',
    price: 2748.6,
    change24h: 1.42,
    high24h: 2758.0,
    low24h: 2719.5,
    volume24h: '$4.82B',
    rsi14: 61.4,
    atrPct: 1.12,
    fundingRate: 'Spread 12 pts',
    regime: 'Bullish OB + FVG',
    series: {
      '15m': [2735, 2738, 2736, 2741, 2744, 2742, 2746, 2748.6],
      '1h': [2722, 2728, 2731, 2729, 2736, 2742, 2745, 2748.6],
      '4h': [2695, 2705, 2714, 2720, 2730, 2739, 2744, 2748.6],
      '1d': [2640, 2665, 2680, 2702, 2718, 2732, 2741, 2748.6],
    },
  },
  {
    symbol: 'EUR/USDm',
    name: 'Euro / US Dollar',
    category: 'Forex & Metals',
    price: 1.0842,
    change24h: 0.38,
    high24h: 1.0868,
    low24h: 1.0805,
    volume24h: '$3.15B',
    rsi14: 54.2,
    atrPct: 0.58,
    fundingRate: 'Spread 6 pts',
    regime: 'London Killzone',
    series: {
      '15m': [1.0818, 1.0822, 1.082, 1.0828, 1.0834, 1.0831, 1.0838, 1.0842],
      '1h': [1.0805, 1.0812, 1.0818, 1.0824, 1.0829, 1.0835, 1.0839, 1.0842],
      '4h': [1.0785, 1.0792, 1.0804, 1.0812, 1.082, 1.083, 1.0836, 1.0842],
      '1d': [1.075, 1.0768, 1.0782, 1.0795, 1.081, 1.0824, 1.0833, 1.0842],
    },
  },
  {
    symbol: 'BTC/USDT',
    name: 'Bitcoin Perpetual',
    category: 'Layer 1',
    price: 62931.55,
    change24h: 0.75,
    high24h: 63650.0,
    low24h: 62120.0,
    volume24h: '$18.4B',
    rsi14: 58.6,
    atrPct: 2.15,
    fundingRate: '+0.0100%',
    regime: '4H OB Rejection',
    series: {
      '15m': [62410, 62520, 62480, 62650, 62780, 62710, 62850, 62931.55],
      '1h': [62150, 62300, 62420, 62590, 62680, 62790, 62880, 62931.55],
      '4h': [61400, 61750, 62050, 62280, 62490, 62650, 62810, 62931.55],
      '1d': [59800, 60400, 61100, 61650, 62100, 62450, 62720, 62931.55],
    },
  },
  {
    symbol: 'ETH/USDT',
    name: 'Ethereum Perpetual',
    category: 'Layer 1',
    price: 3098.51,
    change24h: 5.5,
    high24h: 3145.0,
    low24h: 2935.0,
    volume24h: '$9.6B',
    rsi14: 63.8,
    atrPct: 2.64,
    fundingRate: '+0.0125%',
    regime: 'Momentum Breakout',
    series: {
      '15m': [3045, 3058, 3052, 3068, 3079, 3074, 3089, 3098.51],
      '1h': [2990, 3012, 3030, 3048, 3062, 3075, 3088, 3098.51],
      '4h': [2940, 2965, 2995, 3020, 3045, 3068, 3085, 3098.51],
      '1d': [2860, 2910, 2955, 2990, 3030, 3060, 3082, 3098.51],
    },
  },
];

const STRATEGY_TEMPLATES = [
  {
    id: 'smc-wave-v6',
    name: 'SMC WAVE v6.2 Mean Rejection',
    workers: ['4H Order Block', '5m FVG Displacement', 'Liquidity Sweep'],
  },
  {
    id: 'momentum-bos',
    name: '15m BOS + Momentum PA + OB',
    workers: ['15m CHoCH', 'Momentum PA', 'FVG 60% Fill'],
  },
];

interface LivePosition {
  id: string;
  symbol: string;
  broker: string;
  side: 'BUY' | 'SELL';
  lots: number;
  entryPrice: number;
  currentPrice: number;
  stopLoss: number;
  takeProfit: number;
  strategy: string;
  openedAt: string;
}

export default function LiveTradingTerminalView() {
  const [selectedSymbol, setSelectedSymbol] = useState<string>('XAU/USDm');
  const [timeframe, setTimeframe] = useState<'15m' | '1h' | '4h' | '1d'>('15m');
  const [selectedStrategy, setSelectedStrategy] = useState<string>(STRATEGY_TEMPLATES[0].name);
  const [orderSide, setOrderSide] = useState<'BUY' | 'SELL'>('BUY');
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT_FVG'>('MARKET');
  const [lots, setLots] = useState<string>('0.35');
  const [slAtrMult, setSlAtrMult] = useState<string>('0.90');
  const [tpAtrMult, setTpAtrMult] = useState<string>('2.60');
  const [autoQuantumSizing, setAutoQuantumSizing] = useState<boolean>(true);
  const [liveTickOffset, setLiveTickOffset] = useState<Record<string, number>>({
    'XAU/USDm': 0,
    'EUR/USDm': 0,
    'BTC/USDT': 0,
    'SOL/USDT': 0,
    'ETH/USDT': 0,
    'US30m': 0,
  });

  const [positions, setPositions] = useState<LivePosition[]>([
    {
      id: 'POS-90412',
      symbol: 'XAU/USDm',
      broker: 'Exness Trader API (Ed25519)',
      side: 'BUY',
      lots: 0.5,
      entryPrice: 2742.8,
      currentPrice: 2749.4,
      stopLoss: 2724.5,
      takeProfit: 2788.0,
      strategy: 'Quantum VQC + VPIN Kalman ICT Silver Bullet',
      openedAt: '10:15:22 UTC',
    },
    {
      id: 'POS-90418',
      symbol: 'BTC/USDT',
      broker: 'Binance USDⓈ-M API',
      side: 'BUY',
      lots: 0.25,
      entryPrice: 88740.0,
      currentPrice: 89420.5,
      stopLoss: 87450.0,
      takeProfit: 92100.0,
      strategy: 'Quantum QAOA / VQE Constrained QUBO',
      openedAt: '11:02:45 UTC',
    },
    {
      id: 'POS-90425',
      symbol: 'EUR/USDm',
      broker: 'Exness Trader API (Ed25519)',
      side: 'SELL',
      lots: 1.2,
      entryPrice: 1.0882,
      currentPrice: 1.0864,
      stopLoss: 1.0915,
      takeProfit: 1.081,
      strategy: 'Ernest Chan Ornstein-Uhlenbeck + Kalman Z-Score',
      openedAt: '11:40:10 UTC',
    },
  ]);

  const [pendingApproval, setPendingApproval] = useState<{
    id: string;
    symbol: string;
    side: 'BUY' | 'SELL';
    lots: number;
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    strategy: string;
    riskScore: number;
    vpin: number;
  } | null>(null);

  const [executionLog, setExecutionLog] = useState<string[]>([
    '[12:01:04] Exness Platform REST v1 (Ed25519) Stream Connected · Latency 29ms',
    '[12:01:08] Internal Quant Engine (TFT + FinRL + PennyLane VQC) Scanning 7 Instruments',
    '[12:01:15] XAU/USDm VPIN Toxicity = 0.71 · Kalman Displacement +2.18σ (Bullish Expansion)',
  ]);

  // Simulate realistic live price ticks every 1.4 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setLiveTickOffset((prev) => {
        const next = { ...prev };
        MARKET_PAIRS.forEach((p) => {
          const step =
            p.symbol === 'EUR/USDm'
              ? (Math.random() - 0.48) * 0.0003
              : p.symbol === 'XAU/USDm'
              ? (Math.random() - 0.47) * 0.65
              : p.symbol === 'BTC/USDT'
              ? (Math.random() - 0.47) * 28
              : (Math.random() - 0.48) * 0.35;
          next[p.symbol] = Number(((prev[p.symbol] || 0) + step).toFixed(4));
        });
        return next;
      });
    }, 1400);
    return () => clearInterval(timer);
  }, []);

  const activePair: MarketPair = useMemo(() => {
    const found = MARKET_PAIRS.find((m) => m.symbol === selectedSymbol) || MARKET_PAIRS[0];
    const offset = liveTickOffset[found.symbol] || 0;
    return {
      ...found,
      price: Number((found.price + offset).toFixed(found.symbol.startsWith('EUR/') ? 4 : 2)),
    };
  }, [selectedSymbol, liveTickOffset]);

  // Update floating prices on open positions
  const livePositions = useMemo(() => {
    return positions.map((pos) => {
      const basePair = MARKET_PAIRS.find((m) => m.symbol === pos.symbol);
      const offset = liveTickOffset[pos.symbol] || 0;
      const livePrice = basePair
        ? Number((basePair.price + offset).toFixed(pos.symbol.startsWith('EUR/') ? 4 : 2))
        : pos.currentPrice;

      const diff = pos.side === 'BUY' ? livePrice - pos.entryPrice : pos.entryPrice - livePrice;
      const contractMultiplier =
        pos.symbol === 'XAU/USDm'
          ? 100
          : pos.symbol === 'EUR/USDm'
          ? 100000
          : pos.symbol === 'BTC/USDT'
          ? 1
          : 50;
      const pnlUsd = Number((diff * pos.lots * contractMultiplier).toFixed(2));
      const pnlPct = Number(((diff / pos.entryPrice) * 100 * 10).toFixed(2));

      return {
        ...pos,
        currentPrice: livePrice,
        pnlUsd,
        pnlPct,
      };
    });
  }, [positions, liveTickOffset]);

  const totalFloatingPnl = useMemo(
    () => livePositions.reduce((acc, p) => acc + p.pnlUsd, 0),
    [livePositions]
  );

  const baseBalance = 25000.0;
  const liveEquity = baseBalance + totalFloatingPnl;

  // Orderbook L2 Ladder around activePair.price
  const orderbook = useMemo(() => {
    const tick = activePair.symbol.startsWith('EUR/')
      ? 0.0002
      : activePair.symbol === 'XAU/USDm'
      ? 0.25
      : activePair.symbol === 'BTC/USDT'
      ? 4.5
      : 0.08;
    const decimals = activePair.symbol.startsWith('EUR/') ? 4 : 2;

    const asks = Array.from({ length: 5 }, (_, i) => {
      const price = (activePair.price + (5 - i) * tick).toFixed(decimals);
      const size = (1.4 + ((i * 7 + 3) % 5) * 0.85).toFixed(2);
      return { price, size, depthPct: Math.min(95, 25 + i * 16) };
    });

    const bids = Array.from({ length: 5 }, (_, i) => {
      const price = (activePair.price - (i + 1) * tick).toFixed(decimals);
      const size = (1.6 + ((i * 5 + 2) % 6) * 0.9).toFixed(2);
      return { price, size, depthPct: Math.min(95, 30 + (4 - i) * 15) };
    });

    return { asks, bids };
  }, [activePair]);

  const calculatedStopLoss = useMemo(() => {
    const slPct = Number(slAtrMult) || 0.9;
    const factor = orderSide === 'BUY' ? 1 - slPct / 100 : 1 + slPct / 100;
    return Number((activePair.price * factor).toFixed(activePair.symbol.startsWith('EUR/') ? 4 : 2));
  }, [activePair, orderSide, slAtrMult]);

  const calculatedTakeProfit = useMemo(() => {
    const tpPct = Number(tpAtrMult) || 2.6;
    const factor = orderSide === 'BUY' ? 1 + tpPct / 100 : 1 - tpPct / 100;
    return Number((activePair.price * factor).toFixed(activePair.symbol.startsWith('EUR/') ? 4 : 2));
  }, [activePair, orderSide, tpAtrMult]);

  function handleStageOrder(e: React.FormEvent) {
    e.preventDefault();
    const numLots = Math.max(0.01, Number(lots) || 0.35);
    const staged = {
      id: `APV-${Date.now().toString().slice(-5)}`,
      symbol: activePair.symbol,
      side: orderSide,
      lots: numLots,
      entryPrice: activePair.price,
      stopLoss: calculatedStopLoss,
      takeProfit: calculatedTakeProfit,
      strategy: selectedStrategy,
      riskScore: activePair.symbol === 'XAU/USDm' ? 32 : 38,
      vpin: activePair.symbol === 'XAU/USDm' ? 0.72 : 0.67,
    };
    setPendingApproval(staged);
    setExecutionLog((prev) => [
      `[${new Date().toISOString().slice(11, 19)}] Outer Brain (Cloud LLM) Staged <ApprovalCard #${staged.id} /> for ${staged.symbol} ${staged.side} ${staged.lots} Lots`,
      ...prev.slice(0, 8),
    ]);
  }

  function confirmApproval() {
    if (!pendingApproval) return;
    const newPos: LivePosition = {
      id: `POS-${Date.now().toString().slice(-5)}`,
      symbol: pendingApproval.symbol,
      broker: pendingApproval.symbol.endsWith('USDm')
        ? 'Exness Trader API (Ed25519)'
        : 'Binance USDⓈ-M API',
      side: pendingApproval.side,
      lots: pendingApproval.lots,
      entryPrice: pendingApproval.entryPrice,
      currentPrice: pendingApproval.entryPrice,
      stopLoss: pendingApproval.stopLoss,
      takeProfit: pendingApproval.takeProfit,
      strategy: pendingApproval.strategy,
      openedAt: `${new Date().toISOString().slice(11, 19)} UTC`,
    };
    setPositions((prev) => [newPos, ...prev]);
    setExecutionLog((prev) => [
      `[${new Date().toISOString().slice(11, 19)}] ✓ Order Executed via Hybrid Quant Engine: ${newPos.id} (${newPos.symbol} ${newPos.side} ${newPos.lots} Lots @ ${newPos.entryPrice})`,
      ...prev.slice(0, 8),
    ]);
    setPendingApproval(null);
  }

  function closePosition(id: string) {
    const target = livePositions.find((p) => p.id === id);
    setPositions((prev) => prev.filter((p) => p.id !== id));
    if (target) {
      setExecutionLog((prev) => [
        `[${new Date().toISOString().slice(11, 19)}] Closed Position ${target.id} (${target.symbol}) · Realized PnL: ${target.pnlUsd >= 0 ? '+' : ''}$${target.pnlUsd.toFixed(2)}`,
        ...prev.slice(0, 8),
      ]);
    }
  }

  // Interactive SVG Chart for the Live Terminal
  const series = useMemo(() => {
    const base = activePair.series[timeframe];
    const offset = liveTickOffset[activePair.symbol] || 0;
    return base.map((v, i) => (i === base.length - 1 ? Number((v + offset).toFixed(4)) : v));
  }, [activePair, timeframe, liveTickOffset]);

  const minVal = Math.min(...series);
  const maxVal = Math.max(...series);
  const range = Math.max(maxVal - minVal, 0.0001);
  const width = 720;
  const height = 240;
  const padX = 18;
  const padY = 22;

  const pts = series.map((val, idx) => {
    const x = padX + (idx / (series.length - 1)) * (width - padX * 2);
    const y = height - padY - ((val - minVal) / range) * (height - padY * 2);
    return { x, y, val };
  });

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

  return (
    <div className="space-y-5">
      {/* Top Account & Real-Time Portfolio Telemetry Bar */}
      <div className="p-4 rounded-xl bg-white dark:bg-[#0B111E] border border-slate-200 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-cyan-600 dark:text-cyan-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>LIVE TRADING & HYBRID EXECUTION TERMINAL · EXNESS ED25519 REST v1 & CRYPTO API</span>
          </div>
          <h1 className="mt-0.5 text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            หน้าเทรดและควบคุมพอร์ตใช้งานจริง (Live Execution Desk)
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-6 font-mono tabular-nums">
          <div>
            <div className="text-[11px] font-sans text-slate-400">Balance (USD)</div>
            <div className="text-sm font-bold text-slate-900 dark:text-white">
              ${baseBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-sans text-slate-400">Live Equity</div>
            <div className="text-sm font-bold text-cyan-600 dark:text-cyan-400">
              ${liveEquity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-sans text-slate-400">Floating PnL</div>
            <div
              className={`text-sm font-bold ${
                totalFloatingPnl >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {totalFloatingPnl >= 0 ? '+' : ''}${totalFloatingPnl.toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-sans text-slate-400">Active Positions</div>
            <div className="text-sm font-bold text-slate-900 dark:text-white">{livePositions.length} Open</div>
          </div>
        </div>
      </div>

      {/* Instrument Selector Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {MARKET_PAIRS.slice(0, 6).map((item) => {
          const offset = liveTickOffset[item.symbol] || 0;
          const liveP = Number((item.price + offset).toFixed(item.symbol.startsWith('EUR/') ? 4 : 2));
          const active = item.symbol === selectedSymbol;
          const up = item.change24h >= 0;
          return (
            <button
              key={item.symbol}
              type="button"
              onClick={() => setSelectedSymbol(item.symbol)}
              className={`text-left p-3 rounded-xl border transition-colors ${
                active
                  ? 'bg-cyan-500/10 border-cyan-500 text-slate-900 dark:text-white'
                  : 'bg-white dark:bg-[#0B111E] border-slate-200 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-900 dark:text-white">{item.symbol}</span>
                <span className={`font-mono text-[11px] ${up ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {up ? '+' : ''}
                  {item.change24h}%
                </span>
              </div>
              <div className="mt-1 font-mono tabular-nums text-sm font-bold text-slate-900 dark:text-white">
                {liveP.toLocaleString('en-US', {
                  minimumFractionDigits: item.symbol.startsWith('EUR/') ? 4 : 2,
                })}
              </div>
            </button>
          );
        })}
      </div>

      {/* Main 3-Zone Trading Workbench: Chart (Left 6) + L2 Orderbook (Center 2.5) + Hybrid Order Ticket (Right 3.5) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Zone 1: Live Price Chart + Triple-Barrier Overlay */}
        <div className="lg:col-span-6 p-4 rounded-xl bg-white dark:bg-[#0B111E] border border-slate-200 dark:border-slate-800/80 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-slate-900 dark:text-white">
                    {activePair.symbol}
                  </span>
                  <span className="text-xs font-mono text-cyan-600 dark:text-cyan-400">
                    {activePair.name}
                  </span>
                </div>
                <div className="mt-0.5 font-mono tabular-nums text-xs text-slate-500">
                  Live Bid/Ask: <strong className="text-slate-900 dark:text-white">{activePair.price}</strong> · Regime:{' '}
                  <span className="text-emerald-600 dark:text-emerald-400">{activePair.regime}</span> · VPIN: 0.71
                </div>
              </div>

              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-lg">
                {(['15m', '1h', '4h', '1d'] as const).map((tf) => (
                  <button
                    key={tf}
                    type="button"
                    onClick={() => setTimeframe(tf)}
                    className={`px-2.5 py-1 text-xs font-mono rounded-md ${
                      timeframe === tf
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-semibold'
                        : 'text-slate-500'
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>

            {/* SVG Chart with TP / Entry / SL Triple-Barrier Lines */}
            <div className="mt-3 relative">
              <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-56 overflow-visible">
                {/* Take Profit Barrier Line */}
                <line
                  x1={padX}
                  x2={width - padX}
                  y1={28}
                  y2={28}
                  stroke="#10b981"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
                <text x={padX + 4} y={22} fill="#10b981" fontSize="10" fontFamily="monospace">
                  Upper Barrier (TP): {calculatedTakeProfit} (+{tpAtrMult}%)
                </text>

                {/* Stop Loss Barrier Line */}
                <line
                  x1={padX}
                  x2={width - padX}
                  y1={height - 22}
                  y2={height - 22}
                  stroke="#f43f5e"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
                <text x={padX + 4} y={height - 8} fill="#f43f5e" fontSize="10" fontFamily="monospace">
                  Lower Barrier (SL): {calculatedStopLoss} (-{slAtrMult}%)
                </text>

                {/* Price Path */}
                <path
                  d={linePath}
                  fill="none"
                  stroke="#06b6d4"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Live Last Tick Pulse */}
                {pts.length > 0 && (
                  <circle
                    cx={pts[pts.length - 1].x}
                    cy={pts[pts.length - 1].y}
                    r="5"
                    fill="#06b6d4"
                  />
                )}
              </svg>
            </div>
          </div>

          {/* Inner Brain Telemetry Footer */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 grid grid-cols-3 gap-2 font-mono text-[11px]">
            <div>
              <span className="text-slate-400">PennyLane VQC: </span>
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">P(Bull)=74.2%</span>
            </div>
            <div>
              <span className="text-slate-400">Kalman Filter: </span>
              <span className="text-slate-900 dark:text-white">+2.18σ Impulse</span>
            </div>
            <div>
              <span className="text-slate-400">FracDiff(d=0.42): </span>
              <span className="text-cyan-600 dark:text-cyan-400">Stationary</span>
            </div>
          </div>
        </div>

        {/* Zone 2: Live L2 Orderbook Ladder */}
        <div className="lg:col-span-3 p-4 rounded-xl bg-white dark:bg-[#0B111E] border border-slate-200 dark:border-slate-800/80 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-200 dark:border-slate-800">
              <span className="text-xs font-bold text-slate-900 dark:text-white">
                Orderbook Depth (L2)
              </span>
              <span className="text-[11px] font-mono text-slate-400">{activePair.symbol}</span>
            </div>

            <div className="mt-2 flex justify-between text-[10px] font-mono text-slate-400 pb-1">
              <span>Price</span>
              <span>Size (Lots)</span>
            </div>

            {/* Asks (Sell side) */}
            <div className="space-y-1 font-mono tabular-nums text-xs">
              {orderbook.asks.map((ask, i) => (
                <div key={`ask-${i}`} className="relative flex items-center justify-between px-2 py-1 rounded">
                  <div
                    className="absolute right-0 top-0 bottom-0 bg-rose-500/10 rounded"
                    style={{ width: `${ask.depthPct}%` }}
                  />
                  <span className="relative text-rose-500 font-medium">{ask.price}</span>
                  <span className="relative text-slate-600 dark:text-slate-300">{ask.size}</span>
                </div>
              ))}
            </div>

            {/* Mid Spread */}
            <div className="my-2 py-1.5 px-2 rounded bg-slate-100 dark:bg-slate-900 flex items-center justify-between font-mono tabular-nums text-xs">
              <span className="font-bold text-slate-900 dark:text-white">{activePair.price}</span>
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400">Spread 0.6 pip</span>
            </div>

            {/* Bids (Buy side) */}
            <div className="space-y-1 font-mono tabular-nums text-xs">
              {orderbook.bids.map((bid, i) => (
                <div key={`bid-${i}`} className="relative flex items-center justify-between px-2 py-1 rounded">
                  <div
                    className="absolute right-0 top-0 bottom-0 bg-emerald-500/10 rounded"
                    style={{ width: `${bid.depthPct}%` }}
                  />
                  <span className="relative text-emerald-500 font-medium">{bid.price}</span>
                  <span className="relative text-slate-600 dark:text-slate-300">{bid.size}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-slate-200 dark:border-slate-800 text-[11px] font-mono text-slate-500 flex justify-between">
            <span>Imbalance: +64.8% Buy</span>
            <span className="text-emerald-600 dark:text-emerald-400">VPIN Safe</span>
          </div>
        </div>

        {/* Zone 3: Hybrid Execution Order Ticket (TFT + FinRL + Quantum QRL) */}
        <form
          onSubmit={handleStageOrder}
          className="lg:col-span-3 p-4 rounded-xl bg-white dark:bg-[#0B111E] border border-slate-200 dark:border-slate-800/80 flex flex-col justify-between space-y-3"
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-200 dark:border-slate-800">
              <span className="text-xs font-bold text-slate-900 dark:text-white">
                Hybrid Quant Order Ticket
              </span>
              <span className="text-[11px] font-mono text-cyan-600 dark:text-cyan-400">
                FinRL + QRL Sizer
              </span>
            </div>

            {/* Buy / Sell Toggle */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setOrderSide('BUY')}
                className={`py-2 rounded-lg text-xs font-bold transition-colors ${
                  orderSide === 'BUY'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400'
                }`}
              >
                BUY / LONG
              </button>
              <button
                type="button"
                onClick={() => setOrderSide('SELL')}
                className={`py-2 rounded-lg text-xs font-bold transition-colors ${
                  orderSide === 'SELL'
                    ? 'bg-rose-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400'
                }`}
              >
                SELL / SHORT
              </button>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Active Strategy Engine
              </label>
              <select
                value={selectedStrategy}
                onChange={(e) => setSelectedStrategy(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white"
              >
                {STRATEGY_TEMPLATES.map((tpl) => (
                  <option key={tpl.id} value={tpl.name}>
                    {tpl.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Order Type
                </label>
                <select
                  value={orderType}
                  onChange={(e) => setOrderType(e.target.value as 'MARKET' | 'LIMIT_FVG')}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white"
                >
                  <option value="MARKET">MARKET</option>
                  <option value="LIMIT_FVG">LIMIT (FVG)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Lot Size (FinRL Kelly)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={lots}
                  onChange={(e) => setLots(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Stop Loss (%)
                </label>
                <input
                  type="number"
                  step="0.05"
                  value={slAtrMult}
                  onChange={(e) => setSlAtrMult(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Take Profit (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={tpAtrMult}
                  onChange={(e) => setTpAtrMult(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={autoQuantumSizing}
                onChange={(e) => {
                  setAutoQuantumSizing(e.target.checked);
                  if (e.target.checked) setLots('0.35');
                }}
                className="rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
              />
              <span>ใช้ขนาด Lot อัตโนมัติจาก QRL Fractional Kelly (0.35x)</span>
            </label>
          </div>

          <button
            type="submit"
            className={`w-full py-2.5 rounded-lg text-xs font-bold text-white transition-colors ${
              orderSide === 'BUY'
                ? 'bg-emerald-600 hover:bg-emerald-500'
                : 'bg-rose-600 hover:bg-rose-500'
            }`}
          >
            {orderSide === 'BUY' ? 'ส่งคำสั่ง BUY' : 'ส่งคำสั่ง SELL'} {activePair.symbol} ({lots} Lots)
          </button>
        </form>
      </div>

      {/* Generative UI <ApprovalCard /> & <RiskGauge /> Popup when an order is staged */}
      {pendingApproval && (
        <div className="p-4 rounded-xl bg-cyan-950/30 border-2 border-cyan-500/60 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-mono font-bold text-cyan-400">
                GENERATIVE UI INTERCEPT · &lt;RiskGauge /&gt; + &lt;ApprovalCard #{pendingApproval.id} /&gt;
              </span>
            </div>
            <span className="text-xs font-mono text-emerald-400">
              Risk Score: {pendingApproval.riskScore}/100 (LOW_CONTROLLED) · VPIN: {pendingApproval.vpin}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 font-mono tabular-nums text-xs">
            <div>
              <div className="text-[10px] text-slate-400 font-sans">Instrument</div>
              <div className="font-bold text-white">
                {pendingApproval.symbol} ({pendingApproval.side})
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 font-sans">FinRL / QRL Lots</div>
              <div className="font-bold text-cyan-400">{pendingApproval.lots} Lots</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 font-sans">Entry Price</div>
              <div className="font-bold text-white">{pendingApproval.entryPrice}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 font-sans">Triple-Barrier TP</div>
              <div className="font-bold text-emerald-400">{pendingApproval.takeProfit}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 font-sans">Triple-Barrier SL</div>
              <div className="font-bold text-rose-400">{pendingApproval.stopLoss}</div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-cyan-500/30">
            <button
              type="button"
              onClick={() => setPendingApproval(null)}
              className="px-3.5 py-1.5 text-xs font-medium text-rose-300 bg-rose-500/20 hover:bg-rose-500/30 rounded-lg"
            >
              ยกเลิกคำสั่ง (Reject)
            </button>
            <button
              type="button"
              onClick={confirmApproval}
              className="px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg"
            >
              ยืนยันส่งออเดอร์เข้าพอร์ต (Approve & Execute)
            </button>
          </div>
        </div>
      )}

      {/* Active Positions Blotter & Real-Time Execution Log */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-8 p-4 rounded-xl bg-white dark:bg-[#0B111E] border border-slate-200 dark:border-slate-800/80">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              รายการออเดอร์ที่ถือครองอยู่จริง (Active Positions Blotter · {livePositions.length})
            </h2>
            <span className="text-xs font-mono text-slate-400">Real-Time Mark-to-Market</span>
          </div>

          <div className="overflow-x-auto mt-2">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400">
                  <th className="py-2 pr-3">Ticket · Symbol</th>
                  <th className="py-2 px-2">Side · Lots</th>
                  <th className="py-2 px-2 text-right">Entry → Live</th>
                  <th className="py-2 px-2 text-right">SL / TP</th>
                  <th className="py-2 px-2 text-right">Floating PnL</th>
                  <th className="py-2 pl-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/60 font-mono tabular-nums">
                {livePositions.map((pos) => {
                  const win = pos.pnlUsd >= 0;
                  return (
                    <tr key={pos.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40">
                      <td className="py-2.5 pr-3">
                        <div className="font-bold text-slate-900 dark:text-white">{pos.symbol}</div>
                        <div className="text-[10px] text-slate-400">
                          {pos.id} · {pos.broker}
                        </div>
                      </td>
                      <td className="py-2.5 px-2">
                        <span
                          className={`font-bold ${
                            pos.side === 'BUY'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {pos.side}
                        </span>{' '}
                        · {pos.lots}
                      </td>
                      <td className="py-2.5 px-2 text-right">
                        {pos.entryPrice} → <strong className="text-slate-900 dark:text-white">{pos.currentPrice}</strong>
                      </td>
                      <td className="py-2.5 px-2 text-right text-[11px]">
                        <span className="text-rose-500">{pos.stopLoss}</span> /{' '}
                        <span className="text-emerald-500">{pos.takeProfit}</span>
                      </td>
                      <td
                        className={`py-2.5 px-2 text-right font-bold ${
                          win ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {win ? '+' : ''}${pos.pnlUsd.toFixed(2)} ({win ? '+' : ''}
                        {pos.pnlPct}%)
                      </td>
                      <td className="py-2.5 pl-2 text-right">
                        <button
                          type="button"
                          onClick={() => closePosition(pos.id)}
                          className="px-2.5 py-1 text-[11px] font-sans font-semibold text-rose-600 dark:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 rounded-md transition-colors"
                        >
                          Close
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Real-Time Engine Telemetry Stream */}
        <div className="lg:col-span-4 p-4 rounded-xl bg-white dark:bg-[#0B111E] border border-slate-200 dark:border-slate-800/80 flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white pb-3 border-b border-slate-200 dark:border-slate-800">
              Hybrid Execution Audit Stream
            </h2>
            <div className="mt-3 space-y-2 font-mono text-[11px] text-slate-600 dark:text-slate-300">
              {executionLog.map((line, idx) => (
                <div
                  key={idx}
                  className="p-2 rounded-lg bg-slate-50 dark:bg-slate-900/70 border border-slate-200/60 dark:border-slate-800/80 leading-relaxed"
                >
                  {line}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-400">
            Outer Brain (Cloud LLM) + Inner Brain (TFT / FinRL / Quantum VQC) Active
          </div>
        </div>
      </div>
    </div>
  );
}
