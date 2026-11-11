import React, { useState, useEffect } from 'react';
import { novaApi } from '../../api/apiClient';
import { InfrastructureHealthResponse } from '../../api/types';
import ReadonlySafetyBadge from '../common/ReadonlySafetyBadge';
import { LoadingSpinner, ErrorView } from '../common/StateViews';
import {
  Server,
  ShieldCheck,
  Lock,
  Cpu,
  Database,
  Radio,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Zap,
  Terminal,
  Activity,
  GitBranch,
} from 'lucide-react';

export default function TradingInfrastructureView() {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [infraData, setInfraData] = useState<InfrastructureHealthResponse | null>(null);

  const fetchInfra = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await novaApi.getInfrastructureHealth();
      setInfraData(res);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch infrastructure health');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInfra();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <ReadonlySafetyBadge />
        <LoadingSpinner label="กำลังตรวจสอบสถานะโครงสร้างพื้นฐานระบบ (MT5, Exness Demo, Risk Engine, Data Pipeline)..." />
      </div>
    );
  }

  if (error || !infraData) {
    return (
      <div className="space-y-6">
        <ReadonlySafetyBadge />
        <ErrorView error={error || 'Failed to load infrastructure data'} onRetry={fetchInfra} />
      </div>
    );
  }

  return (
    <div className="space-y-6 text-slate-100">
      {/* 1. Mandatory Safety Banner */}
      <ReadonlySafetyBadge />

      {/* 2. Top Header & Global Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-slate-800 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5 text-cyan-400" />
            <h2 className="text-base sm:text-lg font-bold text-white tracking-wide">
              Trading Infrastructure & System Health (โครงสร้างพื้นฐานระบบ)
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            สถานะการเชื่อมต่อ MetaTrader 5, Exness Demo Catalogue, Rule-Based Risk Engine และ Data Pipeline
          </p>
        </div>

        <button
          type="button"
          onClick={fetchInfra}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-200 border border-slate-700 transition-colors self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          ตรวจสอบสถานะสด
        </button>
      </div>

      {/* 3. 6 Core Infrastructure Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* Card 1: MT5 Connection Status */}
        <div className="bg-[#0D111A] border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-300 font-mono uppercase flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-cyan-400" />
                1. MT5 Connection Status
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/15 border border-cyan-500/30 text-cyan-400">
                {infraData.mt5Connection.status}
              </span>
            </div>

            <h3 className="text-sm font-bold text-white mb-2">{infraData.mt5Connection.target}</h3>

            <div className="space-y-2 text-xs font-mono text-slate-400 bg-slate-900/70 p-3 rounded-xl border border-slate-800">
              <div className="flex justify-between">
                <span>Terminal Server:</span>
                <span className="text-slate-200">{infraData.mt5Connection.server ?? 'Not verified'}</span>
              </div>
              <div className="flex justify-between">
                <span>Network Latency:</span>
                <span className="text-emerald-400 font-bold">{infraData.mt5Connection.latencyMs === null ? 'Not measured' : infraData.mt5Connection.latencyMs + ' ms'}</span>
              </div>
              <div className="flex justify-between">
                <span>Account Mode:</span>
                <span className="text-cyan-300">{infraData.mt5Connection.accountClass ?? 'Not verified'}</span>
              </div>
              <div className="flex justify-between">
                <span>Order Execution:</span>
                <span className="text-rose-400 font-bold">HARD BLOCKED (Fail-Closed)</span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center gap-2 text-[11px] text-emerald-400 font-mono">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Credential isolation not verified (no broker session)</span>
          </div>
        </div>

        {/* Card 2: Exness Demo Connection */}
        <div className="bg-[#0D111A] border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-300 font-mono uppercase flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                2. Exness Demo Target
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                READ-ONLY CATALOGUE
              </span>
            </div>

            <h3 className="text-sm font-bold text-white mb-2">Exness MT5 Demo Feed Gateway</h3>

            <div className="space-y-2 text-xs font-mono text-slate-400 bg-slate-900/70 p-3 rounded-xl border border-slate-800">
              <div className="flex justify-between">
                <span>Protocol:</span>
                <span className="text-slate-200">{infraData.brokerConnector.protocol}</span>
              </div>
              <div className="flex justify-between">
                <span>Credentials Saved:</span>
                <span className="text-slate-400 font-bold">Not verified</span>
              </div>
              <div className="flex justify-between">
                <span>Real Money Fund:</span>
                <span className="text-slate-400">Not queried (no session)</span>
              </div>
              <div className="flex justify-between">
                <span>Live Orders:</span>
                <span className="text-rose-400 font-bold">DISABLED</span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 font-mono flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-rose-400" />
            <span>ไม่รับและไม่แสดง Password/Secrets</span>
          </div>
        </div>

        {/* Card 3: Broker Connector */}
        <div className="bg-[#0D111A] border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-300 font-mono uppercase flex items-center gap-1.5">
                <GitBranch className="w-3.5 h-3.5 text-indigo-400" />
                3. Broker Connector
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-500/15 border border-indigo-500/30 text-indigo-400">
                EXNESS DEMO ONLY
              </span>
            </div>

            <h3 className="text-sm font-bold text-white mb-2">{infraData.brokerConnector.selectedBroker}</h3>

            <div className="space-y-2 text-xs font-mono text-slate-400 bg-slate-900/70 p-3 rounded-xl border border-slate-800">
              <div>
                <span className="text-[10px] text-slate-500 block mb-1">Supported Gateways:</span>
                <div className="flex flex-wrap gap-1">
                  {infraData.brokerConnector.supportedBrokers.map((b, i) => (
                    <span key={i} className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-300">
                      {b}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex justify-between pt-1">
                <span>Direct API Feed:</span>
                <span className="text-slate-400 font-bold">{infraData.brokerConnector.directApiAvailable ? 'AVAILABLE' : 'NOT AVAILABLE'}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-cyan-400 font-mono">
            Protocol: {infraData.brokerConnector.protocol}
          </div>
        </div>

        {/* Card 4: Risk Engine */}
        <div className="bg-[#0D111A] border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-300 font-mono uppercase flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                4. Risk Policy / Fail-Closed Guard
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/15 border border-amber-500/30 text-amber-400">
                POLICY NOT ENFORCED
              </span>
            </div>

            <h3 className="text-sm font-bold text-white mb-2">Policy configured; runtime enforcement not verified</h3>

            <div className="space-y-2 text-xs font-mono text-slate-400 bg-slate-900/70 p-3 rounded-xl border border-slate-800">
              <div className="flex justify-between">
                <span>Max Drawdown Ceiling:</span>
                <span className="text-slate-200 font-bold">{infraData.riskEngine.maxDrawdownCapPct === null ? 'Not configured' : infraData.riskEngine.maxDrawdownCapPct + '% Max'}</span>
              </div>
              <div className="flex justify-between">
                <span>Max Lot Size Ceiling:</span>
                <span className="text-slate-200 font-bold">{infraData.riskEngine.maxLotSizeLimit === null ? 'Not configured' : infraData.riskEngine.maxLotSizeLimit + ' Lots'}</span>
              </div>
              <div className="flex justify-between">
                <span>Max Margin Usage:</span>
                <span className="text-slate-200 font-bold">{infraData.riskEngine.maxMarginUsageLimitPct === null ? 'Not configured' : infraData.riskEngine.maxMarginUsageLimitPct + '% Max'}</span>
              </div>
              <div className="flex justify-between">
                <span>Max Risk Per Trade (configured):</span>
                <span className="text-slate-200 font-bold">{infraData.riskEngine.maxRiskPerTradeLimitPct}% Max · policy only</span>
              </div>              <div className="flex justify-between">
                <span>Max Open Risk (configured):</span>
                <span className="text-slate-200 font-bold">{infraData.riskEngine.maxOpenRiskPct}% · policy only</span>
              </div>
              <div className="flex justify-between">
                <span>Daily Loss Limit (configured):</span>
                <span className="text-slate-200 font-bold">{infraData.riskEngine.dailyLossLimitPct}% · policy only</span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-rose-400 font-mono flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" />
            <span>Broker writes: API fail-closed · policy enforcement not verified</span>
          </div>
        </div>

        {/* Card 5: Data Pipeline */}
        <div className="bg-[#0D111A] border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-300 font-mono uppercase flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-emerald-400" />
                5. Data Pipeline
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                {infraData.dataPipeline.status}
              </span>
            </div>

            <h3 className="text-sm font-bold text-white mb-2">Real-Time Ingestion & Buffer</h3>

            <div className="space-y-2 text-xs font-mono text-slate-400 bg-slate-900/70 p-3 rounded-xl border border-slate-800">
              <div className="flex justify-between">
                <span>Tick Ingestion Rate:</span>
                <span className="text-cyan-400 font-bold">{infraData.dataPipeline.tickIngestionRatePerSec === null ? 'Not verified' : infraData.dataPipeline.tickIngestionRatePerSec + ' ticks/s'}</span>
              </div>
              <div className="flex justify-between">
                <span>Redis Buffer Hit Rate:</span>
                <span className="text-emerald-400 font-bold">{infraData.dataPipeline.redisBufferHitRatePct === null ? 'Not verified' : infraData.dataPipeline.redisBufferHitRatePct + '%'}</span>
              </div>
              <div className="flex justify-between">
                <span>Feature Store Latency:</span>
                <span className="text-slate-200 font-bold">{infraData.dataPipeline.featureStoreLatencyMs === null ? 'Not verified' : infraData.dataPipeline.featureStoreLatencyMs + ' ms'}</span>
              </div>
              <div className="flex justify-between">
                <span>Schema Validation:</span>
                <span className="text-emerald-400 font-bold">{infraData.dataPipeline.schemaValidationPassPct === null ? 'Not verified' : infraData.dataPipeline.schemaValidationPassPct + '% Pass'}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 font-mono flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Pipeline telemetry not connected</span>
          </div>
        </div>

        {/* Card 6: Model Training Status */}
        <div className="bg-[#0D111A] border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-300 font-mono uppercase flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-purple-400" />
                6. Model Training Status
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-500/15 border border-purple-500/30 text-purple-400">
                {infraData.modelTrainingStatus.status}
              </span>
            </div>

            <h3 className="text-sm font-bold text-white mb-2">Autonomous Quant Training Daemon</h3>

            <div className="space-y-2 text-xs font-mono text-slate-400 bg-slate-900/70 p-3 rounded-xl border border-slate-800">
              <div className="flex justify-between">
                <span>Active Epoch:</span>
                <span className="text-purple-300 font-bold">{infraData.modelTrainingStatus.epoch === null ? 'Not available' : 'Epoch #' + infraData.modelTrainingStatus.epoch}</span>
              </div>
              <div className="flex justify-between">
                <span>Active Monitored Pair:</span>
                <span className="text-cyan-300 font-bold">{infraData.modelTrainingStatus.activePair ?? 'Not available'}</span>
              </div>
              <div className="flex justify-between">
                <span>Samples Ingested:</span>
                <span className="text-slate-200">{infraData.modelTrainingStatus.samplesIngested === null ? 'Not verified' : infraData.modelTrainingStatus.samplesIngested.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Validation Accuracy:</span>
                <span className="text-emerald-400 font-bold">{infraData.modelTrainingStatus.lastValidationAccPct === null ? 'Not verified' : infraData.modelTrainingStatus.lastValidationAccPct + '%'}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 font-mono">
            Last Cycle: {infraData.modelTrainingStatus.lastTrainedAt ? new Date(infraData.modelTrainingStatus.lastTrainedAt).toLocaleTimeString() : 'No verified training run'}
          </div>
        </div>
      </div>
    </div>
  );
}

[executed on device: 10_0_16_116 (1b921001-c4e2-479a-8a95-7345393686dd)]