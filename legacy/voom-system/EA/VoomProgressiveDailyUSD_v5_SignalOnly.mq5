//+------------------------------------------------------------------+
//| VoomProgressiveDailyUSD_v5_SignalOnly.mq5                        |
//| Research/signal-only adaptation of user-supplied VOOM v5.0       |
//| IMPORTANT: no trading functions and no order execution.           |
//+------------------------------------------------------------------+
#property copyright "voom_system"
#property version   "5.01"
#property description "VOOM Progressive Daily USD v5.0 - SIGNAL ONLY / RESEARCH"

enum ENUM_ACCOUNT_TYPE
  {
   ACCOUNT_STANDARD = 0,
   ACCOUNT_CENT     = 1
  };

input group "=== 1. Reference Settings (not used for execution) ==="
input ENUM_ACCOUNT_TYPE InpAccountType        = ACCOUNT_CENT;
input double            InpBaseDailyTargetUSD = 1.20;
input double            InpMaxDailyLossUSD    = 5.00;
input ulong             InpMagicNumber        = 5198950;

input group "=== 2. Signal Risk Reference (no orders sent) ==="
input double            InpFixedLot           = 0.01;
input int               InpStopLossPips        = 150;
input int               InpTakeProfitPips      = 300;
input ulong             InpSlippage             = 30;

input group "=== 3. Five-Core Signal Settings ==="
input ENUM_TIMEFRAMES   InpHTF                = PERIOD_H1;
input int               InpHTFMAPeriod        = 200;
input int               InpSweepLookback      = 20;
input double            InpMinFVGGapPoints    = 50.0;
input int               InpVelocityTimeMs     = 1000;
input int               InpMinTickCount       = 12;

int      g_htf_ma_handle = INVALID_HANDLE;
uint     g_tick_timestamps[];
datetime g_last_signal_bar = 0;
datetime g_last_logged_signal_bar = 0;
int      g_last_logged_signal = 0;
double   g_account_scale = 1.0;

//+------------------------------------------------------------------+
int OnInit()
  {
   if(InpAccountType == ACCOUNT_CENT)
      g_account_scale = 100.0;
   else
      g_account_scale = 1.0;

   if(InpHTFMAPeriod < 2 || InpSweepLookback < 2 ||
      InpVelocityTimeMs < 1 || InpMinTickCount < 1 ||
      InpMinFVGGapPoints < 0)
     {
      Print("[VOOM SIGNAL ONLY] Invalid input parameters.");
      return INIT_PARAMETERS_INCORRECT;
     }

   g_htf_ma_handle = iMA(_Symbol, InpHTF, InpHTFMAPeriod, 0, MODE_EMA, PRICE_CLOSE);
   if(g_htf_ma_handle == INVALID_HANDLE)
     {
      PrintFormat("[VOOM SIGNAL ONLY] Failed to create HTF EMA handle. Error=%d", GetLastError());
      return INIT_FAILED;
     }

   ArrayResize(g_tick_timestamps, 0);
   PrintFormat("[VOOM SIGNAL ONLY] Initialized. Symbol=%s TF=%s. Trading disabled by design. Account scale is informational only: %.1f",
               _Symbol, EnumToString(_Period), g_account_scale);
   Print("[VOOM SIGNAL ONLY] This EA has no CTrade object, Buy/Sell calls, or order execution.");
   return INIT_SUCCEEDED;
  }

//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   if(g_htf_ma_handle != INVALID_HANDLE)
      IndicatorRelease(g_htf_ma_handle);
   Comment("");
   PrintFormat("[VOOM SIGNAL ONLY] Deinitialized. Reason=%d", reason);
  }

//+------------------------------------------------------------------+
void OnTick()
  {
   UpdateTickVelocity();
   int signal = Evaluate5CoreSignal();
   datetime bar_time = iTime(_Symbol, _Period, 1);
   if(signal == 0 || bar_time <= 0)
      return;

   // Log at most once for each completed signal bar and direction.
   if(bar_time == g_last_logged_signal_bar && signal == g_last_logged_signal)
      return;

   g_last_logged_signal_bar = bar_time;
   g_last_logged_signal = signal;

   string direction = (signal > 0 ? "BUY" : "SELL");
   double reference_price = iClose(_Symbol, _Period, 1);
   PrintFormat("[VOOM SIGNAL ONLY] %s | Symbol=%s | TF=%s | ClosedBar=%s | Close=%s | No order sent",
               direction, _Symbol, EnumToString(_Period),
               TimeToString(bar_time, TIME_DATE|TIME_MINUTES), DoubleToString(reference_price, _Digits));
   Comment("VOOM v5.0 SIGNAL ONLY\n",
           "Signal: ", direction, "\n",
           "Symbol: ", _Symbol, " / ", EnumToString(_Period), "\n",
           "Completed bar: ", TimeToString(bar_time, TIME_DATE|TIME_MINUTES), "\n",
           "Reference close: ", DoubleToString(reference_price, _Digits), "\n",
           "Execution: DISABLED (no orders sent)");
  }

