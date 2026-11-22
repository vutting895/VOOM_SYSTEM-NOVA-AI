import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { OctagonX } from "lucide-react";
import { Panel, PageHeader, Stat, NotConnected, EmptyState } from "@/components/nova/primitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNovaQuery } from "@/components/nova/useApi";
import { SAFETY } from "@/lib/nova/safety";
import { emergencyStopAvailability } from "@/lib/nova/emergency";
import { RoleGate } from "@/components/nova/RoleGate";
import { pageHead } from "@/lib/nova/head";

export const Route = createFileRoute("/_authenticated/risk")({
  head: pageHead("Risk Center", "Risk policy and emergency stop."),
  component: Risk,
});

function Risk() {
  const pol = useNovaQuery<{
    dailyLossLimit: number;
    maxExposure: number;
    maxOrders: number;
    rules: string[];
  }>("/v1/risk/policy");
  const [msg, setMsg] = useState<string | null>(null);
  const nc = "Not connected";
  return (
    <>
      <PageHeader
        title="Risk Center"
        subtitle="Policy is defined and enforced by the backend. Shown here for visibility."
        right={
          <div className="flex gap-2">
            <Badge variant="danger">
              LIVE TRADING {SAFETY.LIVE_TRADING_ENABLED ? "ON" : "OFF"}
            </Badge>
            <Badge variant="danger">
              BROKER WRITES {SAFETY.BROKER_WRITES_ENABLED ? "ON" : "OFF"}
            </Badge>
          </div>
        }
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Daily loss limit" value={pol.data ? pol.data.dailyLossLimit : nc} />
        <Stat label="Max exposure" value={pol.data ? pol.data.maxExposure : nc} />
        <Stat label="Max open orders" value={pol.data ? pol.data.maxOrders : nc} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Risk policy" right={!pol.data && <NotConnected />}>
          {pol.data?.rules.length ? (
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {pol.data.rules.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Policy unavailable">
              The policy loads from the NOVA API once configured.
            </EmptyState>
          )}
        </Panel>
        <Panel title="Emergency stop" right={<NotConnected label="Endpoint not connected" />}>
          <p className="text-sm text-muted-foreground">
            An emergency stop only counts once a trusted backend endpoint confirms it. None is
            connected, so pressing the button sends nothing and stops nothing. If real positions are
            at risk, act directly on your broker platform.
          </p>
          <RoleGate
            min="operator"
            fallback={<p className="mt-3 text-sm text-muted-foreground">Operator role required.</p>}
          >
            <Button
              variant="destructive"
              className="mt-3 w-full"
              onClick={() => setMsg(emergencyStopAvailability().message)}
            >
              <OctagonX /> Emergency stop
            </Button>
          </RoleGate>
          {msg && (
            <p
              role="status"
              className="mt-3 rounded-md border border-warning/50 bg-warning/10 p-2 font-mono text-xs text-warning"
            >
              {msg}
            </p>
          )}
        </Panel>
      </div>
    </>
  );
}