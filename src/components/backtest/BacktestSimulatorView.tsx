import React, { useEffect, useMemo, useState } from 'react';
import { Play, RefreshCw, Database, History, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import ReadonlySafetyBadge from '../common/ReadonlySafetyBadge';
import { LoadingSpinner, ErrorView } from '../common/StateViews';
import {
  datacenterResearchService,
  type DatacenterDataset,
  type ResearchRun,
} from '../../services/datacenterResearchService';

type RunMode = 'backtest' | 'walk_forward';

const FORBIDDEN_SIGNAL_TOKENS = ['future', 'forward', 'next_', 'lead_', 'target', 'label', 't_plus'];

export default function BacktestSimulatorView() {
  const [datasets, setDatasets] = useState<DatacenterDataset[]>([]);
  const [runs, setRuns] = useState<ResearchRun[]>([]);
  const [datasetId, setDatasetId] = useState('');
  const [signalColumn, setSignalColumn] = useState('');
  const [mode, setMode] = useState<RunMode>('backtest');
  const [initialBalance, setInitialBalance] = useState(10000);
  const [exposurePct, setExposurePct] = useState(10);
  const [commissionBps, setCommissionBps] = useState(2);
  const [spreadBps, setSpreadBps] = useState(1);
  const [slippageBps, setSlippageBps] = useState(1);
  const [maxHoldingBars, setMaxHoldingBars] = useState(100);
  const [trainWindowBars, setTrainWindowBars] = useState(200);
  const [testWindowBars, setTestWindowBars] = useState(50);
  const [purgeGapBars, setPurgeGapBars] = useState(1);
  const [allowShort, setAllowShort] = useState(true);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<ResearchRun | null>(null);

  const selectedDataset = datasets.find((dataset) => dataset.dataset_id === datasetId) || null;
  const signalColumns = useMemo(() => {
    const schema = selectedDataset?.manifest.schema || {};
    return Object.entries(schema)
      .filter(([name]) => !FORBIDDEN_SIGNAL_TOKENS.some((token) => name.toLowerCase().includes(token)))
      .filter(([name]) => !['timestamp', 'open', 'high', 'low', 'close', 'volume'].includes(name.toLowerCase()))
      .map(([name]) => name);
  }, [selectedDataset]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [availableDatasets, history] = await Promise.all([
        datacenterResearchService.listDatasets(),
        datacenterResearchService.listResearchRuns(),
      ]);
      setDatasets(availableDatasets);
      setRuns(history);
      setDatasetId((current) => current && availableDatasets.some((item) => item.dataset_id === current)
        ? current : availableDatasets[0]?.dataset_id || '');
      if (!history.length) setSelectedRun(null);
    } catch (err: any) {
      setError(err?.message || 'Unable to load Datacenter research data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (!signalColumns.includes(signalColumn)) setSignalColumn('');
  }, [datasetId, signalColumns, signalColumn]);

  const runResearch = async () => {
    if (!selectedDataset || !signalColumn) {
      setError('Select an approved Dataset and an explicit signal column before running research.');
      return;
    }
    try {
      setRunning(true);
      setError(null);
      const shared = {
        dataset_id: selectedDataset.dataset_id,
        dataset_version: selectedDataset.version,
        signal_column: signalColumn,
        initial_balance: initialBalance,
        exposure_fraction: exposurePct / 100,
        commission_bps: commissionBps,
        spread_bps: spreadBps,
        slippage_bps: slippageBps,
        max_holding_bars: maxHoldingBars,
        allow_short: allowShort,
      };
      const run = mode === 'backtest'
        ? await datacenterResearchService.runBacktest(shared)
        : await datacenterResearchService.runWalkForward({
            ...shared,
            train_window_bars: trainWindowBars,
            test_window_bars: testWindowBars,
            step_bars: testWindowBars,
            purge_gap_bars: purgeGapBars,
          });
      setSelectedRun(run);
      const history = await datacenterResearchService.listResearchRuns();
      setRuns(history);
    } catch (err: any) {
      setError(err?.message || 'Datacenter research run failed');
    } finally {
      setRunning(false);
    }
  };

  if (loading) return <div className="space-y-6"><ReadonlySafetyBadge /><LoadingSpinner label="Loading approved Datacenter datasets and research history..." /></div>;
  if (error && !datasets.length) return <div className="space-y-6"><ReadonlySafetyBadge /><ErrorView error={error} onRetry={loadData} /></div>;

  const result = selectedRun?.result || null;
  const backtestTrades = Array.isArray(result?.trades) ? result.trades : [];
  const folds = Array.isArray(result?.folds) ? result.folds : [];

  return (
    <div className="space-y-6 text-slate-100">
      <ReadonlySafetyBadge />

      <section className="rounded-2xl border border-slate-800 bg-[#0D111A] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-white">
              <Database className="h-5 w-5 text-cyan-400" />
              Datacenter Research Runtime
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              ใช้เฉพาะ Dataset ที่ผ่าน Quality Gate และได้รับอนุมัติแล้ว ไม่มีการส่งคำสั่งซื้อขาย
            </p>
          </div>
          <button type="button" onClick={loadData} disabled={loading || running}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:border-cyan-500 disabled:opacity-50">
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>

        {datasets.length === 0 ? (
          <div className="rounded-xl border border-amber-700/50 bg-amber-950/20 p-4 text-sm text-amber-200">
            No approved Dataset is available. Collect and validate market data, then explicitly approve its exact version in Datacenter before backtesting.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="space-y-1 text-xs text-slate-400">
              Approved Dataset / Version
              <select value={datasetId} onChange={(event) => setDatasetId(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2.5 text-slate-100">
                {datasets.map((dataset) => (
                  <option key={dataset.dataset_id} value={dataset.dataset_id}>
                    {dataset.name} · v{dataset.version} · {dataset.manifest.symbols?.join(', ') || 'Unknown symbol'} · {dataset.row_count} rows
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs text-slate-400">
              Explicit Signal Column
              <select value={signalColumn} onChange={(event) => setSignalColumn(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2.5 text-slate-100">
                <option value="">Select signal column…</option>
                {signalColumns.map((column) => <option key={column} value={column}>{column}</option>)}
              </select>
            </label>
          </div>
        )}

        {selectedDataset && (
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-xs md:grid-cols-4">
            <div><span className="block text-slate-500">Timeframe</span><span className="text-slate-200">{selectedDataset.manifest.timeframe || '—'}</span></div>
            <div><span className="block text-slate-500">Rows</span><span className="text-slate-200">{selectedDataset.row_count.toLocaleString()}</span></div>
            <div><span className="block text-slate-500">Coverage Start</span><span className="text-slate-200">{selectedDataset.manifest.coverage_start || '—'}</span></div>
            <div><span className="block text-slate-500">Coverage End</span><span className="text-slate-200">{selectedDataset.manifest.coverage_end || '—'}</span></div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 text-xs md:grid-cols-3 lg:grid-cols-6">
          <label className="space-y-1 text-slate-400">Initial Balance
            <input type="number" min="1" max="1000000000000" value={initialBalance} onChange={(e) => setInitialBalance(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-slate-100" />
          </label>
          <label className="space-y-1 text-slate-400">Exposure (%)
            <input type="number" min="0.1" max="100" step="0.1" value={exposurePct} onChange={(e) => setExposurePct(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-slate-100" />
          </label>
          <label className="space-y-1 text-slate-400">Commission (bps)
            <input type="number" min="0" max="500" value={commissionBps} onChange={(e) => setCommissionBps(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-slate-100" />
          </label>
          <label className="space-y-1 text-slate-400">Spread (bps)
            <input type="number" min="0" max="500" value={spreadBps} onChange={(e) => setSpreadBps(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-slate-100" />
          </label>
          <label className="space-y-1 text-slate-400">Slippage (bps)
            <input type="number" min="0" max="500" value={slippageBps} onChange={(e) => setSlippageBps(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-slate-100" />
          </label>
          <label className="space-y-1 text-slate-400">Max Holding Bars
            <input type="number" min="1" max="100000" value={maxHoldingBars} onChange={(e) => setMaxHoldingBars(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-slate-100" />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-4">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <label className="flex items-center gap-2 text-slate-300">
              <input type="radio" checked={mode === 'backtest'} onChange={() => setMode('backtest')} />
              Signal Backtest
            </label>
            <label className="flex items-center gap-2 text-slate-300">
              <input type="radio" checked={mode === 'walk_forward'} onChange={() => setMode('walk_forward')} />
              Walk-forward Replay
            </label>
            <label className="flex items-center gap-2 text-slate-300">
              <input type="checkbox" checked={allowShort} onChange={(e) => setAllowShort(e.target.checked)} />
              Allow Short
            </label>
          </div>
          <button type="button" onClick={runResearch} disabled={running || !selectedDataset || !signalColumn}
            className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-5 py-2.5 text-xs font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">
            <Play className="h-4 w-4" /> {running ? 'Running…' : 'Run Research'}
          </button>
        </div>

        {mode === 'walk_forward' && (
          <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-xs md:grid-cols-3">
            <label className="space-y-1 text-slate-400">Context Window (bars)
              <input type="number" min="30" value={trainWindowBars} onChange={(e) => setTrainWindowBars(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-slate-100" />
            </label>
            <label className="space-y-1 text-slate-400">OOS Test Window (bars)
              <input type="number" min="3" value={testWindowBars} onChange={(e) => setTestWindowBars(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-slate-100" />
            </label>
            <label className="space-y-1 text-slate-400">Purge Gap (bars)
              <input type="number" min="0" value={purgeGapBars} onChange={(e) => setPurgeGapBars(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-slate-100" />
            </label>
            <p className="md:col-span-3 text-amber-300">
              Evaluation-only: each fold replays precomputed signals. This does not retrain or refit a model in each fold.
            </p>
          </div>
        )}
      </section>

      {error && <ErrorView error={error} onRetry={loadData} />}
      {running && <LoadingSpinner label="Running Datacenter research replay..." />}

      {result && !running && (
        <section className="space-y-4 rounded-2xl border border-slate-800 bg-[#0D111A] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-white">Research Result</h3>
              <p className="text-xs text-slate-500">Run ID: {selectedRun?.run_id}</p>
            </div>
            <span className="rounded-lg border border-emerald-700/50 bg-emerald-950/20 px-3 py-1 text-xs text-emerald-300">
              {selectedRun?.run_type} · {selectedRun?.status}
            </span>
          </div>

          {selectedRun?.run_type === 'backtest' ? (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {[
                  ['Net PnL', result.net_profit],
                  ['Return (%)', result.net_return_pct],
                  ['Max Drawdown (%)', result.max_drawdown_pct],
                  ['Profit Factor', result.profit_factor ?? 'N/A'],
                  ['Trades', result.total_trades],
                  ['Win Rate (%)', result.win_rate_pct],
                  ['Final Balance', result.final_balance],
                  ['Dataset Version', `v${selectedRun.dataset_version}`],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                    <span className="block text-[10px] uppercase text-slate-500">{label}</span>
                    <span className="mt-1 block text-base font-bold text-slate-100">{typeof value === 'number' ? value.toLocaleString(undefined, { maximumFractionDigits: 3 }) : value}</span>
                  </div>
                ))}
              </div>
              <div className="overflow-x-auto">
                <h4 className="mb-2 text-xs font-semibold text-slate-300">Recent Trades</h4>
                <table className="w-full min-w-[650px] text-left text-xs">
                  <thead className="text-slate-500"><tr><th className="p-2">Side</th><th className="p-2">Entry</th><th className="p-2">Exit</th><th className="p-2">Net PnL</th><th className="p-2">Exit Reason</th></tr></thead>
                  <tbody>{backtestTrades.slice(-20).reverse().map((trade: any, index: number) => (
                    <tr key={index} className="border-t border-slate-800 text-slate-300">
                      <td className="p-2">{trade.side}</td><td className="p-2">{trade.entry_price}</td><td className="p-2">{trade.exit_price}</td><td className="p-2">{Number(trade.net_pnl).toFixed(3)}</td><td className="p-2">{trade.exit_reason}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {[
                  ['OOS Folds', result.fold_count],
                  ['OOS Trades', result.total_oos_trades],
                  ['Mean Fold Return (%)', result.mean_fold_return_pct],
                  ['Median Fold Return (%)', result.median_fold_return_pct],
                  ['Positive Folds', result.positive_folds],
                  ['Aggregate Trade PF', result.aggregate_trade_profit_factor ?? 'N/A'],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                    <span className="block text-[10px] uppercase text-slate-500">{label}</span>
                    <span className="mt-1 block text-base font-bold text-slate-100">{typeof value === 'number' ? value.toLocaleString(undefined, { maximumFractionDigits: 3 }) : value}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-slate-300">Out-of-Sample Folds</h4>
                {folds.map((fold: any) => (
                  <div key={fold.fold} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs">
                    <span className="text-slate-300">Fold {fold.fold} · {fold.test_start_timestamp} → {fold.test_end_timestamp}</span>
                    <span className="text-slate-400">{fold.result.total_trades} trades · {Number(fold.result.net_return_pct).toFixed(3)}% return</span>
                  </div>
                ))}
              </div>
            </>
          )}

          <p className="flex items-start gap-2 border-t border-slate-800 pt-3 text-[11px] text-amber-300">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            Research-only. No broker orders. Signal provenance and point-in-time correctness must be independently verified.
          </p>
        </section>
      )}

      <section className="rounded-2xl border border-slate-800 bg-[#0D111A] p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
          <History className="h-4 w-4 text-cyan-400" /> Datacenter Research History
        </h3>
        {runs.length === 0 ? (
          <p className="text-xs text-slate-500">No persisted research runs yet.</p>
        ) : (
          <div className="space-y-2">
            {runs.slice(0, 20).map((run) => (
              <button key={run.run_id} type="button" onClick={() => setSelectedRun(run)}
                className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-left text-xs hover:border-cyan-700">
                <span className="text-slate-300">{run.run_type} · {run.dataset_id.slice(0, 8)} · v{run.dataset_version}</span>
                <span className="text-slate-500">{new Date(run.created_at).toLocaleString()}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="flex items-center gap-2 text-[11px] text-slate-500">
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Cost model includes commission, half-spread, and slippage. No funding/swap, partial fills, intrabar execution, or multi-position portfolio model.
      </div>
    </div>
  );
}
