//+------------------------------------------------------------------+
//| NOVA Core Strategy v1.82 — signal-only / READ-ONLY                |
//| Clean-room implementation of the approved v1.83 strategy ideas.  |
//| No order, position, modify, close, or broker execution functions. |
//+------------------------------------------------------------------+
#ifndef NOVA_CORE_STRATEGY_V182_MQH
#define NOVA_CORE_STRATEGY_V182_MQH

#define NOVA_CORE_TF PERIOD_M15
#define NOVA_CORE_LOOKBACK_BOS 20
#define NOVA_CORE_SETUP_MAX_BARS 12
#define NOVA_CORE_RR 2.5

int      gNovaCoreH1Fast=INVALID_HANDLE;
int      gNovaCoreH1Slow=INVALID_HANDLE;
int      gNovaCoreH4Fast=INVALID_HANDLE;
int      gNovaCoreH4Slow=INVALID_HANDLE;
int      gNovaCoreM15Fast=INVALID_HANDLE;
int      gNovaCoreM15Slow=INVALID_HANDLE;
int      gNovaCoreM15Rsi=INVALID_HANDLE;
int      gNovaCoreM15Atr=INVALID_HANDLE;
int      gNovaCoreM15Atr50=INVALID_HANDLE;
datetime gNovaCoreLastBar=0;
datetime gNovaCoreLastSignal=0;
int      gNovaCoreSetupDir=0;
datetime gNovaCoreSetupTime=0;
double   gNovaCoreObLow=0.0;
double   gNovaCoreObHigh=0.0;
double   gNovaCoreFvgLow=0.0;
double   gNovaCoreFvgHigh=0.0;
double   gNovaCoreEq=0.0;
double   gNovaCoreSwingExtreme=0.0;

bool NovaCoreCopy(const int handle,const int count,double &out[])
{
   if(handle==INVALID_HANDLE) return false;
   ArrayResize(out,count);
   ArraySetAsSeries(out,true);
   return CopyBuffer(handle,0,0,count,out)==count;
}

double NovaCoreHighest(const MqlRates &rates[],const int first,const int last)
{
   double value=-DBL_MAX;
   for(int i=first;i<=last && i<ArraySize(rates);i++) value=MathMax(value,rates[i].high);
   return value;
}

double NovaCoreLowest(const MqlRates &rates[],const int first,const int last)
{
   double value=DBL_MAX;
   for(int i=first;i<=last && i<ArraySize(rates);i++) value=MathMin(value,rates[i].low);
   return value;
}

int NovaCoreSuperTrendDirection(const MqlRates &rates[],const double &atr[])
{
   if(ArraySize(rates)<34 || ArraySize(atr)<34) return 0;
   double finalUpper=0.0,finalLower=0.0;
   int direction=1;
   for(int i=30;i>=1;i--)
   {
      if(atr[i]<=0.0) return 0;
      double mid=(rates[i].high+rates[i].low)*0.5;
      double basicUpper=mid+3.0*atr[i];
      double basicLower=mid-3.0*atr[i];
      if(i==30) { finalUpper=basicUpper; finalLower=basicLower; continue; }
      double prevClose=rates[i+1].close;
      finalUpper=(basicUpper<finalUpper || prevClose>finalUpper)?basicUpper:finalUpper;
      finalLower=(basicLower>finalLower || prevClose<finalLower)?basicLower:finalLower;
      if(rates[i].close>finalUpper) direction=1;
      else if(rates[i].close<finalLower) direction=-1;
   }
   return direction;
}

bool NovaCoreBullWick(const MqlRates &bar,const double atr)
{
   double body=MathMax(MathAbs(bar.close-bar.open),0.05*atr);
   double lower=MathMin(bar.open,bar.close)-bar.low;
   double range=bar.high-bar.low;
   return range>0.0 && bar.close>bar.open &&
          lower>=1.2*body && lower>=0.25*atr &&
          bar.close>(bar.high+bar.low)*0.5;
}

bool NovaCoreBearWick(const MqlRates &bar,const double atr)
{
   double body=MathMax(MathAbs(bar.close-bar.open),0.05*atr);
   double upper=bar.high-MathMax(bar.open,bar.close);
   double range=bar.high-bar.low;
   return range>0.0 && bar.close<bar.open &&
          upper>=1.2*body && upper>=0.25*atr &&
          bar.close<(bar.high+bar.low)*0.5;
}

