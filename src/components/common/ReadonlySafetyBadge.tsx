import React from 'react';
import { ShieldCheck, Lock, AlertTriangle, Radio } from 'lucide-react';

interface ReadonlySafetyBadgeProps {
  compact?: boolean;
}

export default function ReadonlySafetyBadge({ compact = false }: ReadonlySafetyBadgeProps) {
  if (compact) {
    return (
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs font-medium text-emerald-400">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        <span className="font-mono uppercase tracking-wider">READ-ONLY · LIVE TRADING OFF</span>
      </div>
    );
  }

  return (
    <div className="w-full bg-slate-900/90 border border-emerald-500/20 backdrop-blur-md px-4 py-2.5 rounded-xl shadow-lg flex flex-wrap items-center justify-between gap-3 text-xs text-slate-300">
      <div className="flex items-center gap-2.5 flex-wrap">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-semibold uppercase tracking-wider font-mono">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>READ-ONLY MODE</span>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-500/15 border border-rose-500/30 text-rose-300 font-semibold uppercase tracking-wider font-mono">
          <Lock className="w-3.5 h-3.5 text-rose-400" />
          <span>LIVE TRADING: OFF</span>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 font-mono">
          <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
          <span>TARGET: EXNESS MT5 DEMO (READ-ONLY)</span>
        </div>
      </div>

      <div className="flex items-center gap-2 text-slate-400 font-mono text-[11px]">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-400/80" />
        <span>ระบบวิจัยเชิงปริมาณ · ปลอดภัย ไม่มีการจัดเก็บ Broker Password/Secret</span>
      </div>
    </div>
  );
}
