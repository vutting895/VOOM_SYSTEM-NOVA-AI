#property strict

#define NOVA_PHASE2_EXECUTION_DISABLED true
#include <Trade\Trade.mqh>
#include "..\include\NOVA_BrokerAdapter.mqh"

void OnStart()
{
   Print("[NOVA DYNAMIC BROKER INTERCEPT] START");
   CTrade trade;
   bool passed=NOVA_BrokerAdapterSelfTest(trade,NOVA_PHASE2_EXECUTION_DISABLED);
   if(!passed)
   {
      Print("[NOVA DYNAMIC BROKER INTERCEPT] FAIL");
      return;
   }
   Print("[NOVA DYNAMIC BROKER INTERCEPT] PASS: blocked=2 transport=0");
}
