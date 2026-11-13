//+------------------------------------------------------------------+
//| NOVA_MT5_AI_EA                                                    |
//| Version 2.002 - Demo-only 30-module research signal producer      |
//| No broker order, position, or account mutation methods.           |
//+------------------------------------------------------------------+
#property strict
#property version   "2.002"
#property description "NOVA Demo-only 30-module signal producer; execution absent"
#include "StrategyEngine30.mqh"

#define MODULE_COUNT 30
input group "=== HARD SAFETY ==="
input bool InpDemoOnly = true;
input group "=== SIGNAL ENGINE ==="
input ENUM_TIMEFRAMES InpSignalTF = PERIOD_M15;
input int InpBarsToLoad = 300;
input bool InpSignalScanEnabled = true;
input bool InpLogModuleStatus = true;
input group "=== RESEARCH CANDIDATE (NO EXECUTION) ==="
input double InpCandidateVolume = 0.0;
input int InpStopLossPoints = 0;
input group "=== LOCAL CONTROLLER (OFF BY DEFAULT) ==="
input bool InpControllerBridgeEnabled = false;
input string InpControllerUrl = "http://127.0.0.1:8765/v1/decision";
input string InpControllerTokenFile = "nova-local-controller.token";
input int InpControllerTimeoutMs = 2500;

string gModuleNames[MODULE_COUNT];
datetime gLastClosedBar = 0;
bool gSafetyReady = false;

void RegisterModules()
{
   gModuleNames[0]="SuperTrend"; gModuleNames[1]="KeltnerBreak";
   gModuleNames[2]="GoldenCross"; gModuleNames[3]="RocSurge";
   gModuleNames[4]="Alligator"; gModuleNames[5]="Ichimoku";
   gModuleNames[6]="AwesomeOsc"; gModuleNames[7]="HeikinPower";
   gModuleNames[8]="PsarDot"; gModuleNames[9]="VwapBand";
   gModuleNames[10]="FlowMatrix"; gModuleNames[11]="HourBias";
   gModuleNames[12]="PivotWheel"; gModuleNames[13]="SessionHeat";
   gModuleNames[14]="StructureMap"; gModuleNames[15]="TrendRadar";
   gModuleNames[16]="VolRegime-Batch"; gModuleNames[17]="EffortResult";
   gModuleNames[18]="ExpertQEXSweep"; gModuleNames[19]="FootprintLite";
   gModuleNames[20]="LiquidityPools"; gModuleNames[21]="NeuralPilot";
   gModuleNames[22]="KillZoneBreak"; gModuleNames[23]="QEX-LiqSweep";
   gModuleNames[24]="QEX-VolST"; gModuleNames[25]="RangeSniper";
   gModuleNames[26]="SessionBox"; gModuleNames[27]="TrendPilot";
   gModuleNames[28]="VolRegime-QEX"; gModuleNames[29]="WyckoffPhase";
}

bool IsDemoAccount()
{
   return ((ENUM_ACCOUNT_TRADE_MODE)AccountInfoInteger(ACCOUNT_TRADE_MODE)
           == ACCOUNT_TRADE_MODE_DEMO);
}

string ReadLocalControllerToken()
{
   int handle=FileOpen(InpControllerTokenFile,FILE_READ|FILE_TXT|FILE_ANSI);
   if(handle==INVALID_HANDLE) return "";
   string token=FileReadString(handle);
   FileClose(handle);
   StringTrimLeft(token);
   StringTrimRight(token);
   return token;
}

bool SafetyPreflight()
{
   if(!InpDemoOnly || !IsDemoAccount())
   {
      Print("NOVA_EA BLOCKED: Demo account required.");
      return false;
   }
   if(InpBarsToLoad<60 || InpBarsToLoad>5000 ||
      InpStopLossPoints<0 || InpStopLossPoints>100000 ||
      InpCandidateVolume<0.0)
   {
      Print("NOVA_EA BLOCKED: invalid history or candidate inputs.");
      return false;
   }
   if(InpControllerBridgeEnabled)
   {
      if(InpControllerUrl!="http://127.0.0.1:8765/v1/decision" ||
         InpControllerTimeoutMs<500 || InpControllerTimeoutMs>5000 ||
         InpCandidateVolume<=0.0 || InpStopLossPoints<=0 ||
         StringLen(ReadLocalControllerToken())<32)
      {
         Print("NOVA_EA BLOCKED: Controller URL/token or candidate plan invalid.");
         return false;
      }
   }
   return true;
}

