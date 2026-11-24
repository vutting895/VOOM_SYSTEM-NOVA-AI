import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getSupabase } from "@/lib/nova/supabase";
import { PageHeader, Stat } from "@/components/nova/primitives";
import { Badge } from "@/components/ui/badge";
import { pageHead } from "@/lib/nova/head";

export const Route = createFileRoute("/_authenticated/learning")({
  head: pageHead("Learning", "Dataset, model and continuous-learning registry."),
  component: LearningDashboard,
});

type DatasetRow = {
  id: string; dataset_key: string; symbol: string; timeframe: string;
  row_count: number; quality_status: string; validation_status: string; created_at: string;
};
type ModelRow = {
  id: string; model_key: string; model_version: string; architecture: string;
  lifecycle_status: string; walk_forward_status: string; oos_closed_trades: number;
  metrics: Record<string, unknown>; created_at: string;
};
type RunRow = {
  id: string; run_key: string; run_type: string; status: string;
  error_code: string | null; started_at: string | null; finished_at: string | null; created_at: string;
};

function LearningDashboard() {
  const registry = useQuery({
    queryKey: ["nova-learning-registry"],
    staleTime: 30_000,
    queryFn: async () => {
      const sb = getSupabase();
      if (!sb) throw new Error("Supabase is not configured for this Command Center.");
      const [datasets, models, runs] = await Promise.all([
        sb.from("nova_dataset_registry").select("id,dataset_key,symbol,timeframe,row_count,quality_status,validation_status,created_at").order("created_at", { ascending: false }).limit(50),
        sb.from("nova_model_registry").select("id,model_key,model_version,architecture,lifecycle_status,walk_forward_status,oos_closed_trades,metrics,created_at").order("created_at", { ascending: false }).limit(50),
        sb.from("nova_learning_runs").select("id,run_key,run_type,status,error_code,started_at,finished_at,created_at").order("created_at", { ascending: false }).limit(50),
      ]);
      if (datasets.error) throw new Error("Dataset Registry: " + datasets.error.message);
      if (models.error) throw new Error("Model Registry: " + models.error.message);
      if (runs.error) throw new Error("Learning Runs: " + runs.error.message);
      return {
        datasets: (datasets.data ?? []) as DatasetRow[],
        models: (models.data ?? []) as ModelRow[],
        runs: (runs.data ?? []) as RunRow[],
      };
    },
  });

  const data = registry.data;
  const passedDatasets = data?.datasets.filter((d) => d.validation_status === "passed").length ?? 0;
  const approvedModels = data?.models.filter((m) => m.lifecycle_status === "approved").length ?? 0;
  const activeRuns = data?.runs.filter((r) => r.status === "queued" || r.status === "running").length ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Learning Dashboard"
        subtitle="Dataset lineage · model lifecycle · analysis and training evidence"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="warn">RESEARCH ONLY</Badge>
        <Badge variant="outline">LIVE TRADING OFF</Badge>
        <span className="text-xs text-muted-foreground">Registry view is owner-scoped by Supabase RLS. No training is triggered from this page.</span>
      </div>
      {registry.isError && (
        <div role="alert" className="rounded-lg border border-warning/50 bg-warning/10 p-4 text-sm">
          <div className="font-semibold">Registry unavailable</div>
          <p className="mt-1 text-muted-foreground">{registry.error.message}</p>
          <p className="mt-2 text-muted-foreground">The migration must be reviewed and applied to the intended Supabase project before the dashboard can read registry data.</p>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Registered datasets" value={registry.isLoading ? "…" : data?.datasets.length ?? 0} hint={`${passedDatasets} passed dataset validation`} />
        <Stat label="Registered models" value={registry.isLoading ? "…" : data?.models.length ?? 0} hint={`${approvedModels} explicitly approved`} />
        <Stat label="Learning runs" value={registry.isLoading ? "…" : data?.runs.length ?? 0} hint={`${activeRuns} queued or running`} />
        <Stat label="Training status" value="Not triggered" hint="No real trainer/worker is connected by this registry UI." />
      </div>
      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="font-semibold">Dataset Registry</h2>
          <p className="text-xs text-muted-foreground">Source, instrument, timeframe, quality and validation gate.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted-foreground"><tr><th className="p-3">Dataset</th><th className="p-3">Symbol / TF</th><th className="p-3">Rows</th><th className="p-3">Quality</th><th className="p-3">Validation</th></tr></thead>
            <tbody className="divide-y divide-border">
              {data?.datasets.map((d) => <tr key={d.id}><td className="p-3 font-mono">{d.dataset_key}</td><td className="p-3">{d.symbol} / {d.timeframe}</td><td className="p-3">{Number(d.row_count).toLocaleString()}</td><td className="p-3"><Badge variant={d.quality_status === "passed" ? "online" : "outline"}>{d.quality_status}</Badge></td><td className="p-3"><Badge variant={d.validation_status === "passed" ? "online" : d.validation_status === "failed" ? "destructive" : "outline"}>{d.validation_status}</Badge></td></tr>)}
              {!registry.isLoading && !data?.datasets.length && <tr><td className="p-4 text-muted-foreground" colSpan={5}>No dataset records found.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="font-semibold">Model Registry</h2>
          <p className="text-xs text-muted-foreground">Lifecycle, walk-forward and OOS evidence. Candidate does not mean production-ready.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted-foreground"><tr><th className="p-3">Model</th><th className="p-3">Architecture</th><th className="p-3">Lifecycle</th><th className="p-3">Walk-forward</th><th className="p-3">OOS trades</th></tr></thead>
            <tbody className="divide-y divide-border">
              {data?.models.map((m) => <tr key={m.id}><td className="p-3 font-mono">{m.model_key} / {m.model_version}</td><td className="p-3">{m.architecture}</td><td className="p-3"><Badge variant={m.lifecycle_status === "approved" ? "online" : "outline"}>{m.lifecycle_status}</Badge></td><td className="p-3">{m.walk_forward_status}</td><td className="p-3">{m.oos_closed_trades}</td></tr>)}
              {!registry.isLoading && !data?.models.length && <tr><td className="p-4 text-muted-foreground" colSpan={5}>No model records found.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="font-semibold">Learning Runs</h2>
          <p className="text-xs text-muted-foreground">Durable run status and evidence. This view does not fabricate training metrics.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted-foreground"><tr><th className="p-3">Run</th><th className="p-3">Type</th><th className="p-3">Status</th><th className="p-3">Created</th></tr></thead>
            <tbody className="divide-y divide-border">
              {data?.runs.map((r) => <tr key={r.id}><td className="p-3 font-mono">{r.run_key}</td><td className="p-3">{r.run_type}</td><td className="p-3"><Badge variant={r.status === "succeeded" ? "online" : r.status === "failed" ? "destructive" : "outline"}>{r.status}</Badge></td><td className="p-3 text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td></tr>)}
              {!registry.isLoading && !data?.runs.length && <tr><td className="p-4 text-muted-foreground" colSpan={4}>No learning runs recorded.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
