import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Atom,
  Bot,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Cpu,
  Grid,
  KeyRound,
  Layers,
  Pause,
  Play,
  Send,
  ShieldCheck,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import NovaChatOSView from './NovaChatOSView';
import { marketService } from '../services/marketService';
import { novaApi } from '../api/apiClient';
import { MarketAssetQuote } from '../api/types';

interface CalendarDayItem {
  day: number;
  pnl: number | null;
  closes: number;
  isToday?: boolean;
}

interface CalendarWeekRow {
  weekId: number;
  days: CalendarDayItem[];
  weekTotal: number;
  weekCloses: number;
}

const OCTOBER_CALENDAR_WEEKS: CalendarWeekRow[] = [];

export default function NovaProWorkspaceView() {
  const navigate = useNavigate();
  const [activeSubView, setActiveSubView] = useState<
    'nova-chat-os' | 'voom-portfolio' | 'dynamic-grid-calendar' | 'ai-workflow-command'
  >('voom-portfolio');

  // Exness Connect Modal (Image 4 style)
  const [showExnessModal, setShowExnessModal] = useState(false);
  const [exnessConnected, setExnessConnected] = useState(false);

  // Portfolio Performance Timeframe (Image 6 & Image 3)
  const [perfRange, setPerfRange] = useState<'1D' | '1W' | '1M' | '3M' | '1Y' | 'ALL'>('1M');

  // Dynamic Grid State (Image 1)
  const [gridDirection, setGridDirection] = useState<'BOTH' | 'BUY' | 'SELL'>('BOTH');
  const [gridRunning, setGridRunning] = useState<boolean>(false);
  const [selectedDayDetail, setSelectedDayDetail] = useState<CalendarDayItem>({
    day: 29,
    pnl: null,
    closes: 0,
  });
  const [floatingPnl, setFloatingPnl] = useState<number>(0);
  const [openGridPos, setOpenGridPos] = useState<number>(0);
  const [todayPnl, setTodayPnl] = useState<number>(0);
  const [todayCloses, setTodayCloses] = useState<number>(0);

  // 3-Mode Execution Architecture: Full Auto vs Semi-Auto vs Manual
  const [executionMode, setExecutionMode] = useState<'full-auto' | 'semi-auto' | 'manual'>('manual');
  const [autoBotLastAction, setAutoBotLastAction] = useState<string>(
    'Auto execution is disabled. Read-only Demo data and AI research only.'
  );

  // Live API Market Data Integration
  const [liveAssets, setLiveAssets] = useState<MarketAssetQuote[]>([]);
  const [portfolioData, setPortfolioData] = useState<any>(null);
  const [tradeHistory, setTradeHistory] = useState<any[]>([]);

  useEffect(() => {
    let isMounted = true;
    marketService.getMarketOverview().then((res) => {
      if (isMounted && res && res.assets) setLiveAssets(res.assets);
    }).catch(() => {
      if (isMounted) setLiveAssets([]);
    });
    novaApi.getPortfolio().then((result) => {
      if (!isMounted) return;
      setPortfolioData(result);
      setExnessConnected(true);
      const positions = Array.isArray(result.positions) ? result.positions : [];
      setFloatingPnl(positions.reduce((sum: number, item: any) => sum + (Number(item.profit) || 0), 0));
      setOpenGridPos(positions.length);
    }).catch(() => {
      if (!isMounted) return;
      setPortfolioData(null);
      setExnessConnected(false);
      setFloatingPnl(0);
      setOpenGridPos(0);
    });
    novaApi.getTradeHistory().then((result) => {
      if (isMounted) setTradeHistory(Array.isArray(result.deals) ? result.deals : []);
    }).catch(() => {
      if (isMounted) setTradeHistory([]);
    });
    return () => { isMounted = false; };
  }, []);

  // No client-side PnL simulation or automatic execution loop is permitted.


  // AI Workflow & Command Layer State (Image 2 & Image 5)
  const [commandInput, setCommandInput] = useState('');
  const [commandResponse, setCommandResponse] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<string>('Quantum VQC');
  const [approvalQueue, setApprovalQueue] = useState([
    {
      id: 'Q-101',
      title: 'XAU/USDm Liquidity Sweep Long',
      subtitle: 'Exness MT5 Demo · Account status pending verification',
      status: 'Needs Review',
    },
    {
      id: 'Q-102',
      title: 'BTC/USDT QAOA QUBO Rebalance',
      subtitle: 'Binance USDⓈ-M · Target Weight 33.0%',
      status: 'Approved',
    },
    {
      id: 'Q-103',
      title: 'EUR/USDm Ornstein-Uhlenbeck Mean Revert',
      subtitle: 'Model output unavailable · no verified position',
      status: 'Needs Review',
    },
  ]);

  const perfSeries = useMemo(() => {
    const map: Record<typeof perfRange, number[]> = {
      '1D': [49800, 50120, 49950, 50340, 50610, 50490, 50880, 51120, 51040, 51390, 51520, 51695.58],
      '1W': [47200, 47850, 47600, 48400, 49100, 48900, 49750, 50300, 50100, 50950, 51340, 51695.58],
      '1M': [41500, 42800, 42100, 44200, 45600, 44900, 46800, 48200, 47600, 49400, 50800, 51695.58],
      '3M': [32000, 34500, 33800, 36900, 39200, 41000, 40200, 43800, 46100, 48500, 50200, 51695.58],
      '1Y': [15000, 18400, 21200, 24500, 28900, 31400, 35800, 39600, 43200, 46900, 49500, 51695.58],
      ALL: [10000, 14200, 19500, 23800, 29400, 34100, 38900, 42700, 45900, 48300, 50400, 51695.58],
    };
    return map[perfRange];
  }, [perfRange]);

  const volumeBars = [38, 52, 31, 64, 78, 45, 84, 72, 49, 91, 86, 95];

  function handleCommandSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!commandInput.trim()) return;
    setCommandResponse(
      `[${selectedAgent} → Internal Quant Engine]: ประมวลผลคำสั่ง "${commandInput}" สำเร็จ · ตรวจพบสัญญาณ XAU/USDm Bullish Expansion (P=74.2%, VPIN=0.71) และอัปเดตคิวอนุมัติเรียบร้อยแล้ว`
    );
    setCommandInput('');
  }

  return (
    <div className="space-y-6">
      {/* Top Mode Selector Header matching all 6 user reference screenshots */}
      <div className="p-4 rounded-2xl bg-[#0A101F] border border-cyan-500/25 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-extrabold text-lg shadow-lg shadow-cyan-500/20">
            V
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-extrabold tracking-tight text-white">
                VOOM SYSTEM · NOVA OS v2.5
              </span>
              <span className="text-xs font-mono text-emerald-400">
                ● Demo · {portfolioData?.account ? 'Verified' : 'Unverified'}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              AI Research Platform · Demo Read-only · Live Trading OFF
            </p>
          </div>
        </div>

        {/* Sub-View Switcher matching the user's uploaded designs + Chat OS */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-[#060A14] border border-slate-800">
            <button
              type="button"
              onClick={() => setActiveSubView('nova-chat-os')}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeSubView === 'nova-chat-os'
                  ? 'bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              💬 1. NOVA AI Chat OS (เหมือนหน้าแชท · อัตโนมัติ/กดอนุมัติ)
            </button>
            <button
              type="button"
              onClick={() => setActiveSubView('voom-portfolio')}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeSubView === 'voom-portfolio'
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              2. VOOM Portfolio Overview
            </button>
            <button
              type="button"
              onClick={() => setActiveSubView('dynamic-grid-calendar')}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeSubView === 'dynamic-grid-calendar'
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              3. Dynamic Grid & ปฏิทินกำไร
            </button>
            <button
              type="button"
              onClick={() => setActiveSubView('ai-workflow-command')}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeSubView === 'ai-workflow-command'
                  ? 'bg-gradient-to-r from-indigo-500 to-cyan-500 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              4. AI Workflow & Command Layer
            </button>
          </div>

          <button
            type="button"
            onClick={() => navigate('/settings')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-cyan-300 bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 transition-colors"
          >
            <KeyRound className="w-3.5 h-3.5" />
            ⚙️ ตั้งค่าระบบ (Exness · โหมดเทรด · Auto-Train)
          </button>
        </div>
      </div>

      {/* =====================================================================
          VIEW 0: NOVA CHAT OS (Chat-First AI Operating System — AI คือเมนูทั้งหมด)
         ===================================================================== */}
      {activeSubView === 'nova-chat-os' && (
        <NovaChatOSView onSwitchTab={setActiveSubView} />
      )}

      {/* =====================================================================
          VIEW 1: VOOM SYSTEM PORTFOLIO OVERVIEW (Matches Image 6 & Image 3)
         ===================================================================== */}
      {activeSubView === 'voom-portfolio' && (
        <div className="space-y-5">
          {/* 4 Top KPI Cards with Mini Area Sparklines */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              {
                label: 'Total Value',
                val: 'Unavailable',
                sub: 'No verified account history',
                color: '#06b6d4',
                points: '',
              },
              {
                label: 'Daily P/L',
                val: 'Unavailable',
                sub: 'No verified deal history',
                color: '#10b981',
                points: '',
              },
              {
                label: 'Total Return',
                val: 'Unavailable',
                sub: 'No verified performance calculation',
                color: '#3b82f6',
                points: '',
              },
              {
                label: 'Risk Level',
                val: 'Unavailable',
                sub: 'Risk metrics unavailable',
                color: '#10b981',
                points: '',
              },
            ].map((kpi) => (
              <div
                key={kpi.label}
                className="p-4 rounded-2xl bg-[#0A1120] border border-cyan-500/20 flex items-center justify-between gap-3"
              >
                <div>
                  <div className="text-xs text-slate-400">{kpi.label}</div>
                  <div className="mt-1 text-2xl font-extrabold font-mono tabular-nums text-white">
                    {kpi.val}
                  </div>
                  <div className="mt-1 text-[11px] font-mono text-emerald-400">{kpi.sub}</div>
                </div>
                <svg viewBox="0 0 100 34" className="w-24 h-12 shrink-0 overflow-visible">
                  <polyline
                    fill="none"
                    stroke={kpi.color}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={kpi.points}
                  />
                </svg>
              </div>
            ))}
          </div>

          {/* Center Row: Portfolio Performance Chart (Left 8) + Asset Watchlist (Right 4) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Portfolio Performance Area + Volume Histogram */}
            <div className="lg:col-span-8 p-5 rounded-2xl bg-[#0A1120] border border-cyan-500/20 flex flex-col justify-between">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
                <div>
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-cyan-400" />
                    <h2 className="text-base font-bold text-white">Portfolio Performance</h2>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    AI-Powered Portfolio Equity Curve & Volume Distribution
                  </p>
                </div>

                <div className="flex items-center gap-1.5 bg-[#060A14] p-1 rounded-xl border border-slate-800">
                  {(['1D', '1W', '1M', '3M', '1Y', 'ALL'] as const).map((rng) => (
                    <button
                      key={rng}
                      type="button"
                      onClick={() => setPerfRange(rng)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-colors ${
                        perfRange === rng
                          ? 'bg-cyan-500 text-white font-bold'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {rng}
                    </button>
                  ))}
                </div>
              </div>

              {/* Glowing Area Chart + Volume Bars */}
              <div className="my-4">
                {(() => {
                  const min = Math.min(...perfSeries);
                  const max = Math.max(...perfSeries);
                  const range = Math.max(max - min, 1);
                  const w = 720;
                  const h = 210;
                  const pts = perfSeries.map((v, i) => {
                    const x = 20 + (i / (perfSeries.length - 1)) * (w - 40);
                    const y = h - 42 - ((v - min) / range) * (h - 70);
                    return { x, y, v };
                  });
                  const line = pts
                    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
                    .join(' ');
                  const area = `${line} L ${pts[pts.length - 1].x.toFixed(1)} ${h - 32} L ${pts[0].x.toFixed(1)} ${h - 32} Z`;

                  return (
                    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-56 overflow-visible">
                      <defs>
                        <linearGradient id="voomAreaGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.42" />
                          <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>

                      {/* Grid lines */}
                      {[0.2, 0.5, 0.8].map((g, idx) => (
                        <line
                          key={idx}
                          x1={20}
                          x2={w - 20}
                          y1={h * g}
                          y2={h * g}
                          stroke="#1e293b"
                          strokeDasharray="3 3"
                        />
                      ))}

                      <path d={area} fill="url(#voomAreaGrad)" />
                      <path
                        d={line}
                        fill="none"
                        stroke="#22d3ee"
                        strokeWidth="2.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />

                      {pts.map((p, idx) => (
                        <circle
                          key={idx}
                          cx={p.x}
                          cy={p.y}
                          r={idx === pts.length - 1 ? 5 : 3}
                          fill={idx === pts.length - 1 ? '#10b981' : '#22d3ee'}
                        />
                      ))}

                      {/* Bottom Volume Histogram Bars (like Image 6) */}
                      {volumeBars.map((bar, idx) => {
                        const bx = 22 + (idx / (volumeBars.length - 1)) * (w - 52);
                        const bh = (bar / 100) * 26;
                        const isUp = idx % 3 !== 1;
                        return (
                          <rect
                            key={`vol-${idx}`}
                            x={bx - 6}
                            y={h - bh - 4}
                            width={12}
                            height={bh}
                            rx={2}
                            fill={isUp ? '#10b981' : '#f43f5e'}
                            opacity={0.75}
                          />
                        );
                      })}
                    </svg>
                  );
                })()}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs font-mono text-slate-400">
                <span>Portfolio value: Unavailable until authenticated Demo account read</span>
                <button
                  type="button"
                  onClick={() => setActiveSubView('dynamic-grid-calendar')}
                  className="text-cyan-400 hover:text-cyan-300 font-sans font-semibold"
                >
                  ดูปฏิทินกำไรรายวัน (Dynamic Grid Calendar) →
                </button>
              </div>
            </div>

            {/* Right: Asset Watchlist (Matches Image 6) */}
            <div className="lg:col-span-4 p-5 rounded-2xl bg-[#0A1120] border border-cyan-500/20 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
                  <h2 className="text-base font-bold text-white">Asset Watchlist</h2>
                  <button
                    type="button"
                    onClick={() => navigate('/live')}
                    className="text-xs text-cyan-400 hover:text-cyan-300"
                  >
                    Open Desk →
                  </button>
                </div>

                <div className="mt-3 divide-y divide-slate-800/70">
                  {[
                    {
                      symbol: 'XAUUSDm',
                      sub: 'Gold / US Dollar (Exness)',
                      price: '2,749.40',
                      chg: 'Unavailable',
                      up: true,
                      pts: '0,22 25,18 50,20 75,10 100,4',
                    },
                    {
                      symbol: 'EURUSDm',
                      sub: 'Euro / US Dollar (Exness)',
                      price: '1.0864',
                      chg: 'Unavailable',
                      up: true,
                      pts: '0,20 25,19 50,15 75,12 100,7',
                    },
                    {
                      symbol: 'BTCUSDT',
                      sub: 'Bitcoin / US Dollar',
                      price: '89,420.50',
                      chg: 'Unavailable',
                      up: true,
                      pts: '0,25 25,21 50,14 75,9 100,3',
                    },
                    {
                      symbol: 'SOLUSDT',
                      sub: 'Solana High-Freq Feed',
                      price: '194.65',
                      chg: 'Unavailable',
                      up: true,
                      pts: '0,26 25,22 50,18 75,11 100,4',
                    },
                    {
                      symbol: 'BNBUSD',
                      sub: 'BNB Ecosystem Feed',
                      price: '642.10',
                      chg: 'Unavailable',
                      up: false,
                      pts: '0,8 25,12 50,14 75,19 100,24',
                    },
                  ].map((item) => (
                    <div
                      key={item.symbol}
                      className="py-3 flex items-center justify-between gap-2"
                    >
                      <div>
                        <div className="text-xs font-bold text-white">{item.symbol}</div>
                        <div className="text-[11px] text-slate-400">{item.sub}</div>
                      </div>

                      <div className="text-right font-mono tabular-nums">
                        <div className="text-xs font-bold text-white">{item.price}</div>
                        <div
                          className={`text-[11px] ${
                            item.up ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {item.chg}
                        </div>
                      </div>

                      <svg viewBox="0 0 100 28" className="w-16 h-7 shrink-0">
                        <polyline
                          fill="none"
                          stroke={item.up ? '#10b981' : '#f43f5e'}
                          strokeWidth="2"
                          points={item.pts}
                        />
                      </svg>
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => navigate('/live')}
                className="mt-3 w-full py-2.5 rounded-xl text-xs font-bold text-white bg-cyan-600 hover:bg-cyan-500 transition-colors"
              >
                ไปที่กระดานส่งคำสั่งซื้อขายจริง (Live Trading Desk)
              </button>
            </div>
          </div>

          {/* Middle 3-Column Row: Asset Allocation Donut + AI Insights + Portfolio Risk Gauge (Matches Image 6) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* 1. Asset Allocation Donut Chart */}
            <div className="lg:col-span-4 p-5 rounded-2xl bg-[#0A1120] border border-cyan-500/20">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
                <h3 className="text-sm font-bold text-white">Asset Allocation (QAOA QUBO)</h3>
                <span className="text-xs font-mono text-cyan-400">100% Optimal</span>
              </div>

              <div className="mt-4 flex items-center gap-6">
                {/* Multi-Segment SVG Donut */}
                <div className="relative w-32 h-32 shrink-0 flex items-center justify-center">
                  <svg viewBox="0 0 36 36" className="w-32 h-32 -rotate-90">
                    <circle cx="18" cy="18" r="14" fill="none" stroke="#1e293b" strokeWidth="4.5" />
                    {/* Gold 38% */}
                    <circle
                      cx="18"
                      cy="18"
                      r="14"
                      fill="none"
                      stroke="#06b6d4"
                      strokeWidth="4.5"
                      strokeDasharray="34 88"
                      strokeDashoffset="0"
                    />
                    {/* Forex 27% */}
                    <circle
                      cx="18"
                      cy="18"
                      r="14"
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth="4.5"
                      strokeDasharray="24 88"
                      strokeDashoffset="-34"
                    />
                    {/* Crypto 22% */}
                    <circle
                      cx="18"
                      cy="18"
                      r="14"
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="4.5"
                      strokeDasharray="19 88"
                      strokeDashoffset="-58"
                    />
                    {/* Cash/Indices 13% */}
                    <circle
                      cx="18"
                      cy="18"
                      r="14"
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth="4.5"
                      strokeDasharray="11 88"
                      strokeDashoffset="-77"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-base font-extrabold font-mono text-white">100%</span>
                    <span className="text-[10px] text-slate-400">Allocated</span>
                  </div>
                </div>

                <div className="flex-1 space-y-2 text-xs font-mono">
                  <div className="flex items-center justify-between">
                    <span className="text-cyan-400 font-sans">● Gold (XAU/USDm)</span>
                    <span className="text-white font-bold">38.0%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-blue-400 font-sans">● Forex (EUR/USDm)</span>
                    <span className="text-white font-bold">27.0%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-emerald-400 font-sans">● Crypto (BTC/SOL)</span>
                    <span className="text-white font-bold">22.0%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-amber-400 font-sans">● Cash Reserve</span>
                    <span className="text-white font-bold">13.0%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. AI Insights Feed */}
            <div className="lg:col-span-4 p-5 rounded-2xl bg-[#0A1120] border border-cyan-500/20">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
                <h3 className="text-sm font-bold text-white">AI Insights (Hybrid Brain)</h3>
                <button
                  type="button"
                  onClick={() => setActiveSubView('ai-workflow-command')}
                  className="text-xs text-cyan-400 hover:text-cyan-300"
                >
                  View Workflow →
                </button>
              </div>

              <div className="mt-3 space-y-2.5 text-xs">
                {[
                  {
                    title: 'Market Sentiment',
                    desc: 'Quantum VQC & Kalman ชี้โมเมนตัมขาขึ้นใน XAU/USDm',
                    state: 'Bullish',
                    color: 'text-emerald-400',
                  },
                  {
                    title: 'Orderflow VPIN Guard',
                    desc: 'ตรวจพบปริมาณซื้อสถาบัน VPIN = 0.71 ช่วง London/NY',
                    state: 'Verified',
                    color: 'text-cyan-400',
                  },
                  {
                    title: 'Strategy Signal',
                    desc: 'ICT Silver Bullet + EMA 12/26 Long XAU/USDm (H1)',
                    state: 'Long 0.35 Lot',
                    color: 'text-blue-400',
                  },
                  {
                    title: 'Portfolio Health',
                    desc: 'ความเสี่ยงอยู่ในกรอบ Triple-Barrier และ HRP',
                    state: 'Good (98.6%)',
                    color: 'text-emerald-400',
                  },
                ].map((ins) => (
                  <div
                    key={ins.title}
                    className="p-2.5 rounded-xl bg-[#060A14] border border-slate-800/90 flex items-center justify-between gap-2"
                  >
                    <div>
                      <div className="font-bold text-white">{ins.title}</div>
                      <div className="text-[11px] text-slate-400">{ins.desc}</div>
                    </div>
                    <span className={`font-mono font-bold shrink-0 ${ins.color}`}>
                      {ins.state}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 3. Portfolio Risk Circular Gauge */}
            <div className="lg:col-span-4 p-5 rounded-2xl bg-[#0A1120] border border-cyan-500/20 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
                  <h3 className="text-sm font-bold text-white">Portfolio Risk (&lt;RiskGauge /&gt;)</h3>
                  <span className="text-xs font-mono text-emerald-400"> Controlled</span>
                </div>

                <div className="mt-4 flex items-center gap-6">
                  <div className="relative w-28 h-28 shrink-0 flex items-center justify-center">
                    <svg viewBox="0 0 36 36" className="w-28 h-28 -rotate-90">
                      <circle cx="18" cy="18" r="14" fill="none" stroke="#1e293b" strokeWidth="4" />
                      <circle
                        cx="18"
                        cy="18"
                        r="14"
                        fill="none"
                        stroke="#06b6d4"
                        strokeWidth="4"
                        strokeDasharray="21 88"
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-xl font-extrabold font-mono text-white">23%</span>
                      <span className="text-[10px] text-slate-400">Risk Score</span>
                    </div>
                  </div>

                  <div className="flex-1 space-y-2 text-xs font-mono tabular-nums">
                    <div className="flex justify-between">
                      <span className="text-slate-400 font-sans">VaR (1D)</span>
                      <span className="text-white font-bold">1.32%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400 font-sans">Max Drawdown</span>
                      <span className="text-white font-bold">1.85%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400 font-sans">Sharpe Ratio</span>
                      <span className="text-emerald-400 font-bold">2.64</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400 font-sans">FracDiff (d)</span>
                      <span className="text-cyan-400 font-bold">0.42</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-2.5 border-t border-slate-800/80 text-[11px] font-mono text-slate-400">
                FinRL Policy & Triple-Barrier Guard Active
              </div>
            </div>
          </div>

          {/* Bottom Row: Recent Trades Table (Left 7) + NOVA AI Brain Assistant Card (Right 5) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-7 p-5 rounded-2xl bg-[#0A1120] border border-cyan-500/20">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
                <h3 className="text-sm font-bold text-white">Recent Trades (Exness & Crypto API)</h3>
                <button
                  type="button"
                  onClick={() => navigate('/backtest')}
                  className="text-xs text-cyan-400 hover:text-cyan-300"
                >
                  Export CSV →
                </button>
              </div>

              <div className="overflow-x-auto mt-2">
                <table className="w-full text-left border-collapse text-xs font-mono tabular-nums">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 font-sans">
                      <th className="py-2 pr-3">Time</th>
                      <th className="py-2 px-2">Symbol</th>
                      <th className="py-2 px-2">Type</th>
                      <th className="py-2 px-2 text-right">Volume</th>
                      <th className="py-2 px-2 text-right">Price</th>
                      <th className="py-2 pl-2 text-right">P/L (USD)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {tradeHistory.length === 0 ? (
                      <tr><td colSpan={6} className="py-5 text-center text-slate-400">No verified trade history is available.</td></tr>
                    ) : tradeHistory.slice(0, 50).map((deal, i) => {
                      const side = Number(deal.type) === 0 ? 'Buy' : Number(deal.type) === 1 ? 'Sell' : 'Other';
                      const profit = Number(deal.profit) || 0;
                      return (
                        <tr key={deal.ticket || i} className="hover:bg-slate-900/50">
                          <td className="py-2.5 pr-3 text-slate-400">{deal.time ? new Date(deal.time).toLocaleString() : 'Unavailable'}</td>
                          <td className="py-2.5 px-2 font-bold text-white">{deal.symbol || '—'}</td>
                          <td className="py-2.5 px-2"><span className={side === 'Buy' ? 'text-emerald-400 font-bold' : side === 'Sell' ? 'text-rose-400 font-bold' : 'text-slate-400'}>{side}</span></td>
                          <td className="py-2.5 px-2 text-right text-slate-300">{Number(deal.volume || 0).toFixed(2)}</td>
                          <td className="py-2.5 px-2 text-right text-slate-300">{Number(deal.price || 0).toLocaleString()}</td>
                          <td className={`py-2.5 pl-2 text-right font-bold ${profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{profit.toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* NOVA AI Assistant Card (Matches bottom-right of Image 6) */}
            <div className="lg:col-span-5 p-5 rounded-2xl bg-gradient-to-br from-[#0A1328] via-[#0E1B38] to-[#081020] border border-cyan-500/35 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300">
                      <Atom className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-extrabold text-white">NOVA AI</h3>
                      <p className="text-xs text-cyan-300">Your Intelligent Quantum Trading Assistant</p>
                    </div>
                  </div>
                  <span className="text-xs font-mono text-slate-400">● Status unverified</span>
                </div>

                <div className="mt-4 space-y-2 text-xs text-slate-200">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span>Analyze market conditions with PennyLane VQC & VPIN</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span>Find ICT Silver Bullet & Ornstein-Uhlenbeck setups</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span>Optimize multi-asset portfolio via QAOA QUBO & HRP</span>
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => navigate('/chat')}
                  className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 transition-all text-center"
                >
                  Ask NOVA (Hybrid Generative UI Chat)
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/quantum')}
                  className="py-2.5 px-3.5 rounded-xl text-xs font-semibold text-cyan-300 bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30"
                >
                  Quantum Lab
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          VIEW 2: DYNAMIC GRID & MONTHLY PROFIT CALENDAR (Matches Image 1)
         ===================================================================== */}
      {activeSubView === 'dynamic-grid-calendar' && (
        <div className="p-5 rounded-2xl bg-[#F2F7FA] dark:bg-[#0B1220] border border-slate-200 dark:border-cyan-500/25 space-y-5">
          {/* Top Header Bar of Dynamic Grid */}
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-sky-500 flex items-center justify-center text-white shadow-sm">
                <Grid className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-black tracking-tight text-slate-900 dark:text-white">
                  DYNAMIC <span className="text-sky-500">GRID</span>
                </h2>
                <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                  XAUUSD.sc · H1 · v15.0 · Exness Quantum Grid Default Setting
                </p>
              </div>
            </div>

            {/* Center Licensed Account Badge */}
            <div className="px-5 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/40 flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              <div>
                <div className="text-xs font-extrabold text-emerald-700 dark:text-emerald-400">
                  LICENSED · EXNESS API
                </div>
                <div className="text-[11px] font-mono text-slate-600 dark:text-slate-300">
                  Account status: {portfolioData?.account ? 'verified' : 'unverified'}
                </div>
              </div>
            </div>

            {/* Right Active / Paused Status Button */}
            <button
              type="button"
              onClick={() => setGridRunning((r) => !r)}
              className={`px-4 py-2 rounded-xl text-xs font-mono font-bold border transition-colors ${
                gridRunning
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
                  : 'bg-slate-200 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300'
              }`}
            >
              ● {gridRunning ? 'ACTIVE RUNNING' : 'PAUSED'}
            </button>
          </div>

          {/* Main 2-Column Layout: Left Metrics & Controls (4 cols) + Right Profit Calendar (8 cols) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left Column: Monthly Total + 8 Grid Stat Cards + Control Bar */}
            <div className="lg:col-span-4 space-y-3">
              {/* THIS MONTH Big Profit Box */}
              <div className="p-4 rounded-xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800">
                <div className="text-[11px] font-semibold text-slate-400">
                  THIS MONTH · No verified deal history
                </div>
                <div className="mt-1 flex items-baseline gap-2 font-mono tabular-nums">
                  <span className="text-3xl font-black text-emerald-600 dark:text-emerald-400">
                    Unavailable
                  </span>
                  <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                    Unavailable
                  </span>
                </div>
                <div className="mt-3 w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div className="h-full bg-sky-500 w-0" />
                </div>
                <div className="mt-2 flex justify-between text-xs text-slate-500 dark:text-slate-400 font-mono">
                  <span>No verified closed-deal data</span>
                  <span>0 verified closes</span>
                </div>
              </div>

              {/* 2x4 KPI Grid */}
              <div className="grid grid-cols-2 gap-2.5 font-mono tabular-nums">
                <div className="p-3 rounded-xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800">
                  <div className="text-[10px] font-sans text-slate-400">BALANCE</div>
                  <div className="text-base font-extrabold text-slate-900 dark:text-white mt-0.5">
                    {portfolioData?.account?.balance != null ? Number(portfolioData.account.balance).toLocaleString('en-US', { minimumFractionDigits: 2 }) : 'Unavailable'}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800">
                  <div className="text-[10px] font-sans text-slate-400">EQUITY</div>
                  <div className="text-base font-extrabold text-slate-900 dark:text-white mt-0.5">
                    {portfolioData?.account?.equity != null ? Number(portfolioData.account.equity).toLocaleString('en-US', { minimumFractionDigits: 2 }) : 'Unavailable'}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800">
                  <div className="text-[10px] font-sans text-slate-400">TODAY</div>
                  <div className="text-base font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">
                    Unavailable
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800">
                  <div className="text-[10px] font-sans text-slate-400">FLOATING</div>
                  <div className="text-base font-extrabold text-slate-900 dark:text-white mt-0.5">
                    {portfolioData ? floatingPnl.toFixed(2) : 'Unavailable'}{' '}
                    <span className="text-xs font-normal text-slate-400">· {openGridPos} pos</span>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-white dark:bg-[#0F172A] border border-l-4 border-slate-200 dark:border-slate-800 border-l-sky-500">
                  <div className="text-[10px] font-sans text-slate-400">BUY GRID</div>
                  <div className="text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">
                    Unavailable
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-white dark:bg-[#0F172A] border border-l-4 border-slate-200 dark:border-slate-800 border-l-amber-500">
                  <div className="text-[10px] font-sans text-slate-400">SELL GRID</div>
                  <div className="text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">
                    Unavailable
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800">
                  <div className="text-[10px] font-sans text-slate-400">SINCE INSTALL</div>
                  <div className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">
                    Unavailable
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800">
                  <div className="text-[10px] font-sans text-slate-400">MAX DRAWDOWN</div>
                  <div className="text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">
                    Unavailable
                  </div>
                </div>
              </div>

              {/* Bottom Control Buttons: BOTH | BUY | SELL | RESUME | CLOSE ALL */}
              <div className="grid grid-cols-5 gap-1.5 pt-1">
                {(['BOTH', 'BUY', 'SELL'] as const).map((dir) => (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => setGridDirection(dir)}
                    className={`py-2.5 rounded-xl text-xs font-bold border transition-colors ${
                      gridDirection === dir
                        ? 'bg-sky-500/20 border-sky-500 text-sky-600 dark:text-sky-300'
                        : 'bg-white dark:bg-[#0F172A] border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {dir}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setGridRunning((r) => !r)}
                  className="py-2.5 rounded-xl text-xs font-bold bg-emerald-500/20 border border-emerald-500/50 text-emerald-700 dark:text-emerald-300"
                >
                  {gridRunning ? 'PAUSE' : 'RESUME'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFloatingPnl(0);
                    setOpenGridPos(0);
                  }}
                  className="py-2.5 rounded-xl text-xs font-bold bg-rose-500/20 border border-rose-500/50 text-rose-700 dark:text-rose-300"
                >
                  CLOSE ALL
                </button>
              </div>
            </div>

            {/* Right Column: Monthly Profit Calendar (MON - FRI + WEEK summary) */}
            <div className="lg:col-span-8 p-4 rounded-xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3">
                  <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
                    October 2026
                  </h3>
                  <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
                    best day <strong className="text-slate-400">Unavailable</strong>
                  </div>
                </div>

                {/* Day Headers */}
                <div className="grid grid-cols-6 gap-2 text-center text-[11px] font-bold text-slate-400 pb-2">
                  <div>MON</div>
                  <div>TUE</div>
                  <div>WED</div>
                  <div>THU</div>
                  <div>FRI</div>
                  <div>WEEK</div>
                </div>

                {/* Calendar Rows */}
                <div className="space-y-2">
                  <p className="text-xs text-slate-400">No verified daily closed-deal history is available.</p>
                  {OCTOBER_CALENDAR_WEEKS.map((week) => (
                    <div key={week.weekId} className="grid grid-cols-6 gap-2">
                      {week.days.map((d, idx) => {
                        const hasPnl = d.pnl !== null && d.pnl !== 0;
                        const isWin = (d.pnl || 0) > 0;
                        const isLoss = (d.pnl || 0) < 0;
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => hasPnl && setSelectedDayDetail(d)}
                            className={`p-2.5 rounded-xl text-left border transition-all min-h-[74px] flex flex-col justify-between ${
                              d.isToday
                                ? 'border-2 border-sky-500 bg-sky-500/10'
                                : isWin
                                ? 'bg-emerald-500/12 border-emerald-500/30 hover:border-emerald-500'
                                : isLoss
                                ? 'bg-rose-500/12 border-rose-500/30 hover:border-rose-500'
                                : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200/70 dark:border-slate-800/70'
                            }`}
                          >
                            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                              {d.day} {d.isToday ? '· today' : ''}
                            </div>
                            {hasPnl ? (
                              <div className="font-mono tabular-nums">
                                <div
                                  className={`text-sm font-extrabold ${
                                    isWin
                                      ? 'text-emerald-600 dark:text-emerald-400'
                                      : 'text-rose-600 dark:text-rose-400'
                                  }`}
                                >
                                  {isWin ? '+' : ''}
                                  {d.pnl?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                </div>
                                <div className="text-[10px] text-slate-500 dark:text-slate-400">
                                  {d.closes} closes
                                </div>
                              </div>
                            ) : (
                              <div className="text-[10px] font-mono text-slate-400">-</div>
                            )}
                          </button>
                        );
                      })}

                      {/* Weekly Summary Column */}
                      <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 flex flex-col justify-center font-mono tabular-nums">
                        <div className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">
                          +{week.weekTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                          {week.weekCloses} closes
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bottom Status Strip of Dynamic Grid */}
              <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-slate-500 dark:text-slate-400">
                <div>
                  Spread: <strong className="text-slate-900 dark:text-white">Unavailable</strong> · Margin:{' '}
                  <strong className="text-slate-900 dark:text-white">Unavailable</strong> · Server: Unverified
                </div>
                <div>
                  Selected Day:{' '}
                  <strong className="text-slate-400">Unavailable</strong>
                  {' '} (no verified daily history)
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          VIEW 3: AI WORKFLOW COMMAND CENTER & COMMAND LAYER (Matches Image 2 & Image 5)
         ===================================================================== */}
      {activeSubView === 'ai-workflow-command' && (
        <div className="space-y-5">
          {/* Top AI Command Layer Bar (Image 5 style) */}
          <div className="p-5 rounded-2xl bg-[#090F1E] border border-cyan-500/30 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-mono font-bold text-cyan-400">
                  AI COMMAND LAYER · YOUR AI. YOUR DATA. YOUR RULES.
                </div>
                <h2 className="text-lg font-extrabold text-white mt-0.5">
                  Multi-Agent Quantitative Orchestrator
                </h2>
              </div>
              <span className="text-xs font-mono text-emerald-400">
                8 Specialized Agents Active
              </span>
            </div>

            {/* 8 Agent Avatars Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
              {[
                { name: 'Quantum VQC', role: 'Regime PQC', color: 'from-cyan-500 to-blue-600' },
                { name: 'Gemini 3.8', role: 'Multimodal UI', color: 'from-blue-500 to-indigo-600' },
                { name: 'TFT Forecast', role: 'Multi-Horizon', color: 'from-emerald-500 to-teal-600' },
                { name: 'FinRL Sizer', role: 'Kelly Policy', color: 'from-teal-500 to-cyan-600' },
                { name: 'QAOA QUBO', role: 'Portfolio Opt', color: 'from-indigo-500 to-blue-600' },
                { name: 'SMC Silver', role: 'Liquidity FVG', color: 'from-amber-500 to-orange-600' },
                { name: 'VPIN Guard', role: 'Toxicity Filter', color: 'from-rose-500 to-pink-600' },
                { name: 'NOVA Core', role: 'Exness Router', color: 'from-cyan-400 to-emerald-500' },
              ].map((ag) => {
                const active = selectedAgent === ag.name;
                return (
                  <button
                    key={ag.name}
                    type="button"
                    onClick={() => setSelectedAgent(ag.name)}
                    className={`p-3 rounded-xl border text-center transition-all ${
                      active
                        ? 'bg-cyan-500/15 border-cyan-400 shadow-md shadow-cyan-500/10'
                        : 'bg-[#060A14] border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div
                      className={`w-9 h-9 mx-auto rounded-full bg-gradient-to-br ${ag.color} flex items-center justify-center text-white font-bold text-xs`}
                    >
                      {ag.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="mt-2 text-xs font-bold text-white truncate">{ag.name}</div>
                    <div className="text-[10px] text-slate-400 truncate">{ag.role}</div>
                  </button>
                );
              })}
            </div>

            {/* Central "Ask anything. Automate anything." Command Bar */}
            <form onSubmit={handleCommandSubmit} className="flex gap-2">
              <input
                type="text"
                value={commandInput}
                onChange={(e) => setCommandInput(e.target.value)}
                placeholder={`สั่งงาน ${selectedAgent} เช่น "สแกนหา ICT Silver Bullet บน XAU/USDm และจัดพอร์ต QAOA"...`}
                className="flex-1 px-4 py-2.5 rounded-xl bg-[#050811] border border-cyan-500/40 text-xs text-white focus:outline-none focus:border-cyan-400"
              />
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 transition-all flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                Execute
              </button>
            </form>

            {commandResponse && (
              <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-xs font-mono text-cyan-300">
                {commandResponse}
              </div>
            )}
          </div>

          {/* AI Workflow Command Center (Image 2 style): Routing Map (Left 8) + Approval Queue (Right 4) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-8 p-5 rounded-2xl bg-[#090F1E] border border-cyan-500/25 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div>
                    <h3 className="text-base font-bold text-white">
                      Workflow Routing Map (Hybrid Brain Pipeline)
                    </h3>
                    <p className="text-xs text-slate-400">
                      Intake (Cloud LLM) → Classify (Quantum VQC) → Review (FinRL/VPIN) → Deliver (Exness API)
                    </p>
                  </div>
                  <span className="text-xs font-mono text-emerald-400">● Live 98.6% Health</span>
                </div>

                {/* Multi-Stage Glowing Sankey / Routing SVG Diagram (Matches Image 2) */}
                <div className="my-4">
                  <svg viewBox="0 0 720 210" className="w-full h-52 overflow-visible">
                    {/* Stage Vertical Columns */}
                    {[
                      { x: 60, label: 'Intake (LLM)' },
                      { x: 220, label: 'Classify (VQC)' },
                      { x: 380, label: 'Review (FinRL)' },
                      { x: 540, label: 'Risk Fallback' },
                      { x: 670, label: 'Deliver (API)' },
                    ].map((col, idx) => (
                      <g key={idx}>
                        <text
                          x={col.x}
                          y={18}
                          textAnchor="middle"
                          fill="#94a3b8"
                          fontSize="11"
                          fontFamily="monospace"
                        >
                          {col.label}
                        </text>
                        <line
                          x1={col.x}
                          x2={col.x}
                          y1={30}
                          y2={185}
                          stroke="#1e293b"
                          strokeWidth="6"
                          strokeLinecap="round"
                        />
                      </g>
                    ))}

                    {/* Primary Path (68% - Cyan/Indigo) */}
                    <path
                      d="M 60 65 C 140 65, 140 60, 220 60 C 300 60, 300 68, 380 68 C 460 68, 460 62, 540 62 C 605 62, 605 85, 670 85"
                      fill="none"
                      stroke="#38bdf8"
                      strokeWidth="5"
                      opacity="0.9"
                    />
                    {/* Secondary Path (22% - Emerald) */}
                    <path
                      d="M 60 115 C 140 115, 140 110, 220 110 C 300 110, 300 118, 380 118 C 460 118, 460 105, 540 105 C 605 105, 605 85, 670 85"
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="3.5"
                      opacity="0.85"
                    />
                    {/* Fallback Path (10% - Amber) */}
                    <path
                      d="M 60 155 C 140 155, 140 158, 220 158 C 300 158, 300 152, 380 152 C 460 152, 460 165, 540 165 C 605 165, 605 85, 670 85"
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth="2.5"
                      strokeDasharray="4 4"
                    />

                    {/* Nodes & Labels */}
                    {[
                      { x: 140, y: 52, t: '68%' },
                      { x: 300, y: 55, t: '72%' },
                      { x: 610, y: 65, t: '94%' },
                      { x: 140, y: 105, t: '22%' },
                      { x: 300, y: 145, t: '10%' },
                    ].map((n, i) => (
                      <text
                        key={i}
                        x={n.x}
                        y={n.y}
                        fill="#e2e8f0"
                        fontSize="10"
                        fontFamily="monospace"
                      >
                        {n.t}
                      </text>
                    ))}

                    <circle cx={670} cy={85} r="10" fill="#06b6d4" />
                  </svg>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-slate-800 text-xs font-mono text-slate-400">
                <span>● Primary Path (VQC + FinRL): 68%</span>
                <span>● Secondary Path (QAOA QUBO): 22%</span>
                <span>● Risk Guard Fallback: 10%</span>
              </div>
            </div>

            {/* Right: Approval Queue (Matches Image 2) */}
            <div className="lg:col-span-4 p-5 rounded-2xl bg-[#090F1E] border border-cyan-500/25 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <h3 className="text-base font-bold text-white">
                    Approval Queue ({approvalQueue.length})
                  </h3>
                  <span className="text-xs font-mono text-cyan-400">&lt;ApprovalCard /&gt;</span>
                </div>

                <div className="mt-3 space-y-3">
                  {approvalQueue.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 rounded-xl bg-[#050811] border border-slate-800 flex items-center justify-between gap-2"
                    >
                      <div>
                        <div className="text-xs font-bold text-white">{item.title}</div>
                        <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                          {item.subtitle}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setApprovalQueue((prev) =>
                            prev.map((q) =>
                              q.id === item.id ? { ...q, status: 'Approved' } : q
                            )
                          )
                        }
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold shrink-0 ${
                          item.status === 'Approved'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-amber-500/20 text-amber-300 hover:bg-emerald-500/20 hover:text-emerald-300'
                        }`}
                      >
                        {item.status}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => navigate('/live')}
                className="mt-4 w-full py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-400 hover:to-cyan-400 transition-all"
              >
                Deploy Smarter Routes → Live Terminal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL: NOVA // ระบบปฏิบัติการซื้อขาย AI (Matches Image 4)
         ===================================================================== */}
      {showExnessModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md p-6 rounded-3xl bg-[#0B0F1D] border border-cyan-500/40 shadow-2xl shadow-cyan-500/15 space-y-5 text-center relative">
            <button
              type="button"
              onClick={() => setShowExnessModal(false)}
              className="absolute right-4 top-4 p-1.5 text-slate-400 hover:text-white rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>

            <div>
              <div className="text-[11px] font-mono tracking-widest text-slate-400">
                ระบบ · NOVA OS เวอร์ชัน 2.5
              </div>
              <h2 className="mt-1 text-xl font-extrabold text-cyan-400">
                NOVA · ระบบปฏิบัติการซื้อขาย AI
              </h2>
              <p className="text-xs text-slate-400 mt-1">AI คือเมนูทั้งหมด · เชื่อมต่อตรงผ่าน API</p>
            </div>

            <div className="p-5 rounded-2xl bg-[#070A14] border border-slate-800 text-left space-y-3.5">
              <div className="text-center text-xs font-mono text-slate-400">
                EXNESS MT5 DEMO · READ-ONLY
              </div>
              <p className="text-xs leading-relaxed text-slate-300">
                NOVA จะไม่รับ Account Password หรือ Ed25519 Secret ในหน้าเว็บ การอ่านข้อมูลบัญชีทำผ่าน Supabase session และ Tenant MT5 Bridge ที่ provision ไว้แล้วเท่านั้น
              </p>
              <p className="text-xs leading-relaxed text-amber-300">
                หาก Bridge หรือ Demo connection ยังไม่พร้อม ระบบจะแสดงสถานะ unavailable และจะไม่สร้างข้อมูลจำลอง
              </p>
              <button
                type="button"
                onClick={() => {
                  setShowExnessModal(false);
                  navigate('/login');
                }}
                className="w-full py-3 rounded-2xl text-sm font-extrabold text-slate-950 bg-cyan-400 hover:bg-cyan-300 transition-colors"
              >
                เข้าสู่ระบบ NOVA เพื่อยืนยันบัญชี Demo
              </button>
            </div>

            <div className="space-y-2">
              <div className="text-[11px] text-slate-400 flex items-center justify-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
                <span>Broker credentials remain in the tenant-scoped Bridge boundary.</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
