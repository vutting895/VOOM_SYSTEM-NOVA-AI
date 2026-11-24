import React, { useEffect, useState } from 'react';
import { Database, Layers, Cpu, RefreshCw, Play, ClipboardList, ShieldCheck } from 'lucide-react';
import ReadonlySafetyBadge from '../common/ReadonlySafetyBadge';
import { LoadingSpinner, ErrorView } from '../common/StateViews';
import {
  datacenterResearchService,
  type DatacenterDataset,
  type DatacenterModel,
  type DatacenterUniverse,
} from '../../services/datacenterResearchService';

export default function LearningUniverseView() {
  const [datasets, setDatasets] = useState<DatacenterDataset[]>([]);
  const [universes, setUniverses] = useState<DatacenterUniverse[]>([]);
  const [models, setModels] = useState<DatacenterModel[]>([]);
  const [selectedUniverseId, setSelectedUniverseId] = useState('');
  const [modelFamily, setModelFamily] = useState('');
  const [jobId, setJobId] = useState('');
  const [jobStatus, setJobStatus] = useState<Record<string, any> | null>(null);
  const [jobLogs, setJobLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedUniverse = universes.find((item) => item.universe_id === selectedUniverseId) || null;
  const taskType = selectedUniverse?.definition.task_type;
  const allowedFamilies = taskType === 'classification'
    ? ['logistic_regression', 'random_forest_classifier']
    : taskType === 'regression'
      ? ['ridge', 'random_forest_regressor']
      : [];

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [datasetRows, universeRows, modelRows] = await Promise.all([
        datacenterResearchService.listDatasets(),
        datacenterResearchService.listUniverses(),
        datacenterResearchService.listModels(),
      ]);
      setDatasets(datasetRows);
      setUniverses(universeRows);
      setModels(modelRows);
      setSelectedUniverseId((current) => current && universeRows.some((item) => item.universe_id === current)
        ? current : universeRows[0]?.universe_id || '');
    } catch (err: any) {
      setError(err?.message || 'Unable to load Datacenter Learning registries');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadData(); }, []);

  useEffect(() => {
    if (!allowedFamilies.includes(modelFamily)) setModelFamily(allowedFamilies[0] || '');
  }, [selectedUniverseId, taskType]);

  const submitTraining = async () => {
    if (!selectedUniverse) {
      setError('Select a registered Learning Universe first.');
      return;
    }
    try {
      setSubmitting(true);
      setError(null);
      const definition = selectedUniverse.definition;
      const response = await datacenterResearchService.submitTraining({
        universe_id: selectedUniverse.universe_id,
        universe_version: selectedUniverse.version,
        task_type: definition.task_type,
        label_column: definition.label_column,
        feature_columns: definition.feature_columns,
        model_family: modelFamily,
      });
      if (response.status !== 'accepted' || typeof response.job_id !== 'string') {
        throw new Error(String(response.reason || response.errors?.join(', ') || 'training_job_not_accepted'));
      }
      setJobId(response.job_id);
      setJobStatus(response);
      setJobLogs([]);
    } catch (err: any) {
      setError(err?.message || 'Training job submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const refreshJob = async () => {
    if (!jobId) return;
    try {
      const [status, logs] = await Promise.all([
        datacenterResearchService.getTrainingStatus(jobId),
        datacenterResearchService.getTrainingLogs(jobId),
      ]);
      setJobStatus(status.job || status);
      setJobLogs(Array.isArray(logs.logs) ? logs.logs : []);
      await loadData();
    } catch (err: any) {
      setError(err?.message || 'Unable to refresh training job');
    }
  };

  if (loading) return <div className="space-y-6"><ReadonlySafetyBadge /><LoadingSpinner label="Loading Datacenter Dataset, Universe, and Model registries..." /></div>;
  if (error && !datasets.length && !universes.length && !models.length) {
    return <div className="space-y-6"><ReadonlySafetyBadge /><ErrorView error={error} onRetry={loadData} /></div>;
  }

  return (
    <div className="space-y-6 text-slate-100">
      <ReadonlySafetyBadge />
      <section className="rounded-2xl border border-slate-800 bg-[#0D111A] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-white"><Layers className="h-5 w-5 text-cyan-400" />Datacenter Learning Registry</h2>
            <p className="mt-1 text-xs text-slate-400">สถานะจริงจาก Dataset Registry, Learning Universe และ Model Registry ผ่าน NOVA Remote MCP Gateway</p>
          </div>
          <button type="button" onClick={loadData} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:border-cyan-500 disabled:opacity-50">
            <RefreshCw className="h-4 w-4" /> Refresh Registries
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ['Datasets', datasets.length],
            ['Approved Datasets', datasets.filter((item) => item.status === 'PASSED' && item.approval_status === 'approved').length],
            ['Universes', universes.length],
            ['Registered Models', models.length],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
              <span className="block text-[10px] uppercase text-slate-500">{label}</span>
              <span className="mt-1 block text-xl font-bold text-slate-100">{value}</span>
            </div>
          ))}
        </div>
      </section>

      {error && <ErrorView error={error} onRetry={loadData} />}

      <section className="rounded-2xl border border-slate-800 bg-[#0D111A] p-5 space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-white"><Database className="h-4 w-4 text-cyan-400" />Dataset Registry</h3>
        {datasets.length === 0 ? <p className="text-xs text-slate-500">No datasets registered for this account.</p> : datasets.slice(0, 30).map((dataset) => (
          <div key={dataset.dataset_id + ':' + dataset.version} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-slate-200">{dataset.name} · v{dataset.version}</span>
              <span className={dataset.status === 'PASSED' && dataset.approval_status === 'approved' ? 'text-emerald-400' : 'text-amber-300'}>{dataset.status} / {dataset.approval_status}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-slate-500">
              <span>{dataset.manifest.symbols?.join(', ') || 'No symbol metadata'}</span>
              <span>{dataset.manifest.timeframe || 'Unknown timeframe'}</span>
              <span>{dataset.row_count.toLocaleString()} rows</span>
              <span>SHA-256: {dataset.checksum ? dataset.checksum.slice(0, 12) : 'not available'}</span>
            </div>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-800 bg-[#0D111A] p-5 space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-white"><Layers className="h-4 w-4 text-indigo-400" />Learning Universe Registry</h3>
        {universes.length === 0 ? <p className="text-xs text-slate-500">No Learning Universe has been registered yet.</p> : universes.map((universe) => (
          <div key={universe.universe_id + ':' + universe.version} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-slate-200">{universe.name} · v{universe.version}</span>
              <span className="text-slate-400">{universe.status}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-slate-500">
              <span>Task: {universe.definition.task_type}</span>
              <span>Features: {universe.definition.feature_columns?.length || 0}</span>
              <span>Label: {universe.definition.label_column || '—'}</span>
              <span>Pinned datasets: {universe.definition.datasets?.length || 0}</span>
            </div>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-800 bg-[#0D111A] p-5 space-y-4">
        <div className="flex items-center gap-2"><Play className="h-4 w-4 text-emerald-400" /><h3 className="text-sm font-bold text-white">Submit Real Training Job</h3></div>
        <p className="text-xs text-slate-400">ระบบจะใช้เฉพาะ Dataset ที่ถูก pin ใน Universe และผ่านการอนุมัติ ไม่มี Mock Training หรือการสร้าง Label อัตโนมัติ</p>
        {universes.length === 0 ? <p className="text-xs text-amber-300">Register a valid Learning Universe before submitting a training job.</p> : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="space-y-1 text-xs text-slate-400">Universe
              <select value={selectedUniverseId} onChange={(e) => setSelectedUniverseId(e.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-slate-100">
                {universes.map((item) => <option key={item.universe_id} value={item.universe_id}>{item.name} · v{item.version}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-xs text-slate-400">Model Family
              <select value={modelFamily} onChange={(e) => setModelFamily(e.target.value)} disabled={!allowedFamilies.length} className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-slate-100">
                {allowedFamilies.map((family) => <option key={family} value={family}>{family}</option>)}
              </select>
            </label>
            <div className="flex items-end">
              <button type="button" onClick={submitTraining} disabled={submitting || !selectedUniverse || !modelFamily} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-3 py-2.5 text-xs font-bold text-slate-950 disabled:opacity-40">
                <Play className="h-4 w-4" />{submitting ? 'Submitting…' : 'Submit Training'}
              </button>
            </div>
          </div>
        )}
        {jobId && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-xs space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-slate-300">Job: {jobId}</span>
              <button type="button" onClick={refreshJob} className="inline-flex items-center gap-1 text-cyan-300"><RefreshCw className="h-3 w-3" /> Refresh Job</button>
            </div>
            <pre className="overflow-x-auto text-[11px] text-slate-400">{JSON.stringify(jobStatus, null, 2)}</pre>
            {jobLogs.map((line, index) => <div key={index} className="text-[11px] text-slate-500">› {line}</div>)}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-800 bg-[#0D111A] p-5 space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-white"><Cpu className="h-4 w-4 text-purple-400" />Model Registry</h3>
        {models.length === 0 ? <p className="text-xs text-slate-500">No trained model artifacts are registered for this account.</p> : models.slice(0, 30).map((model) => (
          <div key={model.model_id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-slate-200">{model.name} · v{model.version} · {model.model_family}</span>
              <span className={model.deployment_eligible ? 'text-emerald-400' : 'text-amber-300'}>{model.approval_status}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-slate-500">
              <span>Task: {model.task_type}</span>
              <span>Gate: {model.gates.passed ? 'PASSED' : 'NOT PASSED'}</span>
              <span>Deployment eligible: {model.deployment_eligible ? 'YES' : 'NO'}</span>
              <span>Created: {new Date(model.created_at).toLocaleString()}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-slate-400">
              {Object.entries(model.metrics || {}).map(([key, value]) => <span key={key} className="rounded bg-slate-950 px-2 py-1">{key}: {typeof value === 'number' ? value.toFixed(4) : String(value)}</span>)}
            </div>
          </div>
        ))}
      </section>

      <p className="flex items-start gap-2 border-t border-slate-800 pt-3 text-[11px] text-slate-500">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        Model approval never enables broker execution. This dashboard reports only persisted Datacenter registry and job data; no synthetic accuracy, cron, or health metrics are displayed.
      </p>
    </div>
  );
}
