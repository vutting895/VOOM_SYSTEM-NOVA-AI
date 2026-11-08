import React, { useState } from 'react';
import { ApiMetricRecord } from '../../api/apiClient';
import { usePerformanceDiagnostic } from '../../hooks/usePerformanceDiagnostic';
import {
  Activity,
  Cpu,
  Database,
  Gauge,
  Maximize2,
  Minimize2,
  Terminal,
  Zap,
  HardDrive,
  CheckCircle2,
  Clock,
} from 'lucide-react';

export default function DevDiagnosticOverlay() {
  const [isExpanded, setIsExpanded] = useState(false);
  const {
    metrics,
    memoryStats,
    fps,
    domCount,
    componentRenderMs,
    renderCount,
    summary,
  } = usePerformanceDiagnostic('NOVA Dashboard');

  return (
    <div className="fixed bottom-4 right-4 z-50 font-mono select-none">
      {/* Collapsed Compact Floating Performance Badge in Footer */}
      {!isExpanded && (
        <button
          type="button"
          onClick={() => setIsExpanded(true)}
          className="flex items-center gap-3 px-3.5 py-2 rounded-full bg-slate-900/90 border border-slate-700/60 shadow-[0_10px_30px_rgba(0,0,0,0.6)] backdrop-blur-xl text-xs text-slate-200 hover:border-cyan-500/60 hover:text-white transition-all group cursor-pointer"
          title="Dev Performance Diagnostics - Click to Expand"
        >
          <div className="flex items-center gap-1.5 text-cyan-400 font-bold">
            <Activity className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
            <span>DEV DIAGNOSTICS</span>
          </div>
          <div className="h-3.5 w-px bg-slate-800" />
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <span>
              API Latency: <strong className="text-emerald-400 font-bold">{summary.lastMs}ms</strong>
            </span>
            <span>·</span>
            <span>
              Render: <strong className="text-cyan-300 font-bold">{componentRenderMs}ms</strong>
            </span>
            <span>·</span>
            <span>
              Heap: <strong className="text-purple-300 font-bold">{memoryStats.usedMB}MB</strong>
            </span>
            <span>·</span>
            <span>
              FPS: <strong className="text-amber-300 font-bold">{fps}</strong>
            </span>
          </div>
          <Maximize2 className="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-400 transition-colors" />
        </button>
      )}

      {/* Expanded Performance Diagnostic HUD Modal */}
      {isExpanded && (
        <div className="w-[380px] sm:w-[420px] rounded-3xl bg-slate-900/95 border border-slate-700/60 shadow-[0_25px_80px_rgba(0,0,0,0.85)] backdrop-blur-2xl p-5 text-slate-100 space-y-4 relative overflow-hidden animate-fadeIn">
          {/* Top spotlight glow */}
          <div className="pointer-events-none absolute -top-16 left-1/2 -translate-x-1/2 w-64 h-32 bg-cyan-500/15 blur-3xl rounded-full" />

          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-cyan-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                NOVA AI Dev Diagnostics & Performance HUD
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <Minimize2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Core Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {/* API Latency */}
            <div className="p-2.5 rounded-2xl bg-slate-950/80 border border-slate-800/80 space-y-1">
              <div className="flex items-center justify-between text-[9px] text-slate-500 uppercase">
                <span>Avg Latency</span>
                <Zap className="w-3 h-3 text-cyan-400" />
              </div>
              <div className="text-xs font-bold text-cyan-300">{summary.avgMs} ms</div>
              <div className="text-[9px] text-slate-400">Last: {summary.lastMs}ms</div>
            </div>

            {/* Component Render Time */}
            <div className="p-2.5 rounded-2xl bg-slate-950/80 border border-slate-800/80 space-y-1">
              <div className="flex items-center justify-between text-[9px] text-slate-500 uppercase">
                <span>Render Time</span>
                <Clock className="w-3 h-3 text-emerald-400" />
              </div>
              <div className="text-xs font-bold text-emerald-300">{componentRenderMs} ms</div>
              <div className="text-[9px] text-slate-400">Renders: #{renderCount}</div>
            </div>

            {/* JS Heap Memory */}
            <div className="p-2.5 rounded-2xl bg-slate-950/80 border border-slate-800/80 space-y-1">
              <div className="flex items-center justify-between text-[9px] text-slate-500 uppercase">
                <span>JS Heap</span>
                <HardDrive className="w-3 h-3 text-purple-400" />
              </div>
              <div className="text-xs font-bold text-purple-300">{memoryStats.usedMB} MB</div>
              <div className="text-[9px] text-slate-400">{memoryStats.percent}% Limit</div>
            </div>

            {/* Frame Rate */}
            <div className="p-2.5 rounded-2xl bg-slate-950/80 border border-slate-800/80 space-y-1">
              <div className="flex items-center justify-between text-[9px] text-slate-500 uppercase">
                <span>Render FPS</span>
                <Gauge className="w-3 h-3 text-amber-400" />
              </div>
              <div className="text-xs font-bold text-amber-300">{fps} FPS</div>
              <div className="text-[9px] text-slate-400">{domCount} DOM Nodes</div>
            </div>
          </div>

          {/* Dataset Capacity Health Bar */}
          <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-400 font-semibold flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-emerald-400" />
                Large Dataset Capacity Health:
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold">
                1.48M Samples Ready
              </span>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 rounded-full w-[94%]" />
            </div>
          </div>

          {/* Recent API Latency Stream */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span className="font-semibold uppercase tracking-wider text-[10px]">
                API Latency Stream ({summary.total} Calls Recorded)
              </span>
              <span className="text-[10px] text-slate-500">Auto-Refreshed</span>
            </div>

            <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1 font-mono text-[11px]">
              {metrics.length === 0 ? (
                <div className="p-3 text-center text-slate-500 bg-slate-950/40 rounded-xl">
                  ยังไม่มีประวัติการเรียก API...
                </div>
              ) : (
                metrics.slice(0, 8).map((m: ApiMetricRecord) => (
                  <div
                    key={m.id}
                    className="p-2 rounded-xl bg-slate-950/70 border border-slate-800/60 flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-800 text-slate-300">
                        {m.method}
                      </span>
                      <span className="truncate text-slate-300 text-[10px]">{m.url}</span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-slate-500">{m.timestamp}</span>
                      <span
                        className={`font-bold ${
                          m.durationMs > 100
                            ? 'text-amber-400'
                            : m.status === 'ERROR'
                            ? 'text-rose-400'
                            : 'text-emerald-400'
                        }`}
                      >
                        {m.durationMs}ms
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Footer note */}
          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-500">
            <span>Fail-Closed Read-Only Diagnostics</span>
            <span className="text-cyan-400 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Active
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
