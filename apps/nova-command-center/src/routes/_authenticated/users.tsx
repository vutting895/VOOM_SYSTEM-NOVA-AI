import { createFileRoute } from "@tanstack/react-router";
import { Panel, PageHeader, EmptyState } from "@/components/nova/primitives";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/nova/auth";
import { ROLE_LABEL } from "@/lib/nova/roles";
import { RoleGate } from "@/components/nova/RoleGate";
import { pageHead } from "@/lib/nova/head";

export const Route = createFileRoute("/_authenticated/users")({
  head: pageHead("Users & Roles", "Profile and role management."),
  component: Users,
});

function Users() {
  const a = useAuth();
  return (
    <>
      <PageHeader title="Users & Roles" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Your profile">
          <dl className="space-y-3 font-mono text-sm">
            <div>
              <dt className="terminal-label">Email</dt>
              <dd>{a.email}</dd>
            </div>
            <div>
              <dt className="terminal-label">User ID</dt>
              <dd className="break-all">{a.userId}</dd>
            </div>
            <div>
              <dt className="terminal-label">Role (from server claims)</dt>
              <dd>{a.role ? <Badge variant="online">{ROLE_LABEL[a.role]}</Badge> : "None"}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            Role is read from app_metadata in your signed token for display. Every API call is
            authorized by the server, not by this page.
          </p>
        </Panel>
        <Panel title="User management">
          <RoleGate min="admin" fallback={<EmptyState title="Admin only" />}>
            <EmptyState title="Unavailable">
              Role assignment requires a trusted admin API on the NOVA Worker (service-role key
              stays server-side). It is not implemented in the browser by design.
            </EmptyState>
          </RoleGate>
        </Panel>
      </div>
    </>
  );
}