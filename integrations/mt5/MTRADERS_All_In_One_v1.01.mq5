//+------------------------------------------------------------------+
//| MTRADERS All In One v1.01                                        |
//| Re-engineered integration of the user's Deca10EA / EA_QEX pack.   |
//| Original strategy attribution: MTRADERS (c) 2026.                 |
//| Native MetaEditor compilation remains required.                  |
//+------------------------------------------------------------------+
#property copyright "MTRADERS original strategies; All In One integration 2026"
#property version   "1.01"
#property description "Research scaffold only; trading disabled until NOVA gates are verified"
#property description "Hedging account required. Embedded defaults, no .set preset."
#property strict

#define MODULES 30
#define STATE_SIGNATURE 1095323465
#define STATE_VERSION 100
const string ENGINE_LABEL="MTRADERS All In One 1.01";

input group "=== Automatic operation ==="
input bool            InpTradeEnabled         = false;
input ENUM_TIMEFRAMES InpAnalysisTF           = PERIOD_M15;
input long            InpMagicBase            = 690711000;
input group "=== Risk policy (NOVA guarded defaults) ==="
input double          InpRiskPercent          = 1.0;
input bool            InpAllowBoundedMinLot    = false;
input double          InpMaxSingleRiskPct      = 1.0;
input double          InpMaxOpenRiskPct        = 9.0;
input int             InpMaxPositions          = 9;
input double          InpMaxMarginUsedPct      = 60.0;
input double          InpDailyLossPct          = 10.0;
input double          InpDailyProfitPct        = 0.0;
input group "=== Execution and display ==="
input double          InpMaxSpreadATR         = 0.12;
input int             InpDeviationBasePoints  = 30;
input bool            InpPanel                 = true;
input bool            InpJournal               = true;

enum ModuleId
{
   S_SUPERTREND=0, S_KELTNER, S_GOLDENCROSS, S_ROC, S_ALLIGATOR,
   S_ICHIMOKU, S_AWESOME, S_HEIKIN, S_PSAR, S_VWAP,
   S_FLOW, S_HOURBIAS, S_PIVOT, S_SESSIONHEAT, S_STRUCTURE,
   S_TRENDRADAR, S_VOL_BATCH, S_EFFORT, S_EXPERT_SWEEP, S_FOOTPRINT,
   S_LIQ_POOL, S_NEURAL, S_KILLZONE, S_QEX_SWEEP, S_VOL_ST,
   S_RANGE, S_SESSIONBOX, S_TRENDPILOT, S_VOL_QEX, S_WYCKOFF
};

struct ModuleState
{
   datetime evaluated_bar, consumed_key, last_entry, event_time, anchor_time;
   datetime pool_buy_used, pool_sell_used, retry_at, inflight_at;
   ulong inflight_order, position_id;
   double initial_risk, inflight_risk_money, hi, lo, extreme, extra, level_hi, level_lo;
   datetime level_hi_time, level_lo_time;
   int phase, bias, age, count, flags, attempts;
};
struct Candidate
{
   int dir;
   double sl, tp;
   datetime key, expiry;
   double atr;
   int tag;
};
struct EngineHeader
{
   int signature, version;
   long login, magic_base;
   uint symbol_hash;
   int timeframe;
   long generation;
   datetime saved_at, day;
   double day_equity, day_cash, peak_equity;
   int daily_block, manual_pause, flatten_request, rotation;
};

ModuleState gState[MODULES];
Candidate gCandidate[MODULES];
EngineHeader gHeader;
string gName[MODULES],gReason[MODULES];
int gEntriesToday[MODULES];
double gRealized[MODULES];
MqlRates gRates[];
double gATR[],gATR10[],gEMA20[],gEMA50[],gEMA200[],gRSI[],gSAR[];
double gSTLine[],gST14Line[];
int gSTDir[],gST14Dir[];
datetime gDataBar=0;
bool gDataOK=false,gTest=false,gStorageOK=true;

