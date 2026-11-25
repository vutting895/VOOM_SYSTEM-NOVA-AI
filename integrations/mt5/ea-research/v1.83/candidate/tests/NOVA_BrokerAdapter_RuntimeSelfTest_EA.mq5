#property strict
#define NOVA_PHASE2_EXECUTION_DISABLED true
#include <Trade\Trade.mqh>
#include "..\include\NOVA_BrokerAdapter.mqh"

void NOVA_WriteReceipt(const string value)
{
   int f=FileOpen("NOVA_BrokerAdapter_RuntimeSelfTest_EA.result.txt",FILE_WRITE|FILE_TXT|FILE_COMMON|FILE_ANSI);
   if(f==INVALID_HANDLE) return;
   FileWrite(f,value); FileFlush(f); FileClose(f);
}
int OnInit()
{
   CTrade trade;
   bool passed=NOVA_BrokerAdapterSelfTest(trade,NOVA_PHASE2_EXECUTION_DISABLED);
   string result=passed?"PASS attempts=2 blocked=2 transport=0":"FAIL";
   NOVA_WriteReceipt(result);
   Print("[NOVA DYNAMIC BROKER INTERCEPT EA] ",result);
   ExpertRemove();
   return INIT_SUCCEEDED;
}
void OnDeinit(const int reason) {}
