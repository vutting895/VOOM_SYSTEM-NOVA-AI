import React, { useState, useEffect } from 'react';
import { novaApi } from '../../api/apiClient';
import { LearningUniverseResponse } from '../../api/types';
import ReadonlySafetyBadge from '../common/ReadonlySafetyBadge';
import { LoadingSpinner, ErrorView } from '../common/StateViews';
import {
  Database,
  Layers,
  Activity,
  Calendar,
  CheckCircle2,
  Clock,
  Sparkles,
  BarChart3,
  RefreshCw,
  Cpu,
  ShieldCheck,
  Zap,
} from 'lucide-react';

export default function LearningUniverseView() {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [learningData, setLearningData] = useState<LearningUniverseResponse | null>(null);
  const [triggering, setTriggering] = useState<boolean>(false);
  const [triggerMsg, setTriggerMsg] = useState<string | null>(null);

  const fetchLearningData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await novaApi.getLearningUniverse();
      setLearningData(res);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch learning universe data');
    } finally {
      setLoading(false);
    }
  };

  const handleManualTrigger = async (pair: string) => {
    try {
      setTriggering(true);
      const res = await novaApi.triggerAutoTrain(pair);
      setTriggerMsg(res.statusNotification || `เริ่มกระบวนการเทรน ${pair} สำเร็จ`);
      await fetchLearningData();
    } catch (err: any) {
      setTriggerMsg(`Trigger failed: ${err?.message || err}`);
    } finally {
      setTriggering(false);
    }
  };

  useEffect(() => {
    fetchLearningData();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <ReadonlySafetyBadge />
        <LoadingSpinner label="กำลังโหลดข้อมูล Learning Universe (Dataset, Model Performance, Training History)..." />
      </div>
    );
  }

  if (error || !learningData) {
    return (
      <div className="space-y-6">
        <ReadonlySafetyBadge />
        <ErrorView error={error || 'Failed to load learning universe'} onRetry={fetchLearningData} />
      </div>
    );
  }

  return (
    <div className="space-y-6 text-slate-100">
      {/* 1. Mandatory Safety Banner */}
      <ReadonlySafetyBadge />

      {/* 2. Top Banner & Trigger Controls */}
      <div className="bg-gradient-to-r from-slate-900 via-purple-950/40 to-slate-900 border border-purple-500/30 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-purple-400" />
              <h2 className="text-lg font-bold text-white tracking-wide">
                Learning Universe: Dataset & Model Readiness
              </h2>
            </div>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">Dataset and model metrics appear only after a verified feature store and training runner are connected.</p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => handleManualTrigger('XAU/USDm')}
              disabled={triggering || !learningData.autoUpdateJob.automated}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-lg shadow-purple-600/20 transition-all disabled:opacity-50"
            >
              <Zap className="w-4 h-4 fill-current" />
              {triggering ? "Processing..." : learningData.autoUpdateJob.automated ? "Trigger Train" : "Training Not Configured"}
            </button>
          </div>
        </div>

        {triggerMsg && (
          <div className="mt-4 p-3 bg-purple-950/60 border border-purple-500/40 rounded-xl text-xs font-mono text-purple-200">
            {triggerMsg}
          </div>
        )}
      </div>

      {/* 3. Section 1: Dataset Management */}
      <div className="bg-[#0D111A] border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-2">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Database className="w-4 h-4 text-purple-400" />
              1. Dataset Management & Feature Store
            </h3>
            <span className="text-xs text-slate-400 font-mono">
              Provider: {learningData.featureStore.provider} · Total Samples: {learningData.featureStore.totalSamplesStored.toLocaleString()} Vectors
            </span>
          </div>

          <span className="text-xs px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono self-start sm:self-auto">
            Daily Status: {learningData.featureStore.dailyUpdateStatus}
          </span>
        </div>

        <div>
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block font-mono mb-2">
            Configured Assets (unverified)
          </span>
          <div className="flex flex-wrap gap-2">
            {learningData.featureStore.monitoredSymbols.map((sym) => (
              <span
                key={sym}
                className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono font-medium text-slate-300"
              >
                {sym}
              </span>
            ))}
          </div>
        </div>

        <div>
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block font-mono mb-2">
            Feature Vector Categories (หมวดหมู่ของฟีเจอร์)
          </span>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono">
            {learningData.featureStore.featureCategories.map((cat, i) => (
              <div key={i} className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800 text-slate-300 flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span>{cat}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 4. Section 2: Model Performance by Market Regime */}
      <div className="bg-[#0D111A] border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4">
        <div className="pb-3 border-b border-slate-800">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-cyan-400" />
            2. Model Performance by Market Regime (ประสิทธิภาพตามสภาวะตลาด)
          </h3>
          <span className="text-xs text-slate-400 font-mono">
            การวัดความแม่นยำ F1-Score แยกตามพฤติกรรมความผันผวน
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {learningData.modelPerformanceByRegime.length === 0 ? (<div className="col-span-full p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 text-sm text-amber-200">No verified model evaluation metrics are available.</div>) : learningData.modelPerformanceByRegime.map((regime, i) => (
            <div key={i} className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 flex flex-col justify-between">
              <div>
                <span className="text-xs font-bold text-cyan-300 block mb-1">{regime.regimeName}</span>
                <p className="text-[11px] text-slate-400 leading-relaxed mb-3">{regime.description}</p>
              </div>

              <div className="pt-3 border-t border-slate-800/80 grid grid-cols-2 gap-2 font-mono text-xs">
                <div>
                  <span className="text-[10px] text-slate-500 block">ACCURACY</span>
                  <span className="text-emerald-400 font-bold text-sm">{regime.accuracyPct}%</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">F1-SCORE</span>
                  <span className="text-indigo-300 font-bold text-sm">{regime.f1Score}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 5. Section 3 & 4: Training History & Daily Data Update Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Training History */}
        <div className="bg-[#0D111A] border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4">
          <div className="pb-3 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
              <Cpu className="w-4 h-4 text-emerald-400" />
              3. Continuous Training History (ประวัติการเทรน)
            </h3>
            <span className="text-[11px] text-slate-400 font-mono">Recent Logs</span>
          </div>

          <div className="space-y-3">
            {learningData.trainingHistory.length === 0 ? (<div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 text-sm text-amber-200">No verified training runs are available. Training is not configured.</div>) : learningData.trainingHistory.map((th) => (
              <div key={th.id} className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs font-mono space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">{th.pair} (Epoch #{th.epoch})</span>
                  <span className="text-emerald-400 font-bold">{th.status}</span>
                </div>
                <div className="flex items-center justify-between text-slate-400 text-[11px]">
                  <span>Loss: {th.trainingLoss}</span>
                  <span>Accuracy: {th.validationAccuracyPct}%</span>
                  <span>Duration: {th.durationSec}s</span>
                </div>
                <div className="text-[10px] text-slate-500">
                  {new Date(th.timestamp).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Daily Data Update Status */}
        <div className="bg-[#0D111A] border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4 flex flex-col justify-between">
          <div>
            <div className="pb-3 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
                <Calendar className="w-4 h-4 text-amber-400" />
                4. Daily Data Update Status (สถานะการอัปเดตข้อมูล)
              </h3>
              <span className={`text-xs font-mono ${learningData.autoUpdateJob.automated ? "text-emerald-400" : "text-amber-300"}`}>{learningData.autoUpdateJob.automated ? learningData.autoUpdateJob.healthPct + "% HEALTH" : "NOT CONFIGURED"}</span>
            </div>

            <div className="mt-4 space-y-2.5 text-xs font-mono">
              <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 flex justify-between">
                <span className="text-slate-400">Update Cadence:</span>
                <span className="text-slate-200">{learningData.autoUpdateJob.cadence}</span>
              </div>
              <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 flex justify-between">
                <span className="text-slate-400">Automated Pipeline:</span>
                <span className="text-amber-300 font-bold">{learningData.autoUpdateJob.automated ? "ACTIVE" : "NOT CONFIGURED"}</span>
              </div>
              <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 flex justify-between">
                <span className="text-slate-400">Next Scheduled Sync:</span>
                <span className="text-cyan-300">
                  {learningData.featureStore.nextScheduledUpdateAt ? new Date(learningData.featureStore.nextScheduledUpdateAt).toLocaleTimeString() : 'Not scheduled'}
                </span>
              </div>
            </div>

            <div className="mt-4 space-y-1.5">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-mono block">
                Pipeline Automation Logs
              </span>
              {learningData.autoUpdateJob.logs.map((log, idx) => (
                <div key={idx} className="p-2 rounded bg-slate-950 text-[11px] font-mono text-slate-400 border border-slate-900">
                  › {log}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 font-mono flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Schema validation and data-drift status are unavailable; the pipeline has not run.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