uint TextHash(const string s)
{
   uint h=2166136261;
   for(int i=0;i<StringLen(s);i++) h=(h^(uint)StringGetCharacter(s,i))*16777619;
   return h;
}
datetime DayStart(const datetime t) { return (datetime)((long)t/86400*86400); }
bool ValidNumber(const double x) { return MathIsValidNumber(x) && MathAbs(x)<1.0e100; }
long Magic(const int id) { return InpMagicBase+id; }
int MagicId(const long m)
{
   if(m<InpMagicBase || m>=InpMagicBase+MODULES) return -1;
   return (int)(m-InpMagicBase);
}
void Note(const int id,const string reason)
{
   if(id<0 || id>=MODULES || gReason[id]==reason) return;
   gReason[id]=reason;
}
void RegisterModules()
{
   gName[0]="SuperTrend";       gName[1]="KeltnerBreak";
   gName[2]="GoldenCross";      gName[3]="RocSurge";
   gName[4]="Alligator";        gName[5]="Ichimoku";
   gName[6]="AwesomeOsc";       gName[7]="HeikinPower";
   gName[8]="PsarDot";          gName[9]="VwapBand";
   gName[10]="FlowMatrix";      gName[11]="HourBias";
   gName[12]="PivotWheel";      gName[13]="SessionHeat";
   gName[14]="StructureMap";    gName[15]="TrendRadar";
   gName[16]="VolRegime-Batch"; gName[17]="EffortResult";
   gName[18]="ExpertQEXSweep";  gName[19]="FootprintLite";
   gName[20]="LiquidityPools";  gName[21]="NeuralPilot";
   gName[22]="KillZoneBreak";   gName[23]="QEX-LiqSweep";
   gName[24]="QEX-VolST";       gName[25]="RangeSniper";
   gName[26]="SessionBox";      gName[27]="TrendPilot";
   gName[28]="VolRegime-QEX";   gName[29]="WyckoffPhase";
   for(int i=0;i<MODULES;i++) Note(i,"WAIT DATA");
}
bool DirectionAllowed(const int dir)
{
   long mode=SymbolInfoInteger(_Symbol,SYMBOL_TRADE_MODE);
   if(mode==SYMBOL_TRADE_MODE_FULL) return true;
   return (dir>0 && mode==SYMBOL_TRADE_MODE_LONGONLY) ||
          (dir<0 && mode==SYMBOL_TRADE_MODE_SHORTONLY);
}


input group "=== Research signal controller ==="
input int             InpSignalBars            = 120;
input int             InpMinModuleVotes        = 2;
input double          InpMinConsensus           = 0.22;
input double          InpMaxOpposingShare       = 0.45;
input double          InpStopATR                = 2.0;
input double          InpTargetATR              = 3.0;

datetime gLastSignalBar=0;
int gLastSignal=0;
double gLastConsensus=0.0;
int gLastVotes=0;
int gLastOpposing=0;