bool NovaCoreInit()
{
   gNovaCoreH1Fast=iMA(_Symbol,PERIOD_H1,20,0,MODE_EMA,PRICE_CLOSE);
   gNovaCoreH1Slow=iMA(_Symbol,PERIOD_H1,50,0,MODE_EMA,PRICE_CLOSE);
   gNovaCoreH4Fast=iMA(_Symbol,PERIOD_H4,20,0,MODE_EMA,PRICE_CLOSE);
   gNovaCoreH4Slow=iMA(_Symbol,PERIOD_H4,50,0,MODE_EMA,PRICE_CLOSE);
   gNovaCoreM15Fast=iMA(_Symbol,NOVA_CORE_TF,20,0,MODE_EMA,PRICE_CLOSE);
   gNovaCoreM15Slow=iMA(_Symbol,NOVA_CORE_TF,50,0,MODE_EMA,PRICE_CLOSE);
   gNovaCoreM15Rsi=iRSI(_Symbol,NOVA_CORE_TF,14,PRICE_CLOSE);
   gNovaCoreM15Atr=iATR(_Symbol,NOVA_CORE_TF,14);
   gNovaCoreM15Atr50=iATR(_Symbol,NOVA_CORE_TF,50);
   if(gNovaCoreH1Fast==INVALID_HANDLE || gNovaCoreH1Slow==INVALID_HANDLE ||
      gNovaCoreH4Fast==INVALID_HANDLE || gNovaCoreH4Slow==INVALID_HANDLE ||
      gNovaCoreM15Fast==INVALID_HANDLE || gNovaCoreM15Slow==INVALID_HANDLE ||
      gNovaCoreM15Rsi==INVALID_HANDLE || gNovaCoreM15Atr==INVALID_HANDLE ||
      gNovaCoreM15Atr50==INVALID_HANDLE)
   {
      Print("NOVA CORE: indicator initialization failed; signal engine disabled.");
      return false;
   }
   Print("NOVA CORE v1.82 initialized in signal-only READ-ONLY mode.");
   return true;
}

void NovaCoreDeinit()
{
   if(gNovaCoreH1Fast!=INVALID_HANDLE) IndicatorRelease(gNovaCoreH1Fast);
   if(gNovaCoreH1Slow!=INVALID_HANDLE) IndicatorRelease(gNovaCoreH1Slow);
   if(gNovaCoreH4Fast!=INVALID_HANDLE) IndicatorRelease(gNovaCoreH4Fast);
   if(gNovaCoreH4Slow!=INVALID_HANDLE) IndicatorRelease(gNovaCoreH4Slow);
   if(gNovaCoreM15Fast!=INVALID_HANDLE) IndicatorRelease(gNovaCoreM15Fast);
   if(gNovaCoreM15Slow!=INVALID_HANDLE) IndicatorRelease(gNovaCoreM15Slow);
   if(gNovaCoreM15Rsi!=INVALID_HANDLE) IndicatorRelease(gNovaCoreM15Rsi);
   if(gNovaCoreM15Atr!=INVALID_HANDLE) IndicatorRelease(gNovaCoreM15Atr);
   if(gNovaCoreM15Atr50!=INVALID_HANDLE) IndicatorRelease(gNovaCoreM15Atr50);
}

void NovaCoreDetectBos(const MqlRates &rates[],const double atr)
{
   double priorHigh=NovaCoreHighest(rates,2,NOVA_CORE_LOOKBACK_BOS+1);
   double priorLow=NovaCoreLowest(rates,2,NOVA_CORE_LOOKBACK_BOS+1);
   int dir=0;
   if(rates[1].close>priorHigh && rates[1].close>rates[1].open) dir=1;
   if(rates[1].close<priorLow && rates[1].close<rates[1].open) dir=-1;
   if(dir==0 || atr<=0.0) return;

   gNovaCoreSetupDir=dir;
   gNovaCoreSetupTime=rates[1].time;
   double rangeHigh=NovaCoreHighest(rates,2,51);
   double rangeLow=NovaCoreLowest(rates,2,51);
   gNovaCoreEq=(rangeHigh+rangeLow)*0.5;
   gNovaCoreSwingExtreme=(dir>0?rangeLow:rangeHigh);
   gNovaCoreObLow=0.0; gNovaCoreObHigh=0.0;
   gNovaCoreFvgLow=0.0; gNovaCoreFvgHigh=0.0;

   // Nearest opposing closed candle before the break is an OB candidate.
   for(int k=2;k<=8;k++)
   {
      bool opposing=(dir>0?rates[k].close<rates[k].open:rates[k].close>rates[k].open);
      if(opposing)
      {
         gNovaCoreObLow=rates[k].low;
         gNovaCoreObHigh=rates[k].high;
         break;
      }
   }
   // Three-candle imbalance candidate; only closed candles are used.
   if(dir>0 && rates[1].low>rates[3].high)
   { gNovaCoreFvgLow=rates[3].high; gNovaCoreFvgHigh=rates[1].low; }
   if(dir<0 && rates[1].high<rates[3].low)
   { gNovaCoreFvgLow=rates[1].high; gNovaCoreFvgHigh=rates[3].low; }
}