string UtcIso(datetime value)
{
   string out=TimeToString(value,TIME_DATE|TIME_SECONDS);
   StringReplace(out,".","-");
   StringReplace(out," ","T");
   return out+"Z";
}
string VoteText(int vote)
{
   if(vote>0) return "BUY";
   if(vote<0) return "SELL";
   return "NEUTRAL";
}
string TimeframeLabel(ENUM_TIMEFRAMES timeframe)
{
   string label=EnumToString(timeframe);
   StringReplace(label,"PERIOD_","");
   return label;
}

bool JsonBooleanIsFalse(string json,string key)
{
   string needle="\""+key+"\"";
   int p=StringFind(json,needle);
   if(p<0) return false;
   int colon=StringFind(json,":",p+StringLen(needle));
   if(colon<0) return false;
   int i=colon+1;
   while(i<StringLen(json) &&
         (StringGetCharacter(json,i)==' ' ||
          StringGetCharacter(json,i)=='\t' ||
          StringGetCharacter(json,i)=='\r' ||
          StringGetCharacter(json,i)=='\n')) i++;
   return StringSubstr(json,i,5)=="false";
}

string ExtractJsonString(string json,string key)
{
   string needle="\""+key+"\"";
   int p=StringFind(json,needle);
   if(p<0) return "";
   int colon=StringFind(json,":",p+StringLen(needle));
   if(colon<0) return "";
   int q1=StringFind(json,"\"",colon+1);
   if(q1<0) return "";
   int q2=StringFind(json,"\"",q1+1);
   if(q2<0) return "";
   return StringSubstr(json,q1+1,q2-q1-1);
}

string BuildCandidateJson(string side,double entry,double stop)
{
   return StringFormat(
      "\"candidate\":{\"symbol\":\"%s\",\"side\":\"%s\",\"volume\":%.8f,\"entry_price\":%.10f,\"stop_loss\":%.10f}",
      _Symbol,side,InpCandidateVolume,entry,stop);
}

string BuildSignalPayload(datetime barUtc,double bid,double ask,
                          int buyVotes,int sellVotes,int neutralVotes,int &votes[])
{
   long barEpoch=(long)barUtc;
   string eventId=_Symbol+"-"+EnumToString(InpSignalTF)+"-"+IntegerToString(barEpoch);
   string payload=StringFormat(
      "{\"schema_version\":\"mt5ea.signal.v1\",\"event_id\":\"%s\",\"symbol\":\"%s\",\"timeframe\":\"%s\",\"account_mode\":\"DEMO\",\"bar_time_utc\":\"%s\",\"bid\":%.10f,\"ask\":%.10f,\"spread_points\":%.2f,\"buy_votes\":%d,\"sell_votes\":%d,\"neutral_votes\":%d,\"module_votes\":[",
      eventId,_Symbol,TimeframeLabel(InpSignalTF),UtcIso(barUtc),
      bid,ask,(ask-bid)/_Point,buyVotes,sellVotes,neutralVotes);
   for(int i=0;i<MODULE_COUNT;i++)
   {
      if(i>0) payload+=",";
      payload+=StringFormat("{\"name\":\"%s\",\"vote\":\"%s\"}",
                            gModuleNames[i],VoteText(votes[i]));
   }
   payload+="]";
   if(buyVotes>sellVotes && InpCandidateVolume>0.0 && InpStopLossPoints>0)
      payload+=","+BuildCandidateJson("BUY",ask,ask-InpStopLossPoints*_Point);
   else if(sellVotes>buyVotes && InpCandidateVolume>0.0 && InpStopLossPoints>0)
      payload+=","+BuildCandidateJson("SELL",bid,bid+InpStopLossPoints*_Point);
   payload+="}";
   return payload;
}

