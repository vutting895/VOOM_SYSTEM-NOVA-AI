import React, { useState } from 'react';
import {
  Lock,
  ShieldAlert,
  ShieldCheck,
  X,
  Radio,
  ExternalLink,
  CheckCircle2,
  Server,
  Zap,
  ArrowRight,
} from 'lucide-react';

interface BrokerConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function BrokerConnectionModal({ isOpen, onClose }: BrokerConnectionModalProps) {
  const [selectedBroker, setSelectedBroker] = useState<'exness' | 'icmarkets'>('exness');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authSuccess, setAuthSuccess] = useState(false);

  if (!isOpen) return null;

  const handleAuthorize = () => {
    setIsAuthenticating(true);
    setTimeout(() => {
      setIsAuthenticating(false);
      setAuthSuccess(true);
      setTimeout(() => {
        setAuthSuccess(false);
        onClose();
      }, 1400);
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xl transition-all duration-300">
      {/* Outer ambient glow */}
      <div className="pointer-events-none absolute w-[450px] h-[450px] rounded-full bg-gradient-to-tr from-cyan-500/15 via-indigo-500/10 to-transparent blur-[140px]" />

      {/* Main Glassmorphic Modal Card */}
      <div className="relative w-full max-w-lg rounded-3xl bg-slate-900/80 border border-slate-700/50 p-6 sm:p-8 shadow-[0_25px_90px_rgba(0,0,0,0.85)] backdrop-blur-2xl text-slate-100 overflow-hidden">
        {/* Top subtle radial spotlight */}
        <div className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 w-80 h-40 bg-cyan-500/15 blur-3xl rounded-full" />

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full bg-slate-800/60 border border-slate-700/50 text-slate-400 hover:text-white hover:bg-slate-700/60 transition-all z-10"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header Section */}
        <div className="text-center relative z-10 space-y-2 mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500/20 via-indigo-500/10 to-slate-800 border border-cyan-500/30 text-cyan-400 shadow-lg shadow-cyan-500/10 mb-1">
            <Lock className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center justify-center gap-2">
            Secure Broker Gateway
          </h2>
          <p className="text-xs text-slate-400 max-w-xs mx-auto">
            เชื่อมต่อกับโกลบอลโบรกเกอร์ผ่านโหมด Read-Only เพื่อดึงราคาและสัญญาณตลาดสด
          </p>
        </div>

        {/* Broker Selector Pills */}
        <div className="relative z-10 grid grid-cols-2 gap-3 mb-5">
          <button
            type="button"
            onClick={() => setSelectedBroker('exness')}
            className={`p-3.5 rounded-2xl border text-left transition-all relative overflow-hidden ${
              selectedBroker === 'exness'
                ? 'bg-gradient-to-br from-slate-800/90 to-cyan-950/40 border-cyan-500/60 shadow-lg shadow-cyan-500/10 ring-1 ring-cyan-500/30'
                : 'bg-slate-900/50 border-slate-800 hover:border-slate-700 hover:bg-slate-850/60'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-white">Exness Demo</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <span className="text-[10px] text-slate-400 font-mono block">MT5 Read-Only Feed</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedBroker('icmarkets')}
            className={`p-3.5 rounded-2xl border text-left transition-all relative overflow-hidden ${
              selectedBroker === 'icmarkets'
                ? 'bg-gradient-to-br from-slate-800/90 to-indigo-950/40 border-indigo-500/60 shadow-lg shadow-indigo-500/10 ring-1 ring-indigo-500/30'
                : 'bg-slate-900/50 border-slate-800 hover:border-slate-700 hover:bg-slate-850/60'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-white">IC Markets</span>
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
            </div>
            <span className="text-[10px] text-slate-400 font-mono block">cTrader REST API</span>
          </button>
        </div>

        {/* Connection Specs Box */}
        <div className="relative z-10 bg-slate-950/70 border border-slate-800 rounded-2xl p-4 mb-5 space-y-2.5 text-xs font-mono text-slate-300">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 text-[11px]">Target Environment:</span>
            <span className="text-emerald-400 font-semibold flex items-center gap-1">
              <Radio className="w-3 h-3 animate-pulse" />
              {selectedBroker === 'exness' ? 'Exness-MT5Trial12' : 'ICMarkets-Direct Gateway'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500 text-[11px]">Permission Class:</span>
            <span className="text-cyan-300">Read-Only Market Data & Signals</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500 text-[11px]">Execution Status:</span>
            <span className="text-rose-400 font-bold">HARD DISABLED (Fail-Closed)</span>
          </div>
        </div>

        {/* Safety & Zero-Knowledge Disclaimer */}
        <div className="relative z-10 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs leading-relaxed mb-6 flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-[11px] font-mono">
            <span className="font-bold block text-amber-200 mb-0.5">ระบบความปลอดภัยระดับสถาบัน:</span>
            ระบบ NOVA AI ทำงานในโหมด Read-Only เท่านั้น จะไม่มีการร้องขอ หรือจัดเก็บรหัสผ่าน และ API Secret ของโบรกเกอร์ในฝั่ง Frontend
          </div>
        </div>

        {/* Primary Authorize Button */}
        <button
          type="button"
          onClick={handleAuthorize}
          disabled={isAuthenticating || authSuccess}
          className="relative z-10 w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:via-blue-500 hover:to-indigo-500 text-slate-950 font-bold text-sm shadow-xl shadow-cyan-500/20 transition-all flex items-center justify-center gap-2 group disabled:opacity-75"
        >
          {isAuthenticating ? (
            <>
              <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
              <span>กำลังตรวจสอบการเชื่อมต่อ OAuth...</span>
            </>
          ) : authSuccess ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-slate-950" />
              <span>เชื่อมต่อโหมด Read-Only สำเร็จ!</span>
            </>
          ) : (
            <>
              <ShieldCheck className="w-4 h-4" />
              <span>Authorize {selectedBroker === 'exness' ? 'Exness Demo' : 'IC Markets'} Connection</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </>
          )}
        </button>

        {/* Footer Subtext */}
        <div className="mt-4 text-center text-[10px] text-slate-500 font-mono relative z-10">
          NOVA AI Infrastructure · OAuth 2.0 Tenant-Isolated Session
        </div>
      </div>
    </div>
  );
}
