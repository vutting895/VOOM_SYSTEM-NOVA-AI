import React from 'react';
import { TrendingUp, TrendingDown, Activity, Radio } from 'lucide-react';

interface MarketSentimentWidgetProps {
  sentimentScore: number;
  volatilityScore: number;
}

export default function MarketSentimentWidget({ sentimentScore, volatilityScore }: MarketSentimentWidgetProps) {
  const getSentimentLabel = (score: number) => {
    if (score > 75) return { label: 'Bullish (กระทิง)', color: 'text-emerald-400', bg: 'bg-emerald-500/10' };
    if (score > 40) return { label: 'Neutral (เป็นกลาง)', color: 'text-amber-400', bg: 'bg-amber-500/10' };
    return { label: 'Bearish (หมี)', color: 'text-rose-400', bg: 'bg-rose-500/10' };
  };

  const getVolatilityLabel = (score: number) => {
    if (score > 70) return { label: 'High (สูง)', color: 'text-rose-400' };
    if (score > 30) return { label: 'Medium (ปานกลาง)', color: 'text-amber-400' };
    return { label: 'Low (ต่ำ)', color: 'text-emerald-400' };
  };

  const sentiment = getSentimentLabel(sentimentScore);
  const volatility = getVolatilityLabel(volatilityScore);

  return (
    <div className="bg-[#0D111A] border border-slate-800 rounded-2xl p-5 shadow-xl">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          Market Sentiment & Volatility
        </h3>
        <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className={`p-3 rounded-xl border ${sentiment.bg} border-slate-800`}>
          <span className="text-[10px] text-slate-500 uppercase block font-mono">Sentiment</span>
          <span className={`text-sm font-bold ${sentiment.color}`}>{sentiment.label} ({sentimentScore})</span>
        </div>
        <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
          <span className="text-[10px] text-slate-500 uppercase block font-mono">Volatility</span>
          <span className={`text-sm font-bold ${volatility.color}`}>{volatility.label} ({volatilityScore})</span>
        </div>
      </div>
    </div>
  );
}
