import React, { useState, useEffect } from 'react';
import { novaApi } from '../../api/apiClient';
import { IntelligenceResponse, IntelligenceModelStatus } from '../../api/types';
import ReadonlySafetyBadge from '../common/ReadonlySafetyBadge';
import { LoadingSpinner, ErrorView } from '../common/StateViews';
import {
  Cpu,
  Activity,
  Layers,
  Brain,
  Zap,
  TrendingUp,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Sparkles,
  BarChart,
  RefreshCw,
} from 'lucide-react';

export default function TradingIntelligenceView() {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [intelData, setIntelData] = useState<IntelligenceResponse | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string>('elliott-wave-3');

  const fetchIntel = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await novaApi.getIntelligenceModels();
      setIntelData(res);
    } catch (err: any) {
      setError(err?.message || 'Failed to load intelligence models');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIntel();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <ReadonlySafetyBadge />
        <LoadingSpinner label="กำลังเชื่อมต่อโมเดลปัญญาประดิษฐ์ (Elliott Wave 3, XGBoost, LSTM, SMC, Auto-Learning, Neural Net)..." />
      </div>
    );
  }

  if (error || !intelData) {
    return (
      <div className="space-y-6">
        <ReadonlySafetyBadge />
        <ErrorView error={error || 'Failed to receive intelligence data'} onRetry={fetchIntel} />
      </div>
    );
  }

  if (intelData.models.length === 0) {
    return (
      <div className="space-y-6 text-slate-100">
        <ReadonlySafetyBadge />
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6 space-y-2">
          <h2 className="text-lg font-bold text-amber-200">AI Models Not Configured</h2>
          <p className="text-sm text-slate-300">No verified model artifacts or inference runtime are connected. Accuracy, latency, ensemble confidence, and market-regime claims are intentionally unavailable.</p>
          <p className="text-xs text-slate-400">Connect a provenance-backed model and evaluation pipeline before displaying predictions.</p>
        </div>
      </div>
    );
  }

  const selectedModel =
    intelData.models.find((m) => m.id === selectedModelId) || intelData.models[0];

  return (
    <div className="space-y-6 text-slate-100">
      {/* 1. Safety Status Banner */}
      <ReadonlySafetyBadge />

      {/* 2. Top Summary Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-500/30 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-indigo-400" />
              <h2 className="text-lg font-bold text-white tracking-wide">
                Trading Intelligence & Neural Analysis
              </h2>
            </div>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              สถาปัตยกรรมโมเดลควอนต์ 6 ระดับ: ประมวลผลคลื่นเอลเลียตเวฟ, ต้นไม้การตัดสินใจ XGBoost, ลำดับเวลา LSTM บน PyTorch, กลไกสภาพคล่อง SMC, ระบบเรียนรู้อัตโนมัติ Auto-Learning และเครือข่ายประสาทเทียม
            </p>
            <div className="flex flex-wrap gap-1.5 pt-2">
              <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono">1. Elliott Wave 3</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono">2. XGBoost</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono">3. LSTM / PyTorch</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-mono">4. Smart Money Concepts (SMC)</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono">5. Auto-Learning</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono">6. Neural Network Analysis</span>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-slate-900/80 p-3 rounded-xl border border-slate-800 self-start md:self-auto">
            <div>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-mono">
                Ensemble Confidence
              </span>
              <span className="text-base font-bold font-mono text-cyan-400">
                {intelData.ensembleConfidencePct}%
              </span>
            </div>
            <div className="h-8 w-px bg-slate-800" />
            <div>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-mono">
                Active Models
              </span>
              <span className="text-base font-bold font-mono text-emerald-400">
                6 / 6 Online
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. 6 Model Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {intelData.models.map((model) => {
          const isSelected = model.id === selectedModelId;
          return (
            <button
              key={model.id}
              type="button"
              onClick={() => setSelectedModelId(model.id)}
              className={`text-left p-5 rounded-2xl border transition-all relative overflow-hidden flex flex-col justify-between ${
                isSelected
                  ? 'bg-slate-900/95 border-indigo-500 shadow-xl shadow-indigo-500/10 ring-1 ring-indigo-500/50'
                  : 'bg-[#0D111A] border-slate-800 hover:border-slate-700 hover:bg-slate-850'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-slate-800 text-slate-400 border border-slate-700">
                    {model.tag}
                  </span>
                  <span className="flex items-center gap-1 text-[11px] font-mono text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    {model.status}
                  </span>
                </div>

                <h3 className="text-sm font-bold text-white group-hover:text-cyan-400 transition-colors">
                  {model.name}
                </h3>

                <div className="mt-4 grid grid-cols-2 gap-2 bg-slate-900/70 p-3 rounded-xl border border-slate-800/80">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-mono">
                      {model.primaryMetricLabel}
                    </span>
                    <span className="text-xs font-mono font-bold text-indigo-300">
                      {model.primaryMetricValue}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-mono">
                      Accuracy / Latency
                    </span>
                    <span className="text-xs font-mono font-bold text-slate-300">
                      {model.accuracyPct}% · {model.latencyMs}ms
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between">
                <span>คลิกเพื่อดูโครงสร้างพารามิเตอร์</span>
                <span className="text-cyan-400 font-mono">Inspect →</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* 4. Deep Inspection Panel for Selected Model */}
      <div className="bg-[#0D111A] border border-slate-800 rounded-2xl p-6 shadow-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800 gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-400" />
              <h3 className="text-base font-bold text-white tracking-wide">
                Deep Model Inspection: {selectedModel.name}
              </h3>
            </div>
            <p className="text-xs text-slate-400 mt-1 font-mono">
              Architecture ID: <span className="text-slate-200">{selectedModel.id}</span> · Inference Latency: <span className="text-cyan-400">{selectedModel.latencyMs} ms</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono">
              Status: {selectedModel.status}
            </span>
            <span className="text-xs px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 font-mono">
              Validation: {selectedModel.accuracyPct}%
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          {/* Left: Highlights and Confluences */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
              Key Signal Factors & Technical Findings (ปัจจัยสำคัญของสัญญาณ)
            </h4>
            <div className="space-y-2.5">
              {selectedModel.highlights.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 text-xs text-slate-300"
                >
                  <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Technical Parameters JSON / State Dump */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
              Engine State & Hyperparameters (ข้อมูลพารามิเตอร์ของโมเดล)
            </h4>
            <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 font-mono text-xs text-cyan-300 overflow-x-auto">
              <pre className="text-[12px] leading-relaxed">
                {JSON.stringify(selectedModel.details, null, 2)}
              </pre>
            </div>

            <div className="p-3 rounded-xl bg-indigo-950/30 border border-indigo-500/20 text-[11px] text-indigo-300 flex items-start gap-2 font-mono">
              <ShieldCheck className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
              <span>
                Safety Constraint: ข้อมูลการวิเคราะห์ทั้งหมดส่งผ่าน Read-Only Intent Envelope ไม่มีสิทธิ์สั่งเทรดตรงสู่โบรกเกอร์
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

[executed on device: 10_0_16_116 (1b921001-c4e2-479a-8a95-7345393686dd)]