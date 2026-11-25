#property strict
#include "..\include\NOVA_PortfolioCoordinator.mqh"
void NOVA_Write(const string value)
{
   int f=FileOpen("NOVA_Portfolio_MultiTerminal_Contender.result.txt",FILE_WRITE|FILE_TXT|FILE_COMMON|FILE_ANSI);
   if(f==INVALID_HANDLE) return; FileWrite(f,value); FileFlush(f); FileClose(f);
}
int OnInit()
{
   Sleep(1500);
   CNOVAPortfolioCoordinator coordinator;
   if(!coordinator.Init(998877665,0x4E4F5641,99887766))
   { NOVA_Write("FAIL init"); ExpertRemove(); return INIT_FAILED; }
   bool acquired=coordinator.Acquire();
   if(acquired)
   {
      coordinator.Release();
      NOVA_Write("FAIL contender acquired concurrent lock");
      Print("[NOVA MULTI-TERMINAL] FAIL contender acquired lock");
   }
   else
   {
      NOVA_Write("PASS contender blocked by holder");
      Print("[NOVA MULTI-TERMINAL] PASS contender blocked by holder");
   }
   ExpertRemove();
   return INIT_SUCCEEDED;
}
void OnDeinit(const int reason) {}
