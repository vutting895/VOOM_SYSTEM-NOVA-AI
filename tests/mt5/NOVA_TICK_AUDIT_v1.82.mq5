#property strict
#define AUDIT_HOLDING_M15_BARS 96
int OnInit(){return INIT_SUCCEEDED;}
void OnTick(){}
double OnTester()
{
   int f=FileOpen("NOVA_CORE_CANDIDATES.csv",FILE_READ|FILE_CSV|FILE_ANSI|FILE_COMMON,',');
   if(f==INVALID_HANDLE){Print("TICK_AUDIT_FAIL candidate file err=",GetLastError());return 0.0;}
   for(int h=0;h<5;h++) FileReadString(f);
   MqlRates bars[];
   int barCount=CopyRates(_Symbol,PERIOD_M15,0,12000,bars);
   if(barCount<=0){Print("TICK_AUDIT_FAIL M15 rates=",barCount," err=",GetLastError());FileClose(f);return 0.0;}
   ArraySetAsSeries(bars,false);
   int out=FileOpen("NOVA_CORE_TICK_AUDIT.csv",FILE_WRITE|FILE_CSV|FILE_ANSI|FILE_COMMON,',');
   if(out==INVALID_HANDLE){Print("TICK_AUDIT_FAIL output file err=",GetLastError());FileClose(f);return 0.0;}
   FileWrite(out,"time","dir","entryRef","slRef","tpRef","outcome","realizedR","ticksScanned","minutesToExit","entrySpread","holdingBars","barsAvailable","windowEnd","firstTick","lastTick");
   int total=0,tpCount=0,slCount=0,timeoutCount=0,gapCount=0,noTicks=0,invalid=0,truncatedCount=0;
   double grossWin=0.0,grossLoss=0.0,totalR=0.0;
   while(!FileIsEnding(f))
   {
      string timeText=FileReadString(f);
      if(FileIsEnding(f) && StringLen(timeText)==0) break;
      string dir=FileReadString(f);
      string entryText=FileReadString(f);
      string slText=FileReadString(f);
      string tpText=FileReadString(f);
      StringReplace(timeText,CharToString(34),"");
      StringReplace(dir,CharToString(34),"");
      StringReplace(entryText,CharToString(34),"");
      StringReplace(slText,CharToString(34),"");
      StringReplace(tpText,CharToString(34),"");
      if(StringLen(timeText)<10 || StringLen(dir)<3) continue;
      datetime signal=StringToTime(timeText);
      double entryRef=StringToDouble(entryText), sl=StringToDouble(slText), tp=StringToDouble(tpText);
      int signalIndex=-1;
      for(int b=0;b<barCount;b++){if(bars[b].time==signal){signalIndex=b;break;}}
      total++;
      if(signalIndex<0){invalid++;FileWrite(out,timeText,dir,entryRef,sl,tp,"NO_SIGNAL_BAR",0,0,0,0,AUDIT_HOLDING_M15_BARS,0,"","","");continue;}
      int requestedEnd=signalIndex+AUDIT_HOLDING_M15_BARS;
      bool truncated=(requestedEnd>=barCount);
      int endIndex=(truncated?barCount-1:requestedEnd);
      int barsAvailable=endIndex-signalIndex;
      datetime windowEnd=bars[endIndex].time+PeriodSeconds(PERIOD_M15)-1;
      long fromMsc=((long)(signal+PeriodSeconds(PERIOD_M15)))*1000;
      long toMsc=((long)windowEnd)*1000+999;
      MqlTick ticks[];
      int n=CopyTicksRange(_Symbol,ticks,COPY_TICKS_ALL,fromMsc,toMsc);
      string outcome="NO_TICKS";
      double realizedR=0.0,entry=0.0,risk=0.0,entrySpread=0.0;
      int exitIndex=-1;
      string firstText="",lastText="";
      if(n>0)
      {
         firstText=TimeToString((datetime)(ticks[0].time_msc/1000),TIME_DATE|TIME_SECONDS);
         lastText=TimeToString((datetime)(ticks[n-1].time_msc/1000),TIME_DATE|TIME_SECONDS);
      }
      if(n<=0)
      {
         noTicks++;
         FileWrite(out,timeText,dir,entryRef,sl,tp,outcome,0,n,0,0,AUDIT_HOLDING_M15_BARS,barsAvailable,TimeToString(windowEnd,TIME_DATE|TIME_MINUTES),firstText,lastText);
         continue;
      }
      double bid0=ticks[0].bid,ask0=ticks[0].ask;
      if(bid0<=0.0 || ask0<=0.0)
      {
         invalid++;
         FileWrite(out,timeText,dir,entryRef,sl,tp,"INVALID_TICK",0,n,0,0,AUDIT_HOLDING_M15_BARS,barsAvailable,TimeToString(windowEnd,TIME_DATE|TIME_MINUTES),firstText,lastText);
         continue;
      }
      entrySpread=ask0-bid0;
      bool buy=(dir=="BUY");
      if(buy)
      {
         if(bid0<=sl || bid0>=tp){gapCount++;outcome="GAP_BEFORE_ENTRY";FileWrite(out,timeText,dir,entryRef,sl,tp,outcome,0,n,0,entrySpread,AUDIT_HOLDING_M15_BARS,barsAvailable,TimeToString(windowEnd,TIME_DATE|TIME_MINUTES),firstText,lastText);continue;}
         entry=ask0; risk=entry-sl;
      }
      else
      {
         if(ask0>=sl || ask0<=tp){gapCount++;outcome="GAP_BEFORE_ENTRY";FileWrite(out,timeText,dir,entryRef,sl,tp,outcome,0,n,0,entrySpread,AUDIT_HOLDING_M15_BARS,barsAvailable,TimeToString(windowEnd,TIME_DATE|TIME_MINUTES),firstText,lastText);continue;}
         entry=bid0; risk=sl-entry;
      }
      if(risk<=0.0){invalid++;FileWrite(out,timeText,dir,entryRef,sl,tp,"INVALID_RISK",0,n,0,entrySpread,AUDIT_HOLDING_M15_BARS,barsAvailable,TimeToString(windowEnd,TIME_DATE|TIME_MINUTES),firstText,lastText);continue;}
      outcome="TIMEOUT";
      for(int i=1;i<n;i++)
      {
         if(buy)
         {
            if(ticks[i].bid<=sl){outcome="SL";realizedR=-1.0;exitIndex=i;break;}
            if(ticks[i].bid>=tp){outcome="TP";realizedR=(tp-entry)/risk;exitIndex=i;break;}
         }
         else
         {
            if(ticks[i].ask>=sl){outcome="SL";realizedR=-1.0;exitIndex=i;break;}
            if(ticks[i].ask<=tp){outcome="TP";realizedR=(entry-tp)/risk;exitIndex=i;break;}
         }
      }
      if(outcome=="TIMEOUT")
      {
         if(truncated)
         {
            outcome="TRUNCATED";
            truncatedCount++;
            FileWrite(out,timeText,dir,DoubleToString(entryRef,_Digits),DoubleToString(sl,_Digits),DoubleToString(tp,_Digits),outcome,0,n,0,DoubleToString(entrySpread,_Digits),AUDIT_HOLDING_M15_BARS,barsAvailable,TimeToString(windowEnd,TIME_DATE|TIME_MINUTES),firstText,lastText);
            continue;
         }
         int last=n-1;
         if(buy) realizedR=(ticks[last].bid-entry)/risk;
         else realizedR=(entry-ticks[last].ask)/risk;
         exitIndex=last;
         timeoutCount++;
      }
      else if(outcome=="TP"){tpCount++;grossWin+=realizedR;}
      else if(outcome=="SL"){slCount++;grossLoss+=realizedR;}
      totalR+=realizedR;
      double minutes=(double)(ticks[exitIndex].time_msc-ticks[0].time_msc)/60000.0;
      FileWrite(out,timeText,dir,DoubleToString(entryRef,_Digits),DoubleToString(sl,_Digits),DoubleToString(tp,_Digits),outcome,
         DoubleToString(realizedR,5),n,DoubleToString(minutes,2),DoubleToString(entrySpread,_Digits),
         AUDIT_HOLDING_M15_BARS,barsAvailable,TimeToString(windowEnd,TIME_DATE|TIME_MINUTES),firstText,lastText);
   }
   FileClose(f);FileClose(out);
   double pf=(MathAbs(grossLoss)>0.0?grossWin/MathAbs(grossLoss):0.0);
   Print("TICK_AUDIT_96BAR_SUMMARY | total=",total," | TP=",tpCount," | SL=",slCount,
      " | timeout=",timeoutCount," | gapBeforeEntry=",gapCount," | noTicks=",noTicks,
      " | truncated=",truncatedCount," | invalid=",invalid," | grossWinR=",DoubleToString(grossWin,3),
      " | grossLossR=",DoubleToString(grossLoss,3)," | grossPF_exTimeout=",DoubleToString(pf,3),
      " | netR=",DoubleToString(totalR,3)," | meanR=",DoubleToString(totalR/MathMax(total,1),3));
   return totalR;
}
