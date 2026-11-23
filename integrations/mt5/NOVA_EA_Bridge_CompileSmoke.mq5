#property strict
#property version   "1.00"
#property description "NOVA EA Bridge compile smoke harness; telemetry only; no strategy or trading code."

#include "NOVA_EA_Bridge_v1.82.mqh"

int OnInit()
{
   if(!NovaEABridgeInit())
      return INIT_FAILED;

   EventSetTimer(1);
   return INIT_SUCCEEDED;
}

void OnTimer()
{
   // The include enforces a two-second rate limit and sends only READ-ONLY telemetry.
   NovaEABridgeHeartbeat(0);
}

void OnTick()
{
   // Intentionally empty: this harness contains no strategy or broker operations.
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   NovaEABridgeDeinit();
}
