import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity, ArrowUpRight, CircleHelp, Clock3,
  RefreshCw, ShieldCheck, Wifi, WifiOff,
} from "lucide-react";
import {
  Panel, PageHeader, Stat, StatusDot, NotConnected, EmptyState,
} from "@/components/nova/primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useHealth, useNovaQuery } from "@/components/nova/useApi";
import { isApiConfigured, isSupabaseConfigured } from "@/lib/nova/config";
import { describeApiError } from "@/lib/nova/api";
import { SAFETY } from "@/lib/nova/safety";
import { pageHead } from "@/lib/nova/head";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: pageHead("Overview", "System health and read-only operations."),
  component: Dashboard,
});

interface Service {
  name: string;
  status: "ok" | "degraded" | "down";
}
interface Bridge {
  connected: boolean;
  lastHeartbeat: string | null;
  lastSync?: string | null;
  latencyMs?: number | null;
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "No heartbeat recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function Dashboard() {
  const queryClient = useQueryClient();
  const health = useHealth();
  const services = useNovaQuery<{ services: Service[] }>("/v1/services");
  const bridge = useNovaQuery<Bridge>("/v1/bridge/status");
  const refreshing = health.isFetching || services.isFetching || bridge.isFetching;

  const apiTone: "ok" | "warn" | "down" | "off" = !isApiConfigured
    ? "off"
    : health.isError
      ? "down"
      : health.data?.status === "ok"
        ? "ok"
        : "warn";

  async function refreshOverview() {
    await queryClient.invalidateQueries({ queryKey: ["nova"] });
  }

  const serviceCount = services.data?.services.length ?? 0;
  const healthyCount = services.data?.services.filter((service) => service.status === "ok").length ?? 0;
  const degradedCount = services.data?.services.filter((service) => service.status === "degraded").length ?? 0;
  const failedCount = services.data?.services.filter((service) => service.status === "down").length ?? 0;

