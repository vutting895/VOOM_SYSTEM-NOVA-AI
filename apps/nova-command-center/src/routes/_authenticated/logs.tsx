import { createFileRoute } from "@tanstack/react-router";
import { Panel, PageHeader, EmptyState, NotConnected } from "@/components/nova/primitives";
import { useNovaQuery } from "@/components/nova/useApi";
import { describeApiError } from "@/lib/nova/api";
import { isApiConfigured } from "@/lib/nova/config";
import { pageHead } from "@/lib/nova/head";

export const Route = createFileRoute("/_authenticated/logs")({
  head: pageHead("Audit Logs", "Audit events."),
  component: Logs,
});

interface AuditEvent {
  id: string;
  at: string;
  actor: string;
  action: string;
  level: "info" | "warn" | "error";
}

function Logs() {
  const q = useNovaQuery<{ events: AuditEvent[] }>("/v1/audit");
  return (
    <>
      <PageHeader title="Audit Logs" subtitle="Audit events from the backend." />
      <Panel title="Audit events" right={!isApiConfigured && <NotConnected />}>
        {!isApiConfigured ? (
          <EmptyState title="Audit log unavailable">
            Configure the NOVA API to stream audit events.
          </EmptyState>
        ) : q.isError ? (
          <EmptyState title={describeApiError(q.error)} />
        ) : !q.data?.events.length ? (
          <EmptyState title={q.isLoading ? "Loading…" : "No events"} />
        ) : (
          <ul className="divide-y divide-border font-mono text-xs">
            {q.data.events.map((e) => (
              <li key={e.id} className="grid grid-cols-[150px_60px_1fr] gap-2 py-1.5">
                <span className="text-muted-foreground">{e.at}</span>
                <span
                  className={
                    e.level === "error"
                      ? "text-destructive"
                      : e.level === "warn"
                        ? "text-warning"
                        : "text-primary"
                  }
                >
                  {e.level}
                </span>
                <span>
                  {e.actor}: {e.action}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}