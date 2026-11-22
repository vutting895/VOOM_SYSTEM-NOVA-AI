import { createFileRoute } from "@tanstack/react-router";
import { Panel, PageHeader, Stat, StatusDot, NotConnected } from "@/components/nova/primitives";
import { Badge } from "@/components/ui/badge";
import { useNovaQuery } from "@/components/nova/useApi";
import { describeApiError } from "@/lib/nova/api";
import { pageHead } from "@/lib/nova/head";

export const Route = createFileRoute("/_authenticated/bridge")({
  head: pageHead("MT5 Bridge", "Bridge heartbeat monitor."),
  component: Bridge,
});

function Bridge() {
  const st = useNovaQuery<{
    connected: boolean;
    lastHeartbeat: string | null;
    lastSync: string | null;
    latencyMs: number | null;
  }>("/v1/bridge/status");
  const acct = useNovaQuery<{
    server: string;
    login: string;
    currency: string;
    leverage: number;
    tradeAllowed: false;
  }>("/v1/bridge/account");
  const nc = "Not connected";
  return (
    <>
      <PageHeader
        title="MT5 Bridge"
        subtitle="Monitor only. This app has no order placement or write endpoints."
        right={<Badge variant="online">READ-ONLY</Badge>}
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Status"
          value={
            <span className="flex items-center gap-2">
              <StatusDot tone={st.data?.connected ? "ok" : "off"} />
              {st.data ? (st.data.connected ? "Connected" : "Disconnected") : nc}
            </span>
          }
          hint={st.isError ? describeApiError(st.error) : undefined}
        />
        <Stat label="Last heartbeat" value={st.data?.lastHeartbeat ?? nc} />
        <Stat label="Last sync" value={st.data?.lastSync ?? nc} />
        <Stat label="Latency" value={st.data?.latencyMs != null ? `${st.data.latencyMs} ms` : nc} />
      </div>
      <Panel title="Account metadata" className="mt-4" right={!acct.data && <NotConnected />}>
        <dl className="grid gap-3 font-mono text-sm sm:grid-cols-2 lg:grid-cols-4">
          {(["server", "login", "currency", "leverage"] as const).map((k) => (
            <div key={k}>
              <dt className="terminal-label">{k}</dt>
              <dd>{acct.data ? String(acct.data[k]) : nc}</dd>
            </div>
          ))}
        </dl>
      </Panel>
    </>
  );
}