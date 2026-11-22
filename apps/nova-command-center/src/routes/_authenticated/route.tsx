import { createFileRoute, redirect } from "@tanstack/react-router";
import { getSupabase } from "@/lib/nova/supabase";
import { useAuth } from "@/lib/nova/auth";
import { AppShell } from "@/components/nova/AppShell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const sb = getSupabase();
    if (!sb) throw redirect({ to: "/login" }); // fail closed: no auth configured
    const { data } = await sb.auth.getUser();
    if (!data.user) throw redirect({ to: "/login" });
  },
  component: Gate,
});

function Gate() {
  const auth = useAuth();
  if (auth.status === "loading")
    return (
      <div className="grid min-h-screen place-items-center font-mono text-sm text-muted-foreground">
        Verifying session…
      </div>
    );
  if (auth.status !== "signed_in" || !auth.role) {
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <div className="max-w-md rounded-lg border border-destructive/50 bg-card p-6 text-center">
          <div className="font-mono text-destructive">ACCESS DENIED</div>
          <p className="mt-2 text-sm text-muted-foreground">
            Your account has no NOVA role in its server-issued claims (app_metadata.nova_role). Ask
            an administrator to assign Admin, Operator or Viewer.
          </p>
          <Button className="mt-4" variant="outline" onClick={() => auth.signOut()}>
            Sign out
          </Button>
        </div>
      </div>
    );
  }
  return <AppShell />;
}