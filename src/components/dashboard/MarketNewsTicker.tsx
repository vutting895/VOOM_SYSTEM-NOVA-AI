import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Flame,
  Globe,
  Zap,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

export interface MarketNewsItem {
  id: string;
  symbol: string;
  headline: string;
  category: 'VOLATILITY' | 'SENTIMENT' | 'MACRO' | 'FED' | 'BREAKOUT';
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'VOLATILITY';
  score: number; // 0 to 100
  timeAgo: string;
  detail: string;
}

const DEFAULT_NEWS_FEED: MarketNewsItem[] = [
  {
    id: 'n-1',
    symbol: 'XAU/USD',
    headline: '⚡ Gold spikes +$24.50 as Middle East tension escalates safe-haven inflows',
    category: 'VOLATILITY',
    impact: 'HIGH',
    sentiment: 'BULLISH',
    score: 88,
    timeAgo: '2m ago',
    detail: 'Institutional Order Flow detected significant liquidity absorption at $2,340. Smart Money Flow index signals aggressive institutional long accumulation.',
  },
  {
    id: 'n-2',
    symbol: 'BTC/USD',
    headline: '🚀 Bitcoin breaks $67,800 resistance; Open Interest surges +$1.2B',
    category: 'BREAKOUT',
    impact: 'HIGH',
    sentiment: 'BULLISH',
    score: 92,
    timeAgo: '5m ago',
    detail: 'Derivatives data shows massive short squeeze liquidations above $67,500 with spot volume backing the breakout across major exchanges.',
  },
  {
    id: 'n-3',
    symbol: 'US Dollar (DXY)',
    headline: '🏛️ US Core CPI sticky at 3.3%; Fed Futures price in delayed rate cuts',
    category: 'FED',
    impact: 'HIGH',
    sentiment: 'BEARISH',
    score: 34,
    timeAgo: '12m ago',
    detail: 'Higher-for-longer rate sentiment pressures EUR/USD and GBP/USD pairs while Treasury 10-year yields hold steady at 4.42%.',
  },
  {
    id: 'n-4',
    symbol: 'EUR/USD',
    headline: '📉 EUR/USD test 1.0850 support following ECB dovish rate guidance',
    category: 'SENTIMENT',
    impact: 'MEDIUM',
    sentiment: 'BEARISH',
    score: 41,
    timeAgo: '18m ago',
    detail: 'ECB board members hint at potential rate reduction next quarter as Eurozone inflation eases closer to 2.0% target.',
  },
  {
    id: 'n-5',
    symbol: 'USD/JPY',
    headline: '⚠️ Bank of Japan interventions watch activated as USD/JPY approaches 156.50',
    category: 'VOLATILITY',
    impact: 'HIGH',
    sentiment: 'VOLATILITY',
    score: 76,
    timeAgo: '25m ago',
    detail: 'Ministry of Finance jawboning intensifies with implied volatility curve flattening for 1-month JPY options.',
  },
  {
    id: 'n-6',
    symbol: 'WTI Oil',
    headline: '🛢️ OPEC+ extends voluntary production cuts of 2.2M bpd through Q3',
    category: 'MACRO',
    impact: 'MEDIUM',
    sentiment: 'BULLISH',
    score: 69,
    timeAgo: '35m ago',
    detail: 'Supply side tightness continues to support crude prices near $82.50 despite rising US commercial crude stockpiles.',
  },
];

