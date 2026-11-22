import { createFileRoute } from "@tanstack/react-router";
import { Panel, PageHeader, DemoBadge } from "@/components/nova/primitives";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  DEMO_WATCHLIST,
  DEMO_POSITIONS,
  DEMO_ORDERS,
  DEMO_HISTORY,
  DEMO_SERIES,
} from "@/lib/nova/demo";
import { pageHead } from "@/lib/nova/head";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/trading")({
  head: pageHead("Trading Terminal", "Read-only trading view."),
  component: Trading,
});

function Chart() {
  const min = Math.min(...DEMO_SERIES),
    max = Math.max(...DEMO_SERIES);
  const pts = DEMO_SERIES.map(
    (v, i) => `${(i / (DEMO_SERIES.length - 1)) * 100},${100 - ((v - min) / (max - min)) * 90 - 5}`,
  ).join(" ");
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="h-64 w-full"
      aria-label="DEMO price chart"
    >
      <polyline
        points={pts}
        fill="none"
        stroke="var(--primary)"
        strokeWidth="0.6"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function Trading() {
  return (
    <>
      <PageHeader
        title="Trading Terminal"
        subtitle="Read-only. No order entry exists in this application."
        right={<Badge variant="danger">ORDER ENTRY DISABLED</Badge>}
      />
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <Panel title="Watchlist" right={<DemoBadge />}>
          <ul className="divide-y divide-border font-mono text-sm">
            {DEMO_WATCHLIST.map((w) => (
              <li key={w.symbol} className="flex items-center justify-between py-2">
                <span>{w.symbol}</span>
                <span className="text-muted-foreground">{w.bid}</span>
                <span className={cn(w.chg >= 0 ? "text-primary" : "text-destructive")}>
                  {w.chg > 0 ? "+" : ""}
                  {w.chg}%
                </span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="EURUSD · M15" right={<DemoBadge />}>
          <Chart />
        </Panel>
      </div>
      <Panel title="Account activity" className="mt-4" right={<DemoBadge />}>
        <Tabs defaultValue="positions">
          <TabsList>
            <TabsTrigger value="positions">Positions</TabsTrigger>
            <TabsTrigger value="orders">Orders</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
          <TabsContent value="positions">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead>Vol</TableHead>
                  <TableHead>Open</TableHead>
                  <TableHead className="text-right">P/L</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {DEMO_POSITIONS.map((p) => (
                  <TableRow key={p.id} className="font-mono">
                    <TableCell>{p.id}</TableCell>
                    <TableCell>{p.symbol}</TableCell>
                    <TableCell>{p.side}</TableCell>
                    <TableCell>{p.volume}</TableCell>
                    <TableCell>{p.open}</TableCell>
                    <TableCell className="text-right">{p.pnl}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TabsContent>
          <TabsContent value="orders">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Vol</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {DEMO_ORDERS.map((o) => (
                  <TableRow key={o.id} className="font-mono">
                    <TableCell>{o.id}</TableCell>
                    <TableCell>{o.symbol}</TableCell>
                    <TableCell>{o.type}</TableCell>
                    <TableCell>{o.volume}</TableCell>
                    <TableCell className="text-right">{o.price}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TabsContent>
          <TabsContent value="history">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead>Closed</TableHead>
                  <TableHead className="text-right">P/L</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {DEMO_HISTORY.map((h) => (
                  <TableRow key={h.id} className="font-mono">
                    <TableCell>{h.id}</TableCell>
                    <TableCell>{h.symbol}</TableCell>
                    <TableCell>{h.side}</TableCell>
                    <TableCell>{h.closed}</TableCell>
                    <TableCell className="text-right">{h.pnl}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TabsContent>
        </Tabs>
        <p className="mt-3 text-xs text-muted-foreground">
          All rows above are DEMO fixtures. Real data appears only once an authenticated read-only
          MT5 bridge is connected.
        </p>
      </Panel>
    </>
  );
}