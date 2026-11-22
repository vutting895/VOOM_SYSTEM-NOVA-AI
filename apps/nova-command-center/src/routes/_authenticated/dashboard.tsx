import { createFileRoute } from "@tanstack/react-router";
import {
  Panel,
  PageHeader,
  Stat,
  StatusDot,
  NotConnected,
  EmptyState,
} from "@/components/nova/primitives";
import { Badge } from "@/components/ui/badge";
import { useHealth, useNovaQuery } from "@/components/nova/useApi";
import { isApiConfigured, isSupabaseConfigured } from "@/lib/nova/config";
import { describeApiError } from "@/lib/nova/api";
import { pageHead } from "@/lib/nova/head";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: pageHead("Overview", "System health and alerts."),
  component: Dashboard,
});

interface Service {
  name: string;
  status: "ok" | "degraded" | "down";
}
interface Bridge {
  connected: boolean;
  lastHeartbeat: string | null;
}

function Dashboard() {
  const health = useHealth();
  const services = useNovaQuery<{ services: Service[] }>("/v1/services");
  const bridge = useNovaQuery<Bridge>("/v1/bridge/status");
  const apiTone = !isApiConfigured
    ? "off"
    : health.isError
      ? "down"
      : health.data?.status === "ok"
        ? "ok"
        : "warn";

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle="Live system state. Values that are not wired are labeled honestly."
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="NOVA API"
          value={
            <span className="flex items-center gap-2">
              <StatusDot tone={apiTone} />
              {!isApiConfigured
                ? "Not connected"
                : health.isLoading
                  ? "Checking…"
                  : health.isError
                    ? "Unreachable"
                    : health.data?.status}
            </span>
          }
          hint={health.isError ? describeApiError(health.error) : undefined}
        />
        <Stat
          label="Auth provider"
          value={
            <span className="flex items-center gap-2">
              <StatusDot tone={isSupabaseConfigured ? "ok" : "off"} />
              {isSupabaseConfigured ? "Configured" : "Not connected"}
            </span>
          }
        />
        <Stat
          label="Broker bridge"
          value={
            <span className="flex items-center gap-2">
              <StatusDot tone={bridge.data?.connected ? "ok" : "off"} />
              {bridge.data
                ? bridge.data.connected
                  ? "Connected (read-only)"
                  : "Disconnected"
                : "Not connected"}
            </span>
          }
        />
        <Stat label="Data freshness" value={bridge.data?.lastHeartbeat ?? "Not connected"} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Services" right={!isApiConfigured && <NotConnected />}>
          {services.data?.services.length ? (
            <ul className="divide-y divide-border">
              {services.data.services.map((s) => (
                <li
                  key={s.name}
                  className="flex items-center justify-between py-2 font-mono text-sm"
                >
                  <span className="flex items-center gap-2">
                    <StatusDot
                      tone={s.status === "ok" ? "ok" : s.status === "degraded" ? "warn" : "down"}
                    />
                    {s.name}
                  </span>
                  <span className="text-muted-foreground">{s.status}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title={
                isApiConfigured
                  ? services.isError
                    ? describeApiError(services.error)
                    : "No services reported"
                  : "Service registry unavailable"
              }
            >
              Configure VITE_NOVA_API_BASE_URL to load service status.
            </EmptyState>
          )}
        </Panel>
        <Panel title="Alerts" right={<Badge variant="warn">SAFE MODE</Badge>}>
          <ul className="space-y-2 text-sm">
            <li className="rounded-md border border-warning/40 bg-warning/10 p-2 text-warning">
              Live trading and broker writes are disabled in this build.
            </li>
            {!isApiConfigured && (
              <li className="rounded-md border border-border p-2 text-muted-foreground">
                NOVA API not configured — dashboards show “Not connected”.
              </li>
            )}
            {!bridge.data?.connected && (
              <li className="rounded-md border border-border p-2 text-muted-foreground">
                No MT5 bridge heartbeat — trading views show DEMO data.
              </li>
            )}
          </ul>
        </Panel>
      </div>
    </>
  );
}