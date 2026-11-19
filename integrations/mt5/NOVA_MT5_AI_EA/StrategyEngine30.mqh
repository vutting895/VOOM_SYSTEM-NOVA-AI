//+------------------------------------------------------------------+
//| StrategyEngine30.mqh - deterministic indicator/price heuristics  |
//| Signals are research votes, NOT validated profitable strategies. |
//+------------------------------------------------------------------+
#ifndef NOVA_MT5_STRATEGY_ENGINE30_MQH
#define NOVA_MT5_STRATEGY_ENGINE30_MQH

int Buf(int handle,int buffer,int shift,double &v)
{
   if(handle==INVALID_HANDLE) return 0;
   double a[];
   ArraySetAsSeries(a,true);
   int n=CopyBuffer(handle,buffer,shift,1,a);
   IndicatorRelease(handle);
   if(n!=1) return 0;
   v=a[0];
   return 1;
}
int MA(string s,ENUM_TIMEFRAMES tf,int p,ENUM_MA_METHOD m,int shift,double &v)
{ return Buf(iMA(s,tf,p,0,m,PRICE_CLOSE),0,shift,v); }
int ATR(string s,ENUM_TIMEFRAMES tf,int p,int shift,double &v)
{ return Buf(iATR(s,tf,p),0,shift,v); }
int RSI(string s,ENUM_TIMEFRAMES tf,int p,int shift,double &v)
{ return Buf(iRSI(s,tf,p,PRICE_CLOSE),0,shift,v); }
int ADX(string s,ENUM_TIMEFRAMES tf,int p,int b,int shift,double &v)
{ return Buf(iADX(s,tf,p),b,shift,v); }
int Bands(string s,ENUM_TIMEFRAMES tf,int p,double dev,int b,int shift,double &v)
{ return Buf(iBands(s,tf,p,0,dev,PRICE_CLOSE),b,shift,v); }
int MACD(string s,ENUM_TIMEFRAMES tf,int f,int sl,int sig,int b,int shift,double &v)
{ return Buf(iMACD(s,tf,f,sl,sig,PRICE_CLOSE),b,shift,v); }

int Vote(int x) { if(x>0) return 1; if(x<0) return -1; return 0; }

