import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  Activity,
  Bot,
  CandlestickChart,
  Cable,
  ShieldCheck,
  ClipboardCheck,
  Users,
  Settings,
  ScrollText,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/nova/auth";
import { ROLE_LABEL } from "@/lib/nova/roles";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SafetyBanner } from "./SafetyBanner";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Overview", icon: Activity },
  { to: "/assistant", label: "AI Assistant", icon: Bot },
  { to: "/trading", label: "Trading", icon: CandlestickChart },
  { to: "/bridge", label: "MT5 Bridge", icon: Cable },
  { to: "/risk", label: "Risk Center", icon: ShieldCheck },
  { to: "/approvals", label: "Approvals", icon: ClipboardCheck },
  { to: "/users", label: "Users & Roles", icon: Users },
  { to: "/logs", label: "Audit Logs", icon: ScrollText },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const nav = (
    <nav className="flex flex-col gap-0.5 p-3">
      {NAV.map((n) => (
        <Link
          key={n.to}
          to={n.to}
          onClick={() => setOpen(false)}
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
          activeProps={{ className: "bg-sidebar-accent text-primary shadow-glow" }}
        >
          <n.icon className="size-4" /> {n.label}
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-screen flex-col">
      <SafetyBanner />
      <div className="flex flex-1">
        <aside className="hidden w-60 shrink-0 border-r border-sidebar-border bg-sidebar lg:block">
          <Brand />
          {nav}
        </aside>
        {open && (
          <div
            className="fixed inset-0 z-40 bg-background/80 lg:hidden"
            onClick={() => setOpen(false)}
          >
            <aside
              className="h-full w-64 border-r border-sidebar-border bg-sidebar"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pr-2">
                <Brand />
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Close menu"
                  onClick={() => setOpen(false)}
                >
                  <X />
                </Button>
              </div>
              {nav}
            </aside>
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-3 border-b border-border bg-background/80 px-4 py-2.5 backdrop-blur">
            <Button
              size="icon"
              variant="ghost"
              className="lg:hidden"
              aria-label="Open menu"
              onClick={() => setOpen(true)}
            >
              <Menu />
            </Button>
            <div className="ml-auto flex items-center gap-3">
              <span className="hidden font-mono text-xs text-muted-foreground sm:inline">
                {auth.email}
              </span>
              {auth.role && (
                <Badge variant="online" title="Display only — the server enforces permissions">
                  {ROLE_LABEL[auth.role]}
                </Badge>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  await auth.signOut();
                  navigate({ to: "/login", replace: true });
                }}
              >
                <LogOut className="size-4" /> <span className="hidden sm:inline">Sign out</span>
              </Button>
            </div>
          </header>
          <main className={cn("mx-auto w-full max-w-7xl flex-1 p-4 md:p-6")}>
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2 px-5 py-4">
      <div className="grid size-8 place-items-center rounded-md border border-primary/50 bg-primary/10 font-mono text-sm font-bold text-primary shadow-glow">
        N
      </div>
      <div>
        <div className="font-mono text-sm font-bold tracking-[0.2em] text-foreground">NOVA AI</div>
        <div className="terminal-label">Command Center</div>
      </div>
    </div>
  );
}