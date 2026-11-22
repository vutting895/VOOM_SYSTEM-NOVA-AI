import { ShieldAlert } from "lucide-react";
import { SAFETY } from "@/lib/nova/safety";

export function SafetyBanner() {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-warning/40 bg-warning/10 px-4 py-2 font-mono text-xs text-warning"
    >
      <span className="flex items-center gap-1.5 font-semibold">
        <ShieldAlert className="size-4" /> SAFE MODE
      </span>
      <span>LIVE TRADING: {SAFETY.LIVE_TRADING_ENABLED ? "ON" : "OFF"}</span>
      <span>BROKER WRITES: {SAFETY.BROKER_WRITES_ENABLED ? "ON" : "OFF"}</span>
      <span className="text-warning/80">
        Trading data is DEMO until an authenticated read-only MT5 bridge is connected.
      </span>
    </div>
  );
}