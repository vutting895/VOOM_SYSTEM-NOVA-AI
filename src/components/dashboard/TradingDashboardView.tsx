import React, { useState, useEffect } from 'react';
import { novaApi } from '../../api/apiClient';
import { MarketOverviewResponse, CandlestickBar, MarketAssetQuote, TradingSignal } from '../../api/types';
import CandlestickChart from './CandlestickChart';
import MarketSentimentWidget from './MarketSentimentWidget';
import ReadonlySafetyBadge from '../common/ReadonlySafetyBadge';
import { LoadingSpinner, ErrorView } from '../common/StateViews';
import BrokerConnectionModal from '../auth/BrokerConnectionModal';
import {
  TrendingUp,
  TrendingDown,
  Sparkles,
  Zap,
  Target,
  ShieldCheck,
  Radio,
  RefreshCw,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Lock,
} from 'lucide-react';

export default function TradingDashboardView() {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [overviewData, setOverviewData] = useState<MarketOverviewResponse | null>(null);
  const [showConnectModal, setShowConnectModal] = useState<boolean>(false);

  const [selectedSymbol, setSelectedSymbol] = useState<string>('XAU/USDm');
  const [timeframe, setTimeframe] = useState<string>('15m');
  const [bars, setBars] = useState<CandlestickBar[]>([]);
  const [barsLoading, setBarsLoading] = useState<boolean>(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await novaApi.getMarketOverview();
      setOverviewData(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch market overview');
    } finally {
      setLoading(false);
    }
  };

  const fetchBars = async (sym: string, tf: string) => {
    try {
      setBarsLoading(true);
      const res = await novaApi.getCandlesticks(sym, tf, 38);
      setBars(res.bars || []);
    } catch (err) {
      console.error('Failed to load candlestick bars', err);
    } finally {
      setBarsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    fetchBars(selectedSymbol, timeframe);
  }, [selectedSymbol, timeframe]);

  if (loading) {
    return (
      <div className="space-y-6">
        <ReadonlySafetyBadge />
        <LoadingSpinner label="กำลังเชื่อมต่อดึงข้อมูลตลาด XAUUSDm & BTCUSD (Exness Demo Read-Only)..." />
      </div>
    );
  }

  if (error || !overviewData) {
    return (
      <div className="space-y-6">
        <ReadonlySafetyBadge />
        <ErrorView error={error || 'No overview data received'} onRetry={fetchData} />
      </div>
    );
  }

  const selectedAsset =
    overviewData.assets.find((a) => a.symbol === selectedSymbol) || overviewData.assets[0];

  return (
    <div className="space-y-6 text-slate-100">
      {/* 1. Safety Status Banner */}
      <ReadonlySafetyBadge />

      {/* 2. Market Overview Cards (Top Ticker Row) */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">
              Market Overview (ภาพรวมตลาด Exness Demo)
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowConnectModal(true)}
              className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1.5 transition-colors font-bold font-mono"
            >
              <Lock className="w-3.5 h-3.5" />
              LOGIN BROKER
            </button>
            <button
              type="button"
              onClick={fetchData}
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              รีเฟรชราคา
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {overviewData.assets.map((asset) => {
            const isSelected = asset.symbol === selectedSymbol;
            const isPos = asset.change24h >= 0;
            return (
              <button
                key={asset.symbol}
                type="button"
                onClick={() => setSelectedSymbol(asset.symbol)}
                className={`text-left p-3.5 rounded-xl border transition-all ${
                  isSelected
                    ? 'bg-slate-800/90 border-cyan-500 shadow-lg shadow-cyan-500/10 ring-1 ring-cyan-500/50'
                    : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-850'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white tracking-wide">{asset.symbol}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                    {asset.category}
                  </span>
                </div>
                <div className="mt-2 text-sm sm:text-base font-mono font-bold text-slate-100">
                  ${asset.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px] font-mono">
                  <span className={isPos ? 'text-emerald-400' : 'text-rose-400'}>
                    {isPos ? '+' : ''}
                    {asset.change24h.toFixed(2)}%
                  </span>
                  <span className="text-slate-500 text-[10px]">{asset.spreadLabel}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Main Candlestick Chart Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
            <span className="text-xs font-mono text-slate-400">Quick Pair Switch:</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedSymbol('XAU/USDm')}
                className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all ${
                  selectedSymbol === 'XAU/USDm'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                XAU/USDm (Gold)
              </button>
              <button
                type="button"
                onClick={() => setSelectedSymbol('BTC/USDm')}
                className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all ${
                  selectedSymbol === 'BTC/USDm'
                    ? 'bg-orange-500/20 text-orange-300 border border-orange-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                BTC/USDm (Bitcoin)
              </button>
            </div>
          </div>

          <CandlestickChart
            symbol={selectedSymbol}
            bars={bars}
            currentPrice={selectedAsset.price}
            change24h={selectedAsset.change24h}
            timeframe={timeframe}
            onTimeframeChange={setTimeframe}
            dataModeLabel="EXNESS DEMO FEED · READ-ONLY"
          />

          {/* Quick Metrics Under Chart */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-900/50 p-4 rounded-xl border border-slate-800 text-xs">
            <div>
              <span className="text-slate-400 block text-[11px]">24h High</span>
              <span className="text-slate-200 font-mono font-semibold">${selectedAsset.high24h.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">24h Low</span>
              <span className="text-slate-200 font-mono font-semibold">${selectedAsset.low24h.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">ATR (14 Volatility)</span>
              <span className="text-amber-300 font-mono font-semibold">{selectedAsset.atr14}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Data Feed Source</span>
              <span className="text-emerald-400 font-mono font-semibold flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> Exness Demo
              </span>
            </div>
          </div>
        </div>

        {/* 4. AI Market Analysis Panel */}
        <div className="bg-[#0D111A] border border-slate-800 rounded-2xl p-5 flex flex-col justify-between space-y-4 shadow-xl">
          <div>
            <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                AI Market Analysis (การวิเคราะห์ด้วย AI)
              </h3>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <span className="text-[11px] uppercase tracking-wider text-slate-400 block">Market Regime</span>
                <div className="mt-1 p-2.5 rounded-lg bg-cyan-950/30 border border-cyan-500/20 text-xs text-cyan-200 font-medium">
                  {overviewData.analysis?.marketRegime || 'Unavailable — no verified AI analysis'}
                </div>
              </div>

              <div>
                <span className="text-[11px] uppercase tracking-wider text-slate-400 block">Macro Driver</span>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                  {overviewData.analysis?.macroDriver || 'AI analysis is not connected. No synthetic analysis is displayed.'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider">Key Support</span>
                  <div className="text-xs font-mono font-bold text-emerald-400 mt-0.5">
                    {overviewData.analysis?.keySupport != null ? 'USD ' + overviewData.analysis.keySupport.toLocaleString() : 'Unavailable'}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider">Key Resistance</span>
                  <div className="text-xs font-mono font-bold text-rose-400 mt-0.5">
                    {overviewData.analysis?.keyResistance != null ? 'USD ' + overviewData.analysis.keyResistance.toLocaleString() : 'Unavailable'}
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-400">Model Consensus (ความเห็นพ้องของ AI)</span>
                  <span className="text-cyan-400 font-bold">{overviewData.analysis?.confidencePct ?? 'Unavailable'}%</span>
                </div>
                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 rounded-full"
                    style={{ width: `${overviewData.analysis?.confidencePct ?? 0}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5 font-mono">{overviewData.analysis?.modelConsensus || 'No verified model output'}</p>
              </div>
            </div>
          </div>

          {overviewData.analysis ? (
            <MarketSentimentWidget
              sentimentScore={overviewData.analysis.sentimentScore}
              volatilityScore={overviewData.analysis.volatilityScore}
            />
          ) : (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-400">
              Sentiment and volatility scores are unavailable until a verified model output is connected.
            </div>
          )}

          <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 text-[11px] text-slate-400 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>
              บทวิเคราะห์สังเคราะห์เพื่อการศึกษาและวิจัยเชิงปริมาณ (Quantitative Research) ไม่ใช่คำแนะนำทางการเงิน
            </span>
          </div>
        </div>
      </div>

      {/* 5. Live Trading Signals Table */}
      <div className="bg-[#0D111A] border border-slate-800 rounded-2xl p-5 shadow-xl">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              AI Trading Signals (สัญญาณเทรดจำลองจากโมเดล)
            </h3>
          </div>
          <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20">
            READ-ONLY SIGNAL FEED
          </span>
        </div>

        <div className="divide-y divide-slate-800/80 mt-2">
          {(overviewData.signals || []).length === 0 ? (
            <p className="py-5 text-sm text-slate-400">No verified trading signals are available. No simulated signals are shown.</p>
          ) : (overviewData.signals || []).map((signal) => {
            const isBuy = signal.type === 'BUY';
            return (
              <div key={signal.id} className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-white px-2 py-0.5 bg-slate-800 rounded font-mono">
                      {signal.symbol}
                    </span>
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded font-mono ${
                        isBuy ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {signal.type} ({signal.timeframe})
                    </span>
                    <span className="text-xs text-slate-300 font-semibold">{signal.strategy}</span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap text-xs text-slate-400">
                    {signal.confluenceFactors.map((f, i) => (
                      <span key={i} className="inline-flex items-center gap-1 bg-slate-900 px-2 py-0.5 rounded border border-slate-800 text-[11px]">
                        <CheckCircle2 className="w-3 h-3 text-cyan-400" />
                        {f}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-4 self-end md:self-center font-mono text-xs">
                  <div className="text-right">
                    <span className="text-[10px] text-slate-500 block">ENTRY / TARGET</span>
                    <span className="text-slate-300">${signal.entryPrice}</span> →{' '}
                    <span className="text-emerald-400 font-bold">${signal.targetPrice}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-500 block">RISK / REWARD</span>
                    <span className="text-cyan-400 font-bold">{signal.riskRewardRatio}</span>
                  </div>
                  <div className="text-right bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-500 block">AI CONFIDENCE</span>
                    <span className="text-amber-400 font-bold">{signal.confidencePct}%</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {/* Broker Connection Modal */}
      <BrokerConnectionModal isOpen={showConnectModal} onClose={() => setShowConnectModal(false)} />
    </div>
  );
}