  return (
    <div className="space-y-6" aria-busy={refreshing}>
      <PageHeader
        title="Command overview"
        subtitle="A verified view of NOVA service health, connectivity and safety posture."
        right={
          <Button
            variant="outline"
            size="sm"
            onClick={refreshOverview}
            disabled={!isApiConfigured || refreshing}
            aria-label="Refresh overview data"
            title={isApiConfigured ? "Refresh read-only system telemetry" : "Configure the NOVA API before refreshing"}
          >
            <RefreshCw aria-hidden="true" className={refreshing ? "size-4 animate-spin" : "size-4"} />
            Refresh
          </Button>
        }
      />

      <section className="overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-br from-primary/[0.09] via-card to-card">
        <div className="grid gap-5 p-5 md:grid-cols-[1fr_auto] md:items-center md:p-7">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="terminal-label">NOVA / OPERATIONS LAYER</span>
              <Badge variant="warn">READ ONLY</Badge>
            </div>
            <h2 className="mt-3 max-w-2xl text-2xl font-semibold tracking-tight md:text-3xl">
              System state, without assumptions.
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Health and bridge telemetry are read from configured services. Missing connections stay visible as missing — no synthetic trading metrics are shown.
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-warning/25 bg-warning/[0.06] px-4 py-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-warning/10 text-warning">
              <ShieldCheck aria-hidden="true" className="size-5" />
            </div>
            <div>
              <div className="font-mono text-xs font-semibold tracking-[0.12em] text-warning">SAFE MODE</div>
              <div className="mt-1 text-xs text-muted-foreground">Execution controls locked</div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 border-t border-border/80 md:grid-cols-4">
          <div className="border-r border-border/80 p-4">
            <div className="terminal-label">API HEALTH</div>
            <div className="mt-2 flex items-center gap-2 text-sm font-medium">
              <StatusDot tone={apiTone} />
              {!isApiConfigured ? "Not connected" : health.isLoading ? "Checking" : health.isError ? "Unreachable" : health.data?.status ?? "Unknown"}
            </div>
          </div>
          <div className="border-b border-border/80 p-4 md:border-b-0 md:border-r">
            <div className="terminal-label">AUTH PROVIDER</div>
            <div className="mt-2 flex items-center gap-2 text-sm font-medium">
              <StatusDot tone={isSupabaseConfigured ? "ok" : "off"} />
              {isSupabaseConfigured ? "Configured" : "Not connected"}
            </div>
          </div>
          <div className="border-r border-border/80 p-4">
            <div className="terminal-label">MT5 BRIDGE</div>
            <div className="mt-2 flex items-center gap-2 text-sm font-medium">
              <StatusDot tone={bridge.data?.connected ? "ok" : bridge.isError ? "down" : "off"} />
              {bridge.isLoading ? "Checking" : bridge.isError ? "Unavailable" : bridge.data?.connected ? "Connected · read only" : "Disconnected"}
            </div>
          </div>
          <div className="p-4">
            <div className="terminal-label">LAST HEARTBEAT</div>
            <div className="mt-2 flex items-center gap-2 text-sm font-medium">
              <Clock3 aria-hidden="true" className="size-4 text-muted-foreground" />
              <span className="truncate">{bridge.data ? formatTimestamp(bridge.data.lastHeartbeat) : "Not available"}</span>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Services reported"
          value={services.isLoading ? "Checking…" : services.isError ? "Unavailable" : isApiConfigured ? serviceCount.toString() : "—"}
          hint="Count returned by the NOVA API"
        />
        <Stat
          label="Healthy services"
          value={services.isError || !isApiConfigured ? "—" : healthyCount.toString()}
          hint="Status = ok"
        />
        <Stat
          label="Degraded / down"
          value={services.isError || !isApiConfigured ? "—" : `${degradedCount} / ${failedCount}`}
          hint="Reported service conditions"
        />
        <Stat
          label="Bridge latency"
          value={bridge.data?.latencyMs == null ? "—" : `${bridge.data.latencyMs} ms`}
          hint={bridge.data?.connected ? "Latest API-reported latency" : "No connected bridge telemetry"}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.85fr]">
        <Panel
          title="Service registry"
          right={
            services.isError
              ? <Badge variant="offline">UNAVAILABLE</Badge>
              : !isApiConfigured
                ? <NotConnected />
                : <Badge variant="outline">{serviceCount} REPORTED</Badge>
          }
        >
          {services.isLoading ? (
            <div className="space-y-3" aria-label="Loading service registry" role="status">
              {[0, 1, 2].map((item) => (
                <div key={item} className="h-10 animate-pulse rounded-md bg-muted/70" />
              ))}
            </div>
          ) : services.isError ? (
            <EmptyState title="Service registry could not be loaded">
              <span>{describeApiError(services.error)}</span>
              <Button className="mt-4" size="sm" variant="outline" onClick={() => services.refetch()}>
                <RefreshCw aria-hidden="true" className="mr-2 size-3.5" /> Try again
              </Button>
            </EmptyState>
          ) : services.data?.services.length ? (
            <ul className="divide-y divide-border" aria-label="NOVA services">
              {services.data.services.map((service) => (
                <li key={service.name} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid size-8 shrink-0 place-items-center rounded-md bg-muted/70">
                      <Activity aria-hidden="true" className="size-4 text-muted-foreground" />
                    </div>
                    <span className="truncate text-sm font-medium">{service.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusDot tone={service.status === "ok" ? "ok" : service.status === "degraded" ? "warn" : "down"} />
                    <span className="min-w-16 text-right font-mono text-xs uppercase text-muted-foreground">{service.status}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title={isApiConfigured ? "No services reported" : "Service registry not configured"}>
              {isApiConfigured ? "The API returned an empty service list." : "Configure the NOVA API base URL to retrieve verified service status."}
            </EmptyState>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel title="Safety invariants" right={<Badge variant="warn">LOCKED</Badge>}>
            <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
              These controls are enforced by the application and backend policy. They are not user-adjustable from this console.
            </p>
            <ul className="space-y-3">
              {[
                ["Live trading", SAFETY.LIVE_TRADING_ENABLED],
                ["Broker writes", SAFETY.BROKER_WRITES_ENABLED],
                ["Order placement", SAFETY.ORDER_PLACEMENT_ENABLED],
                ["Funds movement", SAFETY.FUNDS_MOVEMENT_ENABLED],
                ["Account mutations", SAFETY.ACCOUNT_MUTATIONS_ENABLED],
              ].map(([label, enabled]) => (
                <li key={String(label)} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">{label}</span>
                  <Badge variant={enabled ? "destructive" : "online"}>{enabled ? "ENABLED" : "DISABLED"}</Badge>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Bridge connection" right={bridge.isError ? <Badge variant="offline">UNAVAILABLE</Badge> : bridge.isLoading ? <Badge variant="outline">CHECKING</Badge> : bridge.data?.connected ? <Badge variant="online">CONNECTED</Badge> : <NotConnected />}>
            {bridge.isError ? (
              <div className="flex gap-3 text-sm">
                <WifiOff aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium">Bridge status unavailable</p>
                  <p className="mt-1 text-xs text-muted-foreground">{describeApiError(bridge.error)}</p>
                  <Button className="mt-3" size="sm" variant="outline" onClick={() => bridge.refetch()}>Retry status</Button>
                </div>
              </div>
            ) : bridge.data?.connected ? (
              <div className="flex gap-3 text-sm">
                <Wifi aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                <div>
                  <p className="font-medium">Read-only heartbeat detected</p>
                  <p className="mt-1 text-xs text-muted-foreground">Last sync: {formatTimestamp(bridge.data.lastSync)}</p>
                </div>
              </div>
            ) : (
              <div className="flex gap-3 text-sm">
                <WifiOff aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium">No authenticated heartbeat</p>
                  <p className="mt-1 text-xs text-muted-foreground">Trading views must remain labeled DEMO until the bridge is verified.</p>
                </div>
              </div>
            )}
            <Link to="/bridge" className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Open bridge diagnostics <ArrowUpRight aria-hidden="true" className="size-3.5" />
            </Link>
          </Panel>
        </div>
      </div>

      {!isApiConfigured && (
        <div role="status" className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-4">
          <CircleHelp aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">NOVA API is not configured</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Overview telemetry will remain unavailable until VITE_NOVA_API_BASE_URL is configured for this environment. No demo values are substituted.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
