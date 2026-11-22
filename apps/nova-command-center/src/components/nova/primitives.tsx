import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function Panel({
  title,
  right,
  children,
  className,
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-lg border border-border bg-card/80 backdrop-blur", className)}>
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <h2 className="terminal-label">{title}</h2>
        <div className="flex items-center gap-2">{right}</div>
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export const DemoBadge = () => <Badge variant="demo">DEMO</Badge>;
export const NotConnected = ({ label = "Not connected" }: { label?: string }) => (
  <Badge variant="offline">{label}</Badge>
);

export function StatusDot({ tone }: { tone: "ok" | "warn" | "down" | "off" }) {
  const c = {
    ok: "bg-primary pulse-dot",
    warn: "bg-warning pulse-dot",
    down: "bg-destructive",
    off: "bg-muted-foreground/50",
  }[tone];
  return <span className={cn("inline-block size-2 rounded-full", c)} />;
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="rounded-md border border-border bg-background/50 p-3">
      <div className="terminal-label">{label}</div>
      <div className="mt-1 font-mono text-lg text-foreground">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-border p-6 text-center">
      <div className="font-mono text-sm text-foreground">{title}</div>
      {children && <div className="mt-2 text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}