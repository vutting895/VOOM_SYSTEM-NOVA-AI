import { createFileRoute } from "@tanstack/react-router";
import { Panel, PageHeader, EmptyState, NotConnected } from "@/components/nova/primitives";
import { useNovaQuery } from "@/components/nova/useApi";
import { describeApiError } from "@/lib/nova/api";
import { isApiConfigured } from "@/lib/nova/config";
import { pageHead } from "@/lib/nova/head";

export const Route = createFileRoute("/_authenticated/approvals")({
  head: pageHead("Approvals", "Approval queue and audit."),
  component: Approvals,
});

interface Approval {
  id: string;
  kind: string;
  requestedBy: string;
  createdAt: string;
  status: "pending" | "approved" | "rejected";
  decidedBy?: string;
}

function Approvals() {
  const q = useNovaQuery<{ items: Approval[] }>("/v1/approvals");
  const pending = q.data?.items.filter((a) => a.status === "pending") ?? [];
  const done = q.data?.items.filter((a) => a.status !== "pending") ?? [];
  const unavailable = !isApiConfigured
    ? "Approvals unavailable — backend not configured"
    : q.isError
      ? describeApiError(q.error)
      : null;
  const row = (a: Approval) => (
    <li key={a.id} className="flex flex-wrap justify-between gap-2 py-2 font-mono text-sm">
      <span>{a.kind}</span>
      <span className="text-muted-foreground">
        {a.requestedBy} · {a.createdAt}
      </span>
      <span>
        {a.status}
        {a.decidedBy ? ` by ${a.decidedBy}` : ""}
      </span>
    </li>
  );
  return (
    <>
      <PageHeader
        title="Approvals"
        subtitle="Decisions are made and recorded by the backend only. This page never approves anything locally."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Queue" right={!isApiConfigured && <NotConnected />}>
          {unavailable ? (
            <EmptyState title={unavailable} />
          ) : pending.length ? (
            <ul className="divide-y divide-border">{pending.map(row)}</ul>
          ) : (
            <EmptyState title="Queue empty" />
          )}
        </Panel>
        <Panel title="Audit history">
          {unavailable ? (
            <EmptyState title="Audit history unavailable" />
          ) : done.length ? (
            <ul className="divide-y divide-border">{done.map(row)}</ul>
          ) : (
            <EmptyState title="No decisions recorded" />
          )}
        </Panel>
      </div>
    </>
  );
}