export default function MarketNewsTicker() {
  const [news, setNews] = useState<MarketNewsItem[]>(DEFAULT_NEWS_FEED);
  const [isPaused, setIsPaused] = useState(false);
  const [selectedNews, setSelectedNews] = useState<MarketNewsItem | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<string>('Just now');

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setLastRefreshed(new Date().toLocaleTimeString());
      setIsRefreshing(false);
    }, 600);
  };

  return (
    <div className="w-full mb-4">
      {/* Ticker Container Bar */}
      <div className="relative flex items-center rounded-2xl bg-gradient-to-r from-[#0C0E17] via-[#101322] to-[#0C0E17] border border-cyan-500/20 shadow-[0_4px_20px_rgba(0,0,0,0.4)] backdrop-blur-xl overflow-hidden py-2 px-3">
        {/* Left Badge: Live Sentiment Label */}
        <div className="flex items-center gap-2 shrink-0 pr-3 border-r border-white/10 z-10 bg-[#0C0E17]/90">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-500/15 border border-cyan-400/40 text-cyan-300 font-bold text-[11px]">
            <Flame className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
            <span className="uppercase tracking-wider">LIVE TICKER</span>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            title="Refreshed: Click to update news"
            className="p-1 rounded-full text-slate-400 hover:text-cyan-300 hover:bg-slate-800 transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-cyan-400' : ''}`} />
          </button>
        </div>

        {/* Center Marquee Track */}
        <div
          className="flex-1 overflow-hidden relative cursor-pointer"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          <div
            className={`flex items-center gap-8 whitespace-nowrap transition-transform ${
              isPaused ? '' : 'animate-marquee'
            }`}
            style={{
              animationPlayState: isPaused ? 'paused' : 'running',
            }}
          >
            {/* Duplicated list for smooth continuous scrolling infinite loop */}
            {[...news, ...news].map((item, idx) => (
              <div
                key={`${item.id}-${idx}`}
                onClick={() => setSelectedNews(item)}
                className="inline-flex items-center gap-2 text-xs hover:text-cyan-300 transition-colors group"
              >
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 text-slate-300 group-hover:bg-cyan-500/20 group-hover:text-cyan-300 transition-colors">
                  {item.symbol}
                </span>

                <span
                  className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                    item.impact === 'HIGH'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  }`}
                >
                  {item.impact}
                </span>

                <span className="text-slate-200 font-medium text-xs">
                  {item.headline}
                </span>

                <div className="flex items-center gap-1 text-[10px] text-slate-400 font-mono">
                  <span>{item.timeAgo}</span>
                  {item.sentiment === 'BULLISH' ? (
                    <TrendingUp className="w-3 h-3 text-emerald-400" />
                  ) : item.sentiment === 'BEARISH' ? (
                    <TrendingDown className="w-3 h-3 text-rose-400" />
                  ) : (
                    <Zap className="w-3 h-3 text-amber-400" />
                  )}
                </div>

                <span className="text-slate-700">|</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right Status Badge */}
        <div className="hidden md:flex items-center gap-2 shrink-0 pl-3 border-l border-white/10 z-10 bg-[#0C0E17]/90 text-[10px] text-slate-400 font-mono">
          <Globe className="w-3 h-3 text-emerald-400 animate-spin" style={{ animationDuration: '8s' }} />
          <span>Macro Feed Active</span>
        </div>
      </div>

      {/* Headline Detail Modal */}
      {selectedNews && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fadeIn">
          <div className="w-full max-w-lg rounded-3xl bg-[#0F111D] border border-cyan-500/40 p-6 text-slate-100 shadow-[0_25px_80px_rgba(0,0,0,0.9)] relative overflow-hidden">
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-lg bg-cyan-500/20 text-cyan-300 font-mono font-bold text-xs">
                  {selectedNews.symbol}
                </span>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  {selectedNews.category} ALERT
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedNews(null)}
                className="text-slate-400 hover:text-white px-2 py-1 rounded-lg bg-slate-800 text-xs"
              >
                ✕ Close
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <h3 className="text-base font-extrabold text-white leading-snug">
                {selectedNews.headline}
              </h3>

              <div className="flex items-center gap-3 text-xs">
                <div className="flex items-center gap-1 text-slate-300">
                  <span className="text-slate-500">Impact:</span>
                  <span className="font-bold text-rose-400">{selectedNews.impact}</span>
                </div>
                <span className="text-slate-700">·</span>
                <div className="flex items-center gap-1 text-slate-300">
                  <span className="text-slate-500">Sentiment:</span>
                  <span className="font-bold text-emerald-400">{selectedNews.sentiment} ({selectedNews.score}%)</span>
                </div>
                <span className="text-slate-700">·</span>
                <span className="text-slate-400 font-mono">{selectedNews.timeAgo}</span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950/80 border border-white/10 text-xs text-slate-300 leading-relaxed">
                <p className="font-semibold text-white mb-1">Detailed Analysis & Orderflow Impact:</p>
                {selectedNews.detail}
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-[11px] text-slate-500 font-mono">
                  Source: Real-time Liquidity & Volatility Monitor
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedNews(null)}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold text-xs hover:opacity-90 transition-opacity"
                >
                  View Pair Chart →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