void NovaCoreEvaluate()
{
   MqlRates rates[];
   ArraySetAsSeries(rates,true);
   if(CopyRates(_Symbol,NOVA_CORE_TF,0,96,rates)<96) return;
   if(rates[0].time==gNovaCoreLastBar) return;
   gNovaCoreLastBar=rates[0].time;

   double h1Fast[],h1Slow[],h4Fast[],h4Slow[],m15Fast[],m15Slow[],rsi[],atr[],atr50[];
   if(!NovaCoreCopy(gNovaCoreH1Fast,3,h1Fast) || !NovaCoreCopy(gNovaCoreH1Slow,3,h1Slow) ||
      !NovaCoreCopy(gNovaCoreH4Fast,3,h4Fast) || !NovaCoreCopy(gNovaCoreH4Slow,3,h4Slow) ||
      !NovaCoreCopy(gNovaCoreM15Fast,3,m15Fast) || !NovaCoreCopy(gNovaCoreM15Slow,3,m15Slow) ||
      !NovaCoreCopy(gNovaCoreM15Rsi,3,rsi) || !NovaCoreCopy(gNovaCoreM15Atr,64,atr) ||
      !NovaCoreCopy(gNovaCoreM15Atr50,3,atr50)) return;

   if(atr[1]<=0.0 || atr50[1]<=0.0) return;
   double volRatio=atr[1]/atr50[1];
   if(volRatio<0.55 || volRatio>1.80) return; // volatility-regime guard

   int stDir=NovaCoreSuperTrendDirection(rates,atr);
   bool h1Up=h1Fast[1]>h1Slow[1], h1Down=h1Fast[1]<h1Slow[1];
   bool h4Up=h4Fast[1]>h4Slow[1], h4Down=h4Fast[1]<h4Slow[1];
   bool m15Up=m15Fast[1]>m15Slow[1], m15Down=m15Fast[1]<m15Slow[1];

   NovaCoreDetectBos(rates,atr[1]);
   if(gNovaCoreSetupDir==0 || gNovaCoreSetupTime<=0) return;
   int age=(int)((rates[1].time-gNovaCoreSetupTime)/PeriodSeconds(NOVA_CORE_TF));
   if(age<0 || age>NOVA_CORE_SETUP_MAX_BARS) { gNovaCoreSetupDir=0; return; }

   int dir=gNovaCoreSetupDir;
   bool aligned=(dir>0?(h1Up && h4Up && m15Up && stDir>0 && rsi[1]>=45.0 && rsi[1]<=68.0):
                         (h1Down && h4Down && m15Down && stDir<0 && rsi[1]>=32.0 && rsi[1]<=55.0));
   if(!aligned) return;

   double entry=rates[1].close;
   double low=rates[1].low, high=rates[1].high;
   bool obTouch=(gNovaCoreObHigh>gNovaCoreObLow && low<=gNovaCoreObHigh && high>=gNovaCoreObLow);
   bool fvgTouch=(gNovaCoreFvgHigh>gNovaCoreFvgLow && low<=gNovaCoreFvgHigh && high>=gNovaCoreFvgLow);
   bool eqRetrace=(dir>0?(low<=gNovaCoreEq+0.15*atr[1] && entry>=gNovaCoreEq):
                           (high>=gNovaCoreEq-0.15*atr[1] && entry<=gNovaCoreEq));
   bool locationOK=(obTouch || fvgTouch || eqRetrace);
   bool rejection=(dir>0?NovaCoreBullWick(rates[1],atr[1]):NovaCoreBearWick(rates[1],atr[1]));
   if(!locationOK || !rejection || gNovaCoreLastSignal==rates[1].time) return;

   double sl=(dir>0?MathMin(low,gNovaCoreSwingExtreme)-0.20*atr[1]:
                    MathMax(high,gNovaCoreSwingExtreme)+0.20*atr[1]);
   double risk=MathAbs(entry-sl);
   if(risk<=0.0 || risk>3.0*atr[1]) return;
   double tp=entry+dir*NOVA_CORE_RR*risk;
   gNovaCoreLastSignal=rates[1].time;
   Print("NOVA CORE CANDIDATE ",(dir>0?"BUY":"SELL"),
         " | closed M15 bar=",TimeToString(rates[1].time,TIME_DATE|TIME_MINUTES),
         " | entryRef=",DoubleToString(entry,_Digits),
         " | SLref=",DoubleToString(sl,_Digits),
         " | TPref=",DoubleToString(tp,_Digits),
         " | RR=1:",DoubleToString(NOVA_CORE_RR,1),
         " | mode=READ-ONLY / NO ORDER");
}

void NovaCoreOnTick()
{
   // Signal evaluation only. This module contains no broker execution path.
   NovaCoreEvaluate();
}

#endif // NOVA_CORE_STRATEGY_V182_MQH
