#property strict

#define NOVA_PHASE2_EXECUTION_DISABLED true
#include <Trade\Trade.mqh>
#include "..\include\NOVA_BrokerAdapter.mqh"

void OnStart()
{
   Print("[NOVA DYNAMIC BROKER INTERCEPT] START");
   CTrade trade;
   bool passed=NOVA_BrokerAdapterSelfTest(trade,NOVA_PHASE2_EXECUTION_DISABLED);
   int report=FileOpen("NOVA_BrokerAdapter_RuntimeSelfTest.result.txt",FILE_WRITE|FILE_TXT|FILE_COMMON|FILE_ANSI);
   if(report!=INVALID_HANDLE)
   {
      FileWrite(report,passed?"PASS attempts=2 blocked=2 transport=0":"FAIL");
      FileFlush(report);
      FileClose(report);
   }
   if(!passed)
   {
      Print("[NOVA DYNAMIC BROKER INTERCEPT] FAIL");
      return;
   }
   Print("[NOVA DYNAMIC BROKER INTERCEPT] PASS: blocked=2 transport=0");
}