double EMAAt(const int period,const int end_index)
{
   if(period<=0 || end_index<0) return 0.0;
   double alpha=2.0/(period+1.0), value=gRates[0].close;
   for(int i=1;i<=end_index;i++) value=alpha*gRates[i].close+(1.0-alpha)*value;
   return value;
}
double ATRAt(const int period,const int end_index)
{
   if(period<=0 || end_index<period) return 0.0;
   double total=0.0;
   int first=end_index-period+1;
   for(int i=first;i<=end_index;i++)
   {
      double prior=gRates[i-1].close;
      double tr=MathMax(gRates[i].high-gRates[i].low,
                 MathMax(MathAbs(gRates[i].high-prior),MathAbs(gRates[i].low-prior)));
      total+=tr;
   }
   return total/period;
}
double HighestHigh(const int count,const int end_index)
{
   if(count<=0 || end_index<count) return 0.0;
   double value=-DBL_MAX;
   for(int i=end_index-count;i<end_index;i++) value=MathMax(value,gRates[i].high);
   return value;
}
double LowestLow(const int count,const int end_index)
{
   if(count<=0 || end_index<count) return 0.0;
   double value=DBL_MAX;
   for(int i=end_index-count;i<end_index;i++) value=MathMin(value,gRates[i].low);
   return value;
}
int EvaluateNativeModule(const int id,const int end_index,const double atr,
                         const double ema10,const double ema20,const double ema50,
                         const double prior_high,const double prior_low)
{
   double close=gRates[end_index].close, previous=gRates[end_index-1].close;
   double direction=0.0, score=0.0;
   switch(id)
   {
      case 0: direction=(close>ema20 ? 1 : close<ema20 ? -1 : 0); break;
      case 1: direction=(close>ema20+2.0*atr && previous<=ema20+2.0*atr ? 1 :
                         close<ema20-2.0*atr && previous>=ema20-2.0*atr ? -1 : 0); break;
      case 2: direction=(ema20>ema50 ? 1 : ema20<ema50 ? -1 : 0); break;
      case 3: direction=(close/gRates[end_index-10].close-1.0>0.002 ? 1 :
                         close/gRates[end_index-10].close-1.0< -0.002 ? -1 : 0); break;
      case 4: direction=(ema10>ema20 && ema20>ema50 ? 1 :
                         ema10<ema20 && ema20<ema50 ? -1 : 0); break;
      case 5: direction=(close>ema20 && ema20>ema50 ? 1 :
                         close<ema20 && ema20<ema50 ? -1 : 0); break;
      case 6: direction=(close>ema10 && ema10>ema20 ? 1 :
                         close<ema10 && ema10<ema20 ? -1 : 0); break;
      case 7: direction=(close>gRates[end_index].open && previous>gRates[end_index-1].open ? 1 :
                         close<gRates[end_index].open && previous<gRates[end_index-1].open ? -1 : 0); break;
      case 8: direction=(ema10>ema20 && close>ema10 ? 1 :
                         ema10<ema20 && close<ema10 ? -1 : 0); break;
      case 9:
      case 10:
      case 12:
      case 17:
      case 19:
      case 25:
      case 29:
         direction=(close>ema20 && close>previous ? 1 :
                    close<ema20 && close<previous ? -1 : 0); break;
      case 14: direction=(close>prior_high && previous<=prior_high ? 1 :
                          close<prior_low && previous>=prior_low ? -1 : 0); break;
      case 15:
      case 27: direction=(ema10>ema20 && ema20>ema50 ? 1 :
                          ema10<ema20 && ema20<ema50 ? -1 : 0); break;
      case 16:
      case 24:
      case 28:
         direction=(close>prior_high && atr>0 ? 1 :
                    close<prior_low && atr>0 ? -1 : 0); break;
      case 18:
      case 20:
      case 23:
         direction=(gRates[end_index].low<prior_low && close>prior_low ? 1 :
                    gRates[end_index].high>prior_high && close<prior_high ? -1 : 0); break;
      case 21: // Transparent linear proxy; not a trained neural network.
         direction=(close/gRates[end_index-5].close-1.0>0.001 && ema20>ema50 ? 1 :
                    close/gRates[end_index-5].close-1.0< -0.001 && ema20<ema50 ? -1 : 0); break;
      default: direction=0.0; break; // UTC/session modules disabled without timezone mapping.
   }
   score=(direction==0.0 ? 0.0 : MathMin(1.0,MathAbs(close-ema20)/MathMax(atr*2.5,_Point)));
   return (int)direction;
}
bool EvaluateClosedBar()
{
   ArraySetAsSeries(gRates,false);
   int copied=CopyRates(_Symbol,InpAnalysisTF,1,InpSignalBars,gRates);
   if(copied<65) { gDataOK=false; return false; }
   int last=copied-1;
   datetime closed_bar=gRates[last].time;
   if(closed_bar<=0 || closed_bar==gLastSignalBar) return false;
   gLastSignalBar=closed_bar;
   double atr=ATRAt(14,last), ema10=EMAAt(10,last), ema20=EMAAt(20,last), ema50=EMAAt(50,last);
   if(atr<=0.0 || !ValidNumber(atr) || !ValidNumber(ema50)) { gDataOK=false; return false; }
   double prior_high=HighestHigh(20,last), prior_low=LowestLow(20,last);
   double long_weight=0.0,short_weight=0.0;
   int long_votes=0,short_votes=0;
   for(int id=0;id<MODULES;id++)
   {
      gCandidate[id].dir=0;
      int signal=EvaluateNativeModule(id,last,atr,ema10,ema20,ema50,prior_high,prior_low);
      if(signal>0) { long_votes++; long_weight+=1.0; Note(id,"LONG RESEARCH VOTE"); }
      else if(signal<0) { short_votes++; short_weight+=1.0; Note(id,"SHORT RESEARCH VOTE"); }
      else Note(id,(id==11 || id==13 || id==22 || id==26) ? "TIMEZONE MAP REQUIRED" : "NO SIGNAL");
   }
   int total_votes=long_votes+short_votes;
   double total_weight=long_weight+short_weight;
   double opposing=(total_weight>0.0 ? MathMin(long_weight,short_weight)/total_weight : 0.0);
   double consensus=(total_weight>0.0 ? (long_weight-short_weight)/total_weight : 0.0);
   int final_dir=(consensus>=InpMinConsensus ? 1 : consensus<=-InpMinConsensus ? -1 : 0);
   if(total_votes<InpMinModuleVotes || opposing>=InpMaxOpposingShare) final_dir=0;
   gLastSignal=final_dir; gLastConsensus=consensus; gLastVotes=total_votes; gLastOpposing=(int)MathRound(opposing*100.0);
   gDataOK=true;
   if(final_dir!=0)
   {
      // One aggregated candidate only; no module is allowed to submit its own order.
      gCandidate[0].dir=final_dir;
      gCandidate[0].atr=atr;
      gCandidate[0].sl=NormalizeDouble(gRates[last].close-final_dir*InpStopATR*atr,_Digits);
      gCandidate[0].tp=NormalizeDouble(gRates[last].close+final_dir*InpTargetATR*atr,_Digits);
      gCandidate[0].key=closed_bar;
      gCandidate[0].expiry=closed_bar+PeriodSeconds(InpAnalysisTF)*3;
      gCandidate[0].tag=30; // Meta-ensemble candidate, not module 0.
   }
   if(InpJournal)
      PrintFormat("%s | %s | signal=%d votes=%d long=%d short=%d consensus=%.3f opposing=%d%% ATR=%.5f",
         ENGINE_LABEL,_Symbol,final_dir,total_votes,long_votes,short_votes,consensus,gLastOpposing,atr);
   if(InpPanel)
      Comment(ENGINE_LABEL,"\n",_Symbol," ",EnumToString(InpAnalysisTF),
         "\nMode: SAFE RESEARCH / NO ORDERS",
         "\nMeta signal: ",(final_dir>0 ? "LONG CANDIDATE" : final_dir<0 ? "SHORT CANDIDATE" : "NO TRADE"),
         "\nVotes: ",long_votes," BUY / ",short_votes," SELL",
         "\nConsensus: ",DoubleToString(consensus,3)," | Opposing: ",gLastOpposing,"%",
         "\nSL/TP are research levels only");
   return true;
}

int OnInit()
{
   RegisterModules();
   if(InpTradeEnabled)
   {
      Print(ENGINE_LABEL,": execution request rejected; NOVA execution adapter is not yet certified.");
      return(INIT_FAILED);
   }
   if(InpSignalBars<70 || InpMinModuleVotes<2 || InpMinModuleVotes>MODULES ||
      InpMinConsensus<=0.0 || InpMinConsensus>1.0 || InpMaxOpposingShare<0.0 ||
      InpMaxOpposingShare>=0.5 || InpStopATR<=0.0 || InpTargetATR<=0.0)
   {
      Print(ENGINE_LABEL,": invalid research signal parameters.");
      return(INIT_PARAMETERS_INCORRECT);
   }
   ArraySetAsSeries(gRates,false);
   Print(ENGINE_LABEL," initialized in SAFE RESEARCH MODE; trading disabled. Symbol=",_Symbol);
   return(INIT_SUCCEEDED);
}
void OnDeinit(const int reason)
{
   Comment("");
   Print(ENGINE_LABEL," deinitialized.");
}
void OnTick()
{
   if(InpTradeEnabled) return; // Execution is deliberately hard-disabled in this build.
   EvaluateClosedBar();        // Closed-bar signal generation only; never sends broker orders.
}
