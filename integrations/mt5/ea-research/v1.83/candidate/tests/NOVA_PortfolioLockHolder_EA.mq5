#property strict
#include "..\include\NOVA_PortfolioCoordinator.mqh"
void NOVA_Write(const string value)
{
   int f=FileOpen("NOVA_Portfolio_MultiTerminal_Holder.result.txt",FILE_WRITE|FILE_TXT|FILE_COMMON|FILE_ANSI);
   if(f==INVALID_HANDLE) return; FileWrite(f,value); FileFlush(f); FileClose(f);
}
int OnInit()
{
   CNOVAPortfolioCoordinator coordinator;
   if(!coordinator.Init(998877665,0x4E4F5641,99887766) || !coordinator.Acquire())
   { NOVA_Write("FAIL holder could not acquire"); ExpertRemove(); return INIT_FAILED; }
   NOVA_Write("HOLDER_ACQUIRED");
   Print("[NOVA MULTI-TERMINAL] HOLDER_ACQUIRED");
   Sleep(20000);
   coordinator.Release();
   NOVA_Write("HOLDER_RELEASED");
   Print("[NOVA MULTI-TERMINAL] HOLDER_RELEASED");
   ExpertRemove();
   return INIT_SUCCEEDED;
}
void OnDeinit(const int reason) {}