//+------------------------------------------------------------------+
//| H1 EMA trend from the last completed HTF candle                  |
//+------------------------------------------------------------------+
int CheckMTFTrend()
  {
   double ma[];
   ArraySetAsSeries(ma, true);
   if(BarsCalculated(g_htf_ma_handle) < InpHTFMAPeriod + 2)
      return 0;
   if(CopyBuffer(g_htf_ma_handle, 0, 1, 1, ma) != 1)
      return 0;

   double closed_chart_close = iClose(_Symbol, _Period, 1);
   if(closed_chart_close <= 0)
      return 0;
   if(closed_chart_close > ma[0]) return 1;
   if(closed_chart_close < ma[0]) return -1;
   return 0;
  }

//+------------------------------------------------------------------+
bool DetectLiquiditySweep(const bool check_sell_side)
  {
   if(Bars(_Symbol, _Period) < InpSweepLookback + 5)
      return false;

   int low_index = iLowest(_Symbol, _Period, MODE_LOW, InpSweepLookback, 2);
   int high_index = iHighest(_Symbol, _Period, MODE_HIGH, InpSweepLookback, 2);
   if(low_index < 0 || high_index < 0)
      return false;

   double prior_low = iLow(_Symbol, _Period, low_index);
   double prior_high = iHigh(_Symbol, _Period, high_index);
   double closed_low = iLow(_Symbol, _Period, 1);
   double closed_high = iHigh(_Symbol, _Period, 1);
   double closed_close = iClose(_Symbol, _Period, 1);

   if(check_sell_side)
      return (closed_low < prior_low && closed_close > prior_low);
   return (closed_high > prior_high && closed_close < prior_high);
  }

//+------------------------------------------------------------------+
//| Three-candle FVG check. Order Block is NOT separately detected.  |
//+------------------------------------------------------------------+
bool CheckFVG(const bool bullish)
  {
   double high3 = iHigh(_Symbol, _Period, 3);
   double low3  = iLow(_Symbol, _Period, 3);
   double high1 = iHigh(_Symbol, _Period, 1);
   double low1  = iLow(_Symbol, _Period, 1);
   if(high3 <= 0 || low3 <= 0 || high1 <= 0 || low1 <= 0)
      return false;

   if(bullish)
      return ((low1 - high3) / _Point >= InpMinFVGGapPoints);
   return ((low3 - high1) / _Point >= InpMinFVGGapPoints);
  }

//+------------------------------------------------------------------+
void UpdateTickVelocity()
  {
   uint now_ms = GetTickCount();
   int n = ArraySize(g_tick_timestamps);
   if(ArrayResize(g_tick_timestamps, n + 1) == n + 1)
      g_tick_timestamps[n] = now_ms;

   // Keep a bounded rolling event buffer.
   n = ArraySize(g_tick_timestamps);
   if(n > 500)
      ArrayRemove(g_tick_timestamps, 0, n - 400);
  }

//+------------------------------------------------------------------+
bool ValidateTickVelocity()
  {
   uint now_ms = GetTickCount();
   int n = ArraySize(g_tick_timestamps);
   int count = 0;
   for(int i = n - 1; i >= 0; --i)
     {
      uint age = now_ms - g_tick_timestamps[i]; // uint wrap-safe for short intervals
      if(age <= (uint)InpVelocityTimeMs)
         count++;
      else
         break;
     }
   return (count >= InpMinTickCount);
  }

//+------------------------------------------------------------------+
int Evaluate5CoreSignal()
  {
   // Only completed candles are used for trend/sweep/FVG decisions.
   int trend = CheckMTFTrend();
   if(trend == 0)
      return 0;

   bool sweep_low = DetectLiquiditySweep(true);
   bool sweep_high = DetectLiquiditySweep(false);
   bool bullish_fvg = CheckFVG(true);
   bool bearish_fvg = CheckFVG(false);
   bool velocity = ValidateTickVelocity();

   if(!velocity)
      return 0;

   if(trend > 0 && sweep_low && bullish_fvg)
      return 1;
   if(trend < 0 && sweep_high && bearish_fvg)
      return -1;
   return 0;
  }
//+------------------------------------------------------------------+
