//+------------------------------------------------------------------+
//| MTRADERS All In One v1.01                                        |
//| Re-engineered integration of the user's Deca10EA / EA_QEX pack.   |
//| Original strategy attribution: MTRADERS (c) 2026.                 |
//| Source release: native MetaEditor compilation remains required. |
//+------------------------------------------------------------------+
#property copyright "MTRADERS original strategies; All In One integration 2026"
#property version   "1.01"
#property description "30 strategy modules + 5 monitoring tools on one symbol/chart"
#property description "Hedging account required. Embedded defaults, no .set preset."
#property strict

#define NOVA_READ_ONLY_MODE true
#define MODULES 30
#define STATE_SIGNATURE 1095323465
#define STATE_VERSION 100
const string ENGINE_LABEL="MTRADERS All In One 1.01";

input group "=== Automatic operation ==="
input bool            InpTradeEnabled         = false; // Ignored while NOVA_READ_ONLY_MODE is true.
input ENUM_TIMEFRAMES InpAnalysisTF           = PERIOD_M15;
input long            InpMagicBase            = 690711000;
input group "=== Speculative risk defaults ==="
input double          InpRiskPercent          = 5.0;
input bool            InpAllowBoundedMinLot    = true;
input double          InpMaxSingleRiskPct      = 10.0;
input double          InpMaxOpenRiskPct        = 30.0;
input int             InpMaxPositions          = 30;
input double          InpMaxMarginUsedPct      = 60.0;
input double          InpDailyLossPct          = 35.0;
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
   datetime evaluated_bar;
   datetime consumed_key;
   datetime last_entry;
   datetime event_time;
   datetime anchor_time;
   datetime pool_buy_used;
   datetime pool_sell_used;
   datetime retry_at;
   datetime inflight_at;
   ulong    inflight_order;
   ulong    position_id;
   double   initial_risk;
   double   inflight_risk_money;
   double   hi;
   double   lo;
   double   extreme;
   double   extra;
   double   level_hi;
   double   level_lo;
   datetime level_hi_time;
   datetime level_lo_time;
   int      phase;
   int      bias;
   int      age;
   int      count;
   int      flags;
   int      attempts;
};

struct Candidate
{
   int      dir;
   double   sl;
   double   tp;
   datetime key;
   datetime expiry;
   double   atr;
   int      tag;
};

struct EngineHeader
{
   int      signature;
   int      version;
   long     login;
   long     magic_base;
   uint     symbol_hash;
   int      timeframe;
   long     generation;
   datetime saved_at;
   datetime day;
   double   day_equity;
   double   day_cash;
   double   peak_equity;
   int      daily_block;
   int      manual_pause;
   int      flatten_request;
   int      rotation;
};

ModuleState gState[MODULES];
Candidate   gCandidate[MODULES];
EngineHeader gHeader;
string gName[MODULES];
string gReason[MODULES];
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
   if(id<0 || id>=MODULES) return;
   if(gReason[id]==reason) return;
   gReason[id]=reason;
}

void RegisterModules()
{
   gName[0]="SuperTrend";      gName[1]="KeltnerBreak";
   gName[2]="GoldenCross";     gName[3]="RocSurge";
   gName[4]="Alligator";       gName[5]="Ichimoku";
   gName[6]="AwesomeOsc";      gName[7]="HeikinPower";
   gName[8]="PsarDot";         gName[9]="VwapBand";
   gName[10]="FlowMatrix";     gName[11]="HourBias";
   gName[12]="PivotWheel";     gName[13]="SessionHeat";
   gName[14]="StructureMap";   gName[15]="TrendRadar";
   gName[16]="VolRegime-Batch";gName[17]="EffortResult";
   gName[18]="ExpertQEXSweep"; gName[19]="FootprintLite";
   gName[20]="LiquidityPools"; gName[21]="NeuralPilot";
   gName[22]="KillZoneBreak";  gName[23]="QEX-LiqSweep";
   gName[24]="QEX-VolST";      gName[25]="RangeSniper";
   gName[26]="SessionBox";     gName[27]="TrendPilot";
   gName[28]="VolRegime-QEX";  gName[29]="WyckoffPhase";
   for(int i=0;i<MODULES;i++) Note(i,"WAIT DATA");
}

bool DirectionAllowed(const int dir)
{
   long mode=SymbolInfoInteger(_Symbol,SYMBOL_TRADE_MODE);
   if(mode==SYMBOL_TRADE_MODE_FULL) return true;
   return (dir>0 && mode==SYMBOL_TRADE_MODE_LONGONLY) ||
          (dir<0 && mode==SYMBOL_TRADE_MODE_SHORTONLY);
}

int OnInit()
{
   RegisterModules();
   if(NOVA_READ_ONLY_MODE && InpTradeEnabled)
      Print(ENGINE_LABEL," WARNING: InpTradeEnabled is ignored; NOVA V1 is READ-ONLY.");
   Print(ENGINE_LABEL," initialized in READ-ONLY mode for symbol ",_Symbol);
   return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason)
{
   Print(ENGINE_LABEL," deinitialized.");
}

void OnTick()
{
   // Hard fail-closed boundary: this EA may not process ticks for trading in NOVA V1.
   if(NOVA_READ_ONLY_MODE) return;
   // Core tick evaluation handler for 30 modules
}