int EvalStrategy30(const int id,const string s,const ENUM_TIMEFRAMES tf,
                   MqlRates &r[],const int n)
{
   if(n<60) return 0;
   double a=0,b=0,c=0,d=0;
   double close1=r[1].close, close2=r[2].close;
   double range=MathMax(r[1].high-r[1].low,_Point);
   double body=close1-r[1].open;
   double vol1=(double)r[1].tick_volume;
   double vol2=(double)r[2].tick_volume;
   switch(id)
   {
      case 0:
         if(!ATR(s,tf,10,1,a)) return 0;
         return Vote(close1-(r[1].high+r[1].low)/2.0 > 0 ? (close1>(r[1].high+r[1].low)/2.0+a*0.15?1:0) : (close1<(r[1].high+r[1].low)/2.0-a*0.15?-1:0));
      case 1:
         if(!MA(s,tf,20,MODE_EMA,1,a)||!ATR(s,tf,20,1,b)) return 0;
         return Vote(close1>a+1.5*b?1:(close1<a-1.5*b?-1:0));
      case 2:
         if(!MA(s,tf,20,MODE_EMA,1,a)||!MA(s,tf,50,MODE_EMA,1,b)||!MA(s,tf,20,MODE_EMA,2,c)||!MA(s,tf,50,MODE_EMA,2,d)) return 0;
         return Vote(a>b&&c<=d?1:(a<b&&c>=d?-1:0));
      case 3:
         return Vote((close1-r[11].close)/MathMax(r[11].close,_Point)>0.003?1:((close1-r[11].close)/MathMax(r[11].close,_Point)<-0.003?-1:0));
      case 4:
         if(!MA(s,tf,5,MODE_SMMA,1,a)||!MA(s,tf,8,MODE_SMMA,1,b)||!MA(s,tf,13,MODE_SMMA,1,c)) return 0;
         return Vote(a>b&&b>c?1:(a<b&&b<c?-1:0));
      case 5:
         if(!MA(s,tf,9,MODE_SMA,1,a)||!MA(s,tf,26,MODE_SMA,1,b)) return 0;
         return Vote(close1>a&&a>b?1:(close1<a&&a<b?-1:0));
      case 6:
         if(!MA(s,tf,5,MODE_SMA,1,a)||!MA(s,tf,34,MODE_SMA,1,b)) return 0;
         return Vote(a>b?1:(a<b?-1:0));
      case 7:
         return Vote(body/range>0.55?1:(body/range< -0.55?-1:0));
      case 8:
         if(!Buf(iSAR(s,tf,0.02,0.2),0,1,a)) return 0;
         return Vote(close1>a?1:(close1<a?-1:0));
      case 9:
      {
         MqlDateTime dt; TimeToStruct(r[1].time,dt);
         double pv=0,vv=0;
         for(int k=1;k<n && k<100;k++)
         {
            MqlDateTime kd; TimeToStruct(r[k].time,kd);
            if(kd.day!=dt.day||kd.mon!=dt.mon||kd.year!=dt.year) break;
            double v=(double)MathMax(r[k].tick_volume,1);
            pv+=((r[k].high+r[k].low+r[k].close)/3.0)*v; vv+=v;
         }
         if(vv<=0) return 0;
         double vw=pv/vv;
         return Vote(close1>vw+range*0.1?1:(close1<vw-range*0.1?-1:0));
      }
      case 10:
         if(!MA(s,tf,20,MODE_EMA,1,a)) return 0;
         return Vote(vol1>vol2*1.2&&close1>a&&body>0?1:(vol1>vol2*1.2&&close1<a&&body<0?-1:0));
      case 11:
      {
         MqlDateTime t; TimeToStruct(r[1].time,t);
         if(t.hour<6||t.hour>20) return 0;
         return Vote(body>range*0.35?1:(body< -range*0.35?-1:0));
      }
      case 12:
         a=(r[2].high+r[2].low+r[2].close)/3.0;
         return Vote(close2<=a&&close1>a?1:(close2>=a&&close1<a?-1:0));
      case 13:
         a=r[1].high-r[1].low; b=0;
         for(int k=2;k<14;k++) b+=r[k].high-r[k].low;
         b/=12.0;
         return Vote(a>b*1.5&&close1>r[2].high?1:(a>b*1.5&&close1<r[2].low?-1:0));
      case 14:
         a=-DBL_MAX; b=DBL_MAX;
         for(int k=2;k<12;k++){a=MathMax(a,r[k].high);b=MathMin(b,r[k].low);}
         return Vote(close1>a?1:(close1<b?-1:0));
      case 15:
         if(!ADX(s,tf,14,0,1,a)||!MA(s,tf,20,MODE_EMA,1,b)) return 0;
         return Vote(a>20&&close1>b&&close1>close2?1:(a>20&&close1<b&&close1<close2?-1:0));
      case 16:
         if(!ATR(s,tf,14,1,a)||!ATR(s,tf,14,10,b)) return 0;
         return Vote(a>b*1.2&&close1>r[2].high?1:(a>b*1.2&&close1<r[2].low?-1:0));
      case 17:
         a=0; for(int k=2;k<22;k++) a+=(double)r[k].tick_volume; a/=20.0;
         return Vote(vol1>a*1.5&&MathAbs(body)/range>0.65?(body>0?1:-1):0);
      case 18:
         a=-DBL_MAX; b=DBL_MAX;
         for(int k=2;k<12;k++){a=MathMax(a,r[k].high);b=MathMin(b,r[k].low);}
         return Vote(r[1].low<b&&close1>b?1:(r[1].high>a&&close1<a?-1:0));
      case 19:
         return Vote(vol1>vol2*1.3&&(MathMin(r[1].open,r[1].close)-r[1].low)>range*0.45?1:(vol1>vol2*1.3&&(r[1].high-MathMax(r[1].open,r[1].close))>range*0.45?-1:0));
      case 20:
         a=-DBL_MAX; b=DBL_MAX;
         for(int k=3;k<23;k++){a=MathMax(a,r[k].high);b=MathMin(b,r[k].low);}
         return Vote(r[1].low<b+range*0.08&&close1>b?1:(r[1].high>a-range*0.08&&close1<a?-1:0));
      case 21:
         if(!MA(s,tf,8,MODE_EMA,1,a)||!MA(s,tf,21,MODE_EMA,1,b)||!RSI(s,tf,14,1,c)) return 0;
         return Vote(a>b&&c>52?1:(a<b&&c<48?-1:0));
      case 22:
      {
         MqlDateTime t; TimeToStruct(r[1].time,t);
         if(!((t.hour>=7&&t.hour<=10)||(t.hour>=13&&t.hour<=16))) return 0;
         a=-DBL_MAX; b=DBL_MAX;
         for(int k=2;k<18;k++){a=MathMax(a,r[k].high);b=MathMin(b,r[k].low);}
         return Vote(close1>a?1:(close1<b?-1:0));
      }
      case 23:
         a=-DBL_MAX; b=DBL_MAX;
         for(int k=2;k<16;k++){a=MathMax(a,r[k].high);b=MathMin(b,r[k].low);}
         return Vote(vol1>vol2&&r[1].low<b&&close1>b?1:(vol1>vol2&&r[1].high>a&&close1<a?-1:0));
      case 24:
         if(!ATR(s,tf,10,1,a)||!MA(s,tf,10,MODE_EMA,1,b)) return 0;
         return Vote(close1>b+a*0.25?1:(close1<b-a*0.25?-1:0));
      case 25:
         if(!Bands(s,tf,20,2.0,2,1,a)||!Bands(s,tf,20,2.0,1,1,b)||!RSI(s,tf,14,1,c)) return 0;
         return Vote(close1<a&&c<30?1:(close1>b&&c>70?-1:0));
      case 26:
      {
         MqlDateTime t; TimeToStruct(r[1].time,t);
         if(t.hour<8||t.hour>18) return 0;
         a=-DBL_MAX; b=DBL_MAX;
         for(int k=2;k<34;k++){a=MathMax(a,r[k].high);b=MathMin(b,r[k].low);}
         return Vote(close1>a?1:(close1<b?-1:0));
      }
      case 27:
         if(!MA(s,tf,34,MODE_EMA,1,a)||!MA(s,tf,34,MODE_EMA,5,b)||!MACD(s,tf,12,26,9,0,1,c)||!MACD(s,tf,12,26,9,1,1,d)) return 0;
         return Vote(a>b&&c>d?1:(a<b&&c<d?-1:0));
      case 28:
         if(!ATR(s,tf,14,1,a)||!ATR(s,tf,14,30,b)||!MA(s,tf,20,MODE_EMA,1,c)) return 0;
         return Vote(a>b*1.25&&close1>c?1:(a>b*1.25&&close1<c?-1:0));
      case 29:
         a=-DBL_MAX; b=DBL_MAX;
         for(int k=2;k<22;k++){a=MathMax(a,r[k].high);b=MathMin(b,r[k].low);}
         return Vote(vol1>vol2*1.2&&r[1].low<b&&close1>b?1:(vol1>vol2*1.2&&r[1].high>a&&close1<a?-1:0));
   }
   return 0;
}
#endif
