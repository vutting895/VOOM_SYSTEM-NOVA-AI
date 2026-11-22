import { createFileRoute } from "@tanstack/react-router";
import { Panel, PageHeader, StatusDot } from "@/components/nova/primitives";
import { config, isApiConfigured, isSupabaseConfigured } from "@/lib/nova/config";
import { SAFETY } from "@/lib/nova/safety";
import { useHealth } from "@/components/nova/useApi";
import { describeApiError } from "@/lib/nova/api";
import { pageHead } from "@/lib/nova/head";

export const Route = createFileRoute("/_authenticated/settings")({
  head: pageHead("Settings", "Integration health."),
  component: Settings,
});

function Row({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
      <span className="flex items-center gap-2">
        <StatusDot tone={ok ? "ok" : "off"} />
        {label}
      </span>
      <span className="font-mono text-xs text-muted-foreground">{detail}</span>
    </li>
  );
}

function Settings() {
  const h = useHealth();
  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Integration health. Secrets are never entered in this UI."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Integrations">
          <ul className="divide-y divide-border">
            <Row
              label="Supabase Auth"
              ok={isSupabaseConfigured}
              detail={config.supabaseUrl ?? "VITE_SUPABASE_URL missing"}
            />
            <Row
              label="NOVA API"
              ok={isApiConfigured && h.isSuccess}
              detail={
                !isApiConfigured
                  ? "VITE_NOVA_API_BASE_URL missing"
                  : h.isError
                    ? describeApiError(h.error)
                    : (config.apiBaseUrl ?? "")
              }
            />
            <Row label="MT5 bridge" ok={false} detail="Configured on the Worker, not here" />
            <Row label="AI model provider" ok={false} detail="Configured on the Worker, not here" />
          </ul>
        </Panel>
        <Panel title="Safety flags (build constants)">
          <ul className="divide-y divide-border font-mono text-sm">
            {Object.entries(SAFETY).map(([k, v]) => (
              <li key={k} className="flex justify-between py-2">
                <span>{k}</span>
                <span className={v ? "text-destructive" : "text-primary"}>{String(v)}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Configuration" className="lg:col-span-2">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>
              Copy <code className="font-mono">.env.example</code> to{" "}
              <code className="font-mono">.env</code> and set the public values (URL, publishable
              key, API base URL).
            </li>
            <li>
              Deploy the NOVA Worker per{" "}
              <code className="font-mono">docs/worker-api-contract.md</code>; put provider and
              bridge secrets in Worker secrets.
            </li>
            <li>
              Review and manually apply <code className="font-mono">supabase/migrations</code>{" "}
              drafts.
            </li>
            <li>
              Assign roles via <code className="font-mono">app_metadata.nova_role</code> using an
              admin tool server-side.
            </li>
          </ol>
        </Panel>
      </div>
    </>
  );
}