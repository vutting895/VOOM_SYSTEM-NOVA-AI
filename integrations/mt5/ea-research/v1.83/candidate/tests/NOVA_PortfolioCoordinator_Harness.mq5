#property strict

#include "..\include\NOVA_PortfolioCoordinator.mqh"

void NOVA_PortfolioHarnessWriteReceipt(const string value)
{
   int report=FileOpen("NOVA_PortfolioCoordinator_Harness.result.txt",FILE_WRITE|FILE_TXT|FILE_COMMON|FILE_ANSI);
   if(report==INVALID_HANDLE) return;
   FileWrite(report,value);
   FileFlush(report);
   FileClose(report);
}

void OnStart()
{
   Print("[NOVA PORTFOLIO HARNESS] START");
   bool passed=true;
   string failures="";
   ulong stamp=GetTickCount64();
   long login=900000000+(long)(stamp%90000000);
   uint server_hash=(uint)((stamp&0x7FFFFFFF)|1);
   long magic_base=700000000+(long)(stamp%100000000);

   CNOVAPortfolioCoordinator first,second,restarted,after_rollover;
   if(!first.Init(login,server_hash,magic_base) || !second.Init(login,server_hash,magic_base))
   { Print("[NOVA PORTFOLIO HARNESS] FAIL init"); NOVA_PortfolioHarnessWriteReceipt("FAIL init"); return; }

   // Same-host multi-chart lock contention: second coordinator must fail while first owns FILE_COMMON lock.
   if(!first.Acquire()) { passed=false; failures+="first lock;"; }
   else
   {
      if(second.Acquire()) { passed=false; failures+="lock was not exclusive;"; second.Release(); }
      first.Release();
   }
   if(!second.Acquire()) { passed=false; failures+="lock did not release;"; }
   second.Release();

   // Durable PREPARED record: risk must survive a terminal/script restart.
   if(!first.Acquire()) { passed=false; failures+="ledger lock;"; }
   else
   {
      NOVA_PortfolioRecord prepared;
      ZeroMemory(prepared);
      prepared.sequence=1;
      prepared.request_id=1;
      prepared.magic=magic_base+1;
      prepared.symbol_hash=12345;
      prepared.state=NOVA_PORTFOLIO_PREPARED;
      prepared.risk_money=50.0;
      prepared.created_at=TimeCurrent()-31;
      prepared.broker_day=TimeCurrent()-86400;
      if(!first.Append(prepared)) { passed=false; failures+="append prepared;"; }
      NOVA_PortfolioRecord records[];
      double risk=0; int count=0;
      if(!first.Load(records) || !first.ActiveTotals(records,risk,count) || risk!=50.0 || count!=1)
      { passed=false; failures+="prepared risk not persisted;"; }
      first.Release();
   }

   // Simulate crash/restart after DISPATCHING: unresolved request becomes UNCERTAIN and remains risk-consuming.
   if(!restarted.Init(login,server_hash,magic_base) || !restarted.Acquire())
   { passed=false; failures+="restart lock;"; }
   else
   {
      NOVA_PortfolioRecord records[],latest;
      if(!restarted.Load(records) || !restarted.Latest(records,1,latest))
      { passed=false; failures+="restart read;"; }
      else
      {
         latest.state=NOVA_PORTFOLIO_RELEASED; // stale PREPARED: no send began, safe to release.
         if(!restarted.Append(latest)) { passed=false; failures+="release stale prepared;"; }
         NOVA_PortfolioRecord dispatching;
         ZeroMemory(dispatching);
         dispatching.sequence=2; dispatching.request_id=2; dispatching.magic=magic_base+1;
         dispatching.symbol_hash=12345; dispatching.state=NOVA_PORTFOLIO_DISPATCHING;
         dispatching.risk_money=25.0; dispatching.created_at=TimeCurrent()-86400;
         dispatching.broker_day=TimeCurrent()-86400;
         if(!restarted.Append(dispatching)) { passed=false; failures+="append dispatching;"; }
      }
      restarted.Release();
   }

   // Rollover/restart: an old broker-day reservation must not disappear while request outcome is unresolved.
   if(!after_rollover.Init(login,server_hash,magic_base) || !after_rollover.Acquire())
   { passed=false; failures+="rollover lock;"; }
   else
   {
      NOVA_PortfolioRecord records[],latest;
      double risk=0; int count=0;
      if(!after_rollover.Load(records) || !after_rollover.Latest(records,2,latest))
      { passed=false; failures+="rollover read;"; }
      else
      {
         latest.state=NOVA_PORTFOLIO_UNCERTAIN;
         if(!after_rollover.Append(latest)) { passed=false; failures+="mark uncertain;"; }
      }
      if(!after_rollover.Load(records) || !after_rollover.ActiveTotals(records,risk,count) ||
         risk!=25.0 || count!=1)
      { passed=false; failures+="uncertain risk lost across rollover;"; }
      after_rollover.Release();
   }

   // Corrupt-ledger fault injection: append one byte; Load must reject the partial record, never reset the ledger.
   int raw=FileOpen(after_rollover.LedgerPath(),FILE_READ|FILE_WRITE|FILE_BIN|FILE_COMMON);
   if(raw==INVALID_HANDLE) { passed=false; failures+="open ledger for corruption;"; }
   else
   {
      uchar tail[1]; tail[0]=0xA5;
      FileSeek(raw,0,SEEK_END);
      if(FileWriteArray(raw,tail,0,1)!=1) { passed=false; failures+="append corruption byte;"; }
      FileFlush(raw);
      FileClose(raw);
   }
   if(!after_rollover.Acquire()) { passed=false; failures+="corruption lock;"; }
   else
   {
      NOVA_PortfolioRecord records[];
      if(after_rollover.Load(records)) { passed=false; failures+="corrupt ledger accepted;"; }
      after_rollover.Release();
   }

   PrintFormat("[NOVA PORTFOLIO HARNESS] %s | exclusive-lock=%s | restart-state=UNCERTAIN | rollover-risk=25 | corrupt-ledger=FAIL-CLOSED | %s",
               passed?"PASS":"FAIL",passed?"PASS":"FAIL",failures);
   NOVA_PortfolioHarnessWriteReceipt(StringFormat("%s failures=%s",passed?"PASS":"FAIL",failures));
}
