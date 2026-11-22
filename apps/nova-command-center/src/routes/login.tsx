import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/nova/auth";
import { SafetyBanner } from "@/components/nova/SafetyBanner";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — NOVA AI" },
      { name: "description", content: "Sign in to the NOVA AI command center." },
      { property: "og:title", content: "Sign in — NOVA AI" },
      { property: "og:description", content: "Sign in to the NOVA AI command center." },
    ],
  }),
  component: Login,
});

function Login() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (auth.status === "signed_in") navigate({ to: "/dashboard", replace: true });
  }, [auth.status, navigate]);

  return (
    <div className="flex min-h-screen flex-col">
      <SafetyBanner />
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-glow">
          <div className="font-mono text-xl font-bold tracking-[0.2em] text-primary">NOVA AI</div>
          <div className="terminal-label mt-1">Operator authentication</div>
          {auth.status === "unconfigured" ? (
            <div className="mt-6 rounded-md border border-warning/50 bg-warning/10 p-3 text-sm text-warning">
              Sign-in is not configured. Set <code className="font-mono">VITE_SUPABASE_URL</code>{" "}
              and <code className="font-mono">VITE_SUPABASE_ANON_KEY</code> (see README). Access is
              denied until then.
            </div>
          ) : (
            <form
              className="mt-6 space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setErr(null);
                const m = await auth.signIn(email, password);
                setBusy(false);
                if (m) setErr(m);
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              {err && (
                <p role="alert" className="text-sm text-destructive">
                  {err}
                </p>
              )}
              <Button className="w-full" disabled={busy || auth.status === "loading"}>
                {busy ? "Signing in…" : "Sign in"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Accounts are provisioned by an administrator. Roles are assigned server-side.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}