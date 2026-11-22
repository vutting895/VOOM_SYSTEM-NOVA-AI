import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Activity, Bot, CandlestickChart, Cable, ShieldCheck, ClipboardCheck,
  Users, Settings, ScrollText, LogOut, Menu, X, Command,
} from "lucide-react";
import { useAuth } from "@/lib/nova/auth";
import { ROLE_LABEL } from "@/lib/nova/roles";
import { SAFETY } from "@/lib/nova/safety";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SafetyBanner } from "./SafetyBanner";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Overview", icon: Activity, group: "WORKSPACE" },
  { to: "/assistant", label: "AI Assistant", icon: Bot, group: "WORKSPACE" },
  { to: "/trading", label: "Trading", icon: CandlestickChart, group: "INTELLIGENCE" },
  { to: "/bridge", label: "MT5 Bridge", icon: Cable, group: "INTELLIGENCE" },
  { to: "/risk", label: "Risk Center", icon: ShieldCheck, group: "GOVERNANCE" },
  { to: "/approvals", label: "Approvals", icon: ClipboardCheck, group: "GOVERNANCE" },
  { to: "/users", label: "Users & Roles", icon: Users, group: "GOVERNANCE" },
  { to: "/logs", label: "Audit Logs", icon: ScrollText, group: "SYSTEM" },
  { to: "/settings", label: "Settings", icon: Settings, group: "SYSTEM" },
] as const;

export function AppShell() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const navigation = (
    <nav aria-label="Primary navigation" className="space-y-5 px-3 py-4">
      {(["WORKSPACE", "INTELLIGENCE", "GOVERNANCE", "SYSTEM"] as const).map((group) => (
        <section key={group} aria-label={group}>
          <h2 className="px-3 pb-2 font-mono text-[10px] font-semibold tracking-[0.18em] text-muted-foreground/70">
            {group}
          </h2>
          <div className="space-y-1">
            {NAV.filter((item) => item.group === group).map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className="group flex min-h-10 items-center gap-3 rounded-md border border-transparent px-3 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:border-sidebar-border hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                activeProps={{
                  className: "border-primary/20 bg-primary/10 text-primary shadow-[inset_2px_0_0_var(--primary)]",
                }}
              >
                <item.icon aria-hidden="true" className="size-4 shrink-0 opacity-80" />
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </nav>
  );

  const brand = (
    <div className="flex items-center gap-3 px-5 py-5">
      <div className="grid size-9 place-items-center rounded-lg border border-primary/40 bg-primary/10 text-primary shadow-glow">
        <Command aria-hidden="true" className="size-5" />
      </div>
      <div className="min-w-0">
        <div className="font-mono text-sm font-bold tracking-[0.2em] text-foreground">NOVA AI</div>
        <div className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Command Center
        </div>
      </div>
    </div>
  );

  return (
    <div className="nova-app flex min-h-screen flex-col">
      <SafetyBanner />
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-[252px] shrink-0 border-r border-sidebar-border bg-sidebar lg:block">
          {brand}
          <div className="mx-5 border-t border-sidebar-border" />
          {navigation}
          <div className="mx-5 mt-8 border-t border-sidebar-border pt-4">
            <div className="flex items-center justify-between px-1">
              <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground">RUNTIME MODE</span>
              <Badge variant="warn">READ ONLY</Badge>
            </div>
            <p className="mt-2 px-1 text-xs leading-relaxed text-muted-foreground">
              Broker execution and funds movement are disabled.
            </p>
          </div>
        </aside>

        <dialog
          ref={dialogRef}
          aria-label="Navigation menu"
          onCancel={() => setOpen(false)}
          onClose={() => setOpen(false)}
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
          className="mobile-nav-dialog m-0 h-dvh max-h-dvh w-[min(21rem,calc(100vw-2rem))] max-w-none border-0 border-r border-sidebar-border bg-sidebar p-0 text-foreground shadow-2xl backdrop:bg-background/75 lg:hidden"
        >
          <div className="flex items-center justify-between">
            {brand}
            <Button
              size="icon"
              variant="ghost"
              className="mr-3"
              aria-label="Close navigation"
              onClick={() => setOpen(false)}
            >
              <X aria-hidden="true" />
            </Button>
          </div>
          <div className="mx-5 border-t border-sidebar-border" />
          {navigation}
          <div className="mx-5 mt-4 border-t border-sidebar-border pt-4">
            <Badge variant="warn">READ ONLY</Badge>
            <p className="mt-2 text-xs text-muted-foreground">Broker execution is disabled.</p>
          </div>
        </dialog>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex min-h-[64px] items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur-xl md:px-6">
            <Button
              size="icon"
              variant="ghost"
              className="lg:hidden"
              aria-label="Open navigation"
              aria-haspopup="dialog"
              onClick={() => setOpen(true)}
            >
              <Menu aria-hidden="true" />
            </Button>
            <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
              <span className="font-mono tracking-[0.12em]">NOVA</span>
              <span aria-hidden="true">/</span>
              <span>Operations</span>
            </div>
            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              <div className="hidden items-center gap-2 rounded-full border border-warning/30 bg-warning/5 px-3 py-1.5 sm:flex">
                <span className="size-1.5 rounded-full bg-warning" />
                <span className="font-mono text-[10px] font-semibold tracking-[0.12em] text-warning">
                  {SAFETY.LIVE_TRADING_ENABLED ? "LIVE ENABLED" : "SAFE MODE"}
                </span>
              </div>
              <span className="hidden max-w-[180px] truncate text-xs text-muted-foreground xl:inline">
                {auth.email}
              </span>
              {auth.role && (
                <Badge variant="online" title="Display metadata only — the server enforces permissions">
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
                <LogOut aria-hidden="true" className="size-4" />
                <span className="hidden sm:inline">Sign out</span>
              </Button>
            </div>
          </header>
          <main className={cn("mx-auto w-full max-w-[1600px] flex-1 p-4 md:p-6 xl:p-8")}>
            <Outlet />
          </main>
          <footer className="border-t border-border/70 px-4 py-3 text-center font-mono text-[10px] tracking-[0.12em] text-muted-foreground/70 md:px-6">
            NOVA SYSTEM CONSOLE <span className="px-2 text-border">·</span>
            READ-ONLY INTERFACE <span className="px-2 text-border">·</span>
            SERVER AUTHORITY
          </footer>
        </div>
      </div>
    </div>
  );
}
