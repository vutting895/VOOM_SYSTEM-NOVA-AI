import React, { useEffect, useState } from 'react';
import { Cpu, RefreshCw, ShieldCheck, Activity } from 'lucide-react';
import ReadonlySafetyBadge from '../common/ReadonlySafetyBadge';
import { LoadingSpinner, ErrorView } from '../common/StateViews';
import { datacenterResearchService, type DatacenterModel } from '../../services/datacenterResearchService';

export default function TradingIntelligenceView() {
  const [models, setModels] = useState<DatacenterModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadModels = async () => {
    try {
      setLoading(true);
      setError(null);
      setModels(await datacenterResearchService.listModels());
    } catch (err: any) {
      setError(err?.message || 'Unable to load Datacenter Model Registry');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadModels(); }, []);

  if (loading) return <div className="space-y-6"><ReadonlySafetyBadge /><LoadingSpinner label="Loading persisted Datacenter model registry..." /></div>;
  if (error) return <div className="space-y-6"><ReadonlySafetyBadge /><ErrorView error={error} onRetry={loadModels} /></div>;

  return (
    <div className="space-y-6 text-slate-100">
      <ReadonlySafetyBadge />
      <section className="rounded-2xl border border-slate-800 bg-[#0D111A] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-white"><Cpu className="h-5 w-5 text-indigo-400" />Datacenter Model Registry</h2>
            <p className="mt-1 text-xs text-slate-400">แสดงเฉพาะ Model Artifact และ Evaluation ที่ถูกบันทึกจริงใน Datacenter ไม่มีค่าความแม่นยำจำลอง</p>
          </div>
          <button type="button" onClick={loadModels} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:border-cyan-500">
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3"><span className="block text-[10px] uppercase text-slate-500">Registered Models</span><span className="mt-1 block text-xl font-bold">{models.length}</span></div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3"><span className="block text-[10px] uppercase text-slate-500">Approved</span><span className="mt-1 block text-xl font-bold">{models.filter((model) => model.approval_status === 'approved').length}</span></div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3"><span className="block text-[10px] uppercase text-slate-500">Deployment Eligible</span><span className="mt-1 block text-xl font-bold">{models.filter((model) => model.deployment_eligible).length}</span></div>
        </div>
      </section>

      {models.length === 0 ? (
        <section className="rounded-2xl border border-slate-800 bg-[#0D111A] p-8 text-center">
          <Activity className="mx-auto mb-3 h-8 w-8 text-slate-600" />
          <h3 className="text-sm font-semibold text-slate-300">No registered model artifacts</h3>
          <p className="mt-2 text-xs text-slate-500">Complete an approved Datacenter training job before model performance can be reported here.</p>
        </section>
      ) : (
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {models.map((model) => (
            <article key={model.model_id} className="rounded-2xl border border-slate-800 bg-[#0D111A] p-5 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <span className="text-[10px] uppercase text-slate-500">{model.model_family} · {model.task_type}</span>
                  <h3 className="mt-1 text-sm font-bold text-white">{model.name} · v{model.version}</h3>
                  <p className="mt-1 text-[10px] text-slate-500">Model ID: {model.model_id}</p>
                </div>
                <span className={model.approval_status === 'approved' ? 'text-xs text-emerald-400' : 'text-xs text-amber-300'}>{model.approval_status}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(model.metrics || {}).map(([key, value]) => (
                  <div key={key} className="rounded-lg border border-slate-800 bg-slate-900/70 p-2">
                    <span className="block text-[10px] text-slate-500">{key}</span>
                    <span className="text-sm font-semibold text-slate-200">{typeof value === 'number' ? value.toFixed(5) : String(value)}</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-3 text-[11px]">
                <span className="text-slate-400">Evaluation Gate: {model.gates.passed ? 'PASSED' : 'NOT PASSED'}</span>
                <span className={model.deployment_eligible ? 'text-emerald-400' : 'text-amber-300'}>Deployment eligible: {model.deployment_eligible ? 'YES' : 'NO'}</span>
              </div>
              <div className="flex items-start gap-2 text-[10px] text-slate-500">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Approval is a research registry state only. It does not enable NOVA or broker execution.
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