bool SendSignalToController(datetime barTime,int buyVotes,int sellVotes,
                            int neutralVotes,int &votes[])
{
   if(!InpControllerBridgeEnabled) return false;
   if(buyVotes==sellVotes || InpCandidateVolume<=0.0 || InpStopLossPoints<=0)
   {
      Print("NOVA_CONTROLLER WAIT: no directional candidate or sizing plan.");
      return false;
   }
   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick) || tick.bid<=0 || tick.ask<tick.bid)
   {
      Print("NOVA_CONTROLLER WAIT: invalid market tick.");
      return false;
   }
   int serverOffset=(int)(TimeTradeServer()-TimeGMT());
   datetime barUtc=barTime-serverOffset;
   string payload=BuildSignalPayload(barUtc,tick.bid,tick.ask,
                                     buyVotes,sellVotes,neutralVotes,votes);
   string token=ReadLocalControllerToken();
   if(StringLen(token)<32) return false;

   char post[],result[];
   int copied=StringToCharArray(payload,post,0,WHOLE_ARRAY,CP_UTF8);
   if(copied<=1) return false;
   ArrayResize(post,copied-1);
   string headers="Content-Type: application/json\r\nAuthorization: Bearer "+token+"\r\n";
   string responseHeaders="";
   ResetLastError();
   int status=WebRequest("POST",InpControllerUrl,headers,InpControllerTimeoutMs,
                         post,result,responseHeaders);
   if(status==-1)
   {
      Print("NOVA_CONTROLLER WAIT: WebRequest error=",GetLastError(),
            "; allow-list only http://127.0.0.1:8765");
      return false;
   }
   string body=CharArrayToString(result,0,-1,CP_UTF8);
   if(status!=200)
   {
      Print("NOVA_CONTROLLER WAIT: HTTP status=",status);
      return false;
   }
   string schema=ExtractJsonString(body,"schema_version");
   string eventId=ExtractJsonString(body,"event_id");
   string decision=ExtractJsonString(body,"decision");
   string expectedId=_Symbol+"-"+EnumToString(InpSignalTF)+"-"+IntegerToString((long)barUtc);
   if(schema!="mt5ea.decision.v1" || eventId!=expectedId ||
      (decision!="WAIT" && decision!="REJECT") ||
      !JsonBooleanIsFalse(body,"ordersEnabled") ||
      !JsonBooleanIsFalse(body,"executionEnabled") ||
      !JsonBooleanIsFalse(body,"liveTradingEnabled"))
   {
      Print("NOVA_CONTROLLER BLOCKED: response contract/flags invalid.");
      return false;
   }
   Print("NOVA_CONTROLLER response=",decision," event_id=",eventId,
         "; no broker action exists.");
   return true;
}

int OnInit()
{
   RegisterModules();
   gSafetyReady=SafetyPreflight();
   if(!gSafetyReady) return INIT_FAILED;
   Print("NOVA_MT5_AI_EA v2.002 ready: DEMO ONLY; 30 heuristic modules; execution absent.");
   Print("Controller Bridge=",InpControllerBridgeEnabled,
         "; candidate volume and stop points default to zero.");
   return INIT_SUCCEEDED;
}
void OnDeinit(const int reason)
{
   Print("NOVA_MT5_AI_EA stopped. reason=",reason);
}
void OnTick()
{
   if(!gSafetyReady || !InpSignalScanEnabled) return;
   datetime closedBar=iTime(_Symbol,InpSignalTF,1);
   if(closedBar<=0 || closedBar==gLastClosedBar) return;
   gLastClosedBar=closedBar;

   MqlRates bars[];
   ArraySetAsSeries(bars,true);
   int copied=CopyRates(_Symbol,InpSignalTF,0,InpBarsToLoad,bars);
   if(copied<60)
   {
      Print("NOVA_EA WAIT: insufficient closed-bar data; copied=",copied);
      return;
   }

   int buyVotes=0,sellVotes=0,neutralVotes=0;
   int votes[MODULE_COUNT];
   string voteSummary="";
   for(int i=0;i<MODULE_COUNT;i++)
   {
      votes[i]=EvalStrategy30(i,_Symbol,InpSignalTF,bars,copied);
      if(votes[i]>0) buyVotes++;
      else if(votes[i]<0) sellVotes++;
      else neutralVotes++;
      voteSummary+=gModuleNames[i]+":"+VoteText(votes[i])+";";
   }
   if(InpLogModuleStatus)
      Print("NOVA_MODULE_SCAN symbol=",_Symbol," tf=",EnumToString(InpSignalTF),
            " bar=",TimeToString(closedBar)," BUY=",buyVotes,
            " SELL=",sellVotes," NEUTRAL=",neutralVotes," votes=",voteSummary);
   if(InpControllerBridgeEnabled)
      SendSignalToController(closedBar,buyVotes,sellVotes,neutralVotes,votes);
   else
      Print("NOVA_RESEARCH_ONLY: scan complete; Controller OFF; execution absent.");
}

// No OrderSend, CTrade, PositionOpen, Buy, Sell, pending-order,
// close, amend, transfer, withdrawal, or local risk-approval implementation.
