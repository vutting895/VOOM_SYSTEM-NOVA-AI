import React, { useState, useMemo } from 'react';
import { CandlestickBar } from '../../api/types';
import { Activity, BarChart2, TrendingUp, TrendingDown, Clock, ShieldCheck } from 'lucide-react';

interface CandlestickChartProps {
  symbol: string;
  bars: CandlestickBar[];
  currentPrice: number;
  change24h: number;
  timeframe: string;
  onTimeframeChange: (tf: string) => void;
  dataModeLabel?: string;
}

export default function CandlestickChart({
  symbol,
  bars,
  currentPrice,
  change24h,
  timeframe,
  onTimeframeChange,
  dataModeLabel = 'EXNESS DEMO FEED (READ-ONLY)',
}: CandlestickChartProps) {
  const [hoveredBarIndex, setHoveredBarIndex] = useState<number | null>(null);

  const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1D'];

  const { minPrice, maxPrice, priceRange, maxVolume } = useMemo(() => {
    if (!bars || bars.length === 0) {
      return { minPrice: 0, maxPrice: 100, priceRange: 100, maxVolume: 100 };
    }
    let min = Infinity;
    let max = -Infinity;
    let maxVol = 0;

    bars.forEach((b) => {
      if (b.low < min) min = b.low;
      if (b.high > max) max = b.high;
      if (b.volume > maxVol) maxVol = b.volume;
    });

    const padding = (max - min) * 0.08 || 1;
    return {
      minPrice: min - padding,
      maxPrice: max + padding,
      priceRange: max - min + padding * 2,
      maxVolume: maxVol || 1,
    };
  }, [bars]);

  const chartHeight = 280;
  const volumeHeight = 60;
  const totalSvgHeight = 360;
  const svgWidth = 800;

  const activeBar = hoveredBarIndex !== null && bars[hoveredBarIndex] ? bars[hoveredBarIndex] : bars[bars.length - 1];

  const getY = (val: number) => {
    if (priceRange === 0) return chartHeight / 2;
    return chartHeight - ((val - minPrice) / priceRange) * chartHeight;
  };

  const isPositive = change24h >= 0;

  return (
    <div className="w-full bg-[#0D111A] border border-slate-800/90 rounded-2xl p-4 sm:p-5 shadow-2xl relative overflow-hidden">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold">
            {symbol.slice(0, 3)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base sm:text-lg font-bold text-white tracking-wide">{symbol}</h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                {dataModeLabel}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="font-mono text-slate-200 font-semibold text-sm">
                ${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
              </span>
              <span
                className={`inline-flex items-center gap-0.5 font-mono font-medium ${
                  isPositive ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {isPositive ? '+' : ''}
                {change24h.toFixed(2)}%
              </span>
            </div>
          </div>
        </div>

        {/* Timeframe Buttons */}
        <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800">
          <Clock className="w-3.5 h-3.5 text-slate-500 ml-1.5 mr-0.5" />
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => onTimeframeChange(tf)}
              className={`px-2.5 py-1 text-xs font-mono font-medium rounded-lg transition-all ${
                timeframe === tf
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Crosshair / Active Bar Info Banner */}
      {activeBar && (
        <div className="flex flex-wrap items-center gap-4 py-2 px-3 my-2 bg-slate-900/60 rounded-lg text-xs font-mono border border-slate-800/60 text-slate-400">
          <div>
            Time: <span className="text-slate-200">{activeBar.time}</span>
          </div>
          <div>
            O: <span className="text-slate-200">{activeBar.open}</span>
          </div>
          <div>
            H: <span className="text-emerald-300">{activeBar.high}</span>
          </div>
          <div>
            L: <span className="text-rose-300">{activeBar.low}</span>
          </div>
          <div>
            C:{' '}
            <span className={activeBar.isBullish ? 'text-emerald-400' : 'text-rose-400'}>
              {activeBar.close}
            </span>
          </div>
          <div>
            Vol: <span className="text-cyan-300">{activeBar.volume.toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* SVG Candlestick Chart */}
      <div className="relative w-full overflow-hidden select-none">
        <svg
          viewBox={`0 0 ${svgWidth} ${totalSvgHeight}`}
          className="w-full h-auto max-h-[380px] overflow-visible"
          onMouseLeave={() => setHoveredBarIndex(null)}
        >
          <defs>
            <linearGradient id="volGradBullish" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.05" />
            </linearGradient>
            <linearGradient id="volGradBearish" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0.05" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
            const y = chartHeight * pct;
            const priceLevel = maxPrice - pct * priceRange;
            return (
              <g key={idx}>
                <line x1="0" y1={y} x2={svgWidth - 65} y2={y} stroke="#1e293b" strokeDasharray="3 3" />
                <text
                  x={svgWidth - 60}
                  y={y + 3}
                  fill="#64748b"
                  fontSize="10"
                  fontFamily="monospace"
                  textAnchor="start"
                >
                  {priceLevel.toFixed(symbol.includes('XAU') || symbol.includes('BTC') ? 2 : 4)}
                </text>
              </g>
            );
          })}

          {/* Volume separator */}
          <line x1="0" y1={chartHeight + 10} x2={svgWidth} y2={chartHeight + 10} stroke="#1e293b" />
          <text x="5" y={chartHeight + 24} fill="#475569" fontSize="9" fontFamily="monospace">
            VOLUME
          </text>

          {/* Render Bars */}
          {bars.map((bar, index) => {
            const barWidth = Math.max(3, (svgWidth - 70) / bars.length - 4);
            const x = index * ((svgWidth - 70) / bars.length) + 6;

            const yOpen = getY(bar.open);
            const yClose = getY(bar.close);
            const yHigh = getY(bar.high);
            const yLow = getY(bar.low);

            const candleTop = Math.min(yOpen, yClose);
            const candleBodyHeight = Math.max(2, Math.abs(yClose - yOpen));
            const color = bar.isBullish ? '#10b981' : '#ef4444';

            // Volume bar
            const volBarHeight = (bar.volume / maxVolume) * volumeHeight;
            const volY = totalSvgHeight - volBarHeight - 5;

            const isHovered = hoveredBarIndex === index;

            return (
              <g
                key={index}
                className="cursor-pointer transition-opacity"
                onMouseEnter={() => setHoveredBarIndex(index)}
              >
                {/* Wick */}
                <line x1={x + barWidth / 2} y1={yHigh} x2={x + barWidth / 2} y2={yLow} stroke={color} strokeWidth="1.2" />

                {/* Body */}
                <rect
                  x={x}
                  y={candleTop}
                  width={barWidth}
                  height={candleBodyHeight}
                  fill={color}
                  rx="1"
                  className={isHovered ? 'filter drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]' : ''}
                />

                {/* Volume bar */}
                <rect
                  x={x}
                  y={volY}
                  width={barWidth}
                  height={volBarHeight}
                  fill={bar.isBullish ? 'url(#volGradBullish)' : 'url(#volGradBearish)'}
                  rx="0.5"
                />

                {/* Hover vertical crosshair */}
                {isHovered && (
                  <line
                    x1={x + barWidth / 2}
                    y1="0"
                    x2={x + barWidth / 2}
                    y2={totalSvgHeight}
                    stroke="#22d3ee"
                    strokeDasharray="2 2"
                    strokeWidth="1"
                    opacity="0.7"
                  />
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
