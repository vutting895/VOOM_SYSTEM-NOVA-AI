//+------------------------------------------------------------------+
//| NOVA_MT5_AI_EA                                                    |
//| Version 2.001 - Demo-only read-only market observer               |
//| No network calls, model inference, risk approval, or order logic.  |
//+------------------------------------------------------------------+
#property strict
#property version   "2.001"
#property description "NOVA Demo-only MT5 market observer; no trading or network access"

input group "=== HARD SAFETY ==="
input bool InpDemoOnly = true;

input group "=== MARKET OBSERVATION ==="
input ENUM_TIMEFRAMES InpSignalTimeframe = PERIOD_M15;
input int InpBarsToLoad = 300;
input bool InpLogMarketEvents = true;

datetime g_last_closed_bar = 0;
bool g_ready = false;

bool IsDemoAccount()
{
   ENUM_ACCOUNT_TRADE_MODE mode =
      (ENUM_ACCOUNT_TRADE_MODE)AccountInfoInteger(ACCOUNT_TRADE_MODE);
   return (mode == ACCOUNT_TRADE_MODE_DEMO);
}

bool SafetyPreflight()
{
   if(!InpDemoOnly)
   {
      Print("NOVA_EA BLOCKED: Demo-only mode is mandatory.");
      return false;
   }
   if(!IsDemoAccount())
   {
      Print("NOVA_EA BLOCKED: account is not DEMO.");
      return false;
   }
   if(InpBarsToLoad < 60 || InpBarsToLoad > 5000)
   {
      Print("NOVA_EA BLOCKED: InpBarsToLoad outside safe bounds.");
      return false;
   }
   return true;
}

string TfLabel()
{
   string value = EnumToString(InpSignalTimeframe);
   StringReplace(value, "PERIOD_", "");
   return value;
}

string UtcTimestamp(datetime server_time)
{
   int offset_seconds = (int)(TimeTradeServer() - TimeGMT());
   datetime utc_time = server_time - offset_seconds;
   string value = TimeToString(utc_time, TIME_DATE | TIME_SECONDS);
   StringReplace(value, ".", "-");
   StringReplace(value, " ", "T");
   return value + "Z";
}

int OnInit()
{
   g_ready = SafetyPreflight();
   if(!g_ready)
      return INIT_FAILED;

   Print("NOVA_MT5_AI_EA v2.001 initialized: DEMO ONLY; READ-ONLY; NO NETWORK; NO ORDERS.");
   Print("NOVA_EA role: closed-bar market observation for diagnostics only.");
   Print("NOVA_EA model inference, Quant Decision API, and Server Risk Gate are NOT connected.");
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   Print("NOVA_MT5_AI_EA stopped. reason=", reason);
}

void OnTick()
{
   if(!g_ready)
      return;

   datetime closed_bar_time = iTime(_Symbol, InpSignalTimeframe, 1);
   if(closed_bar_time <= 0 || closed_bar_time == g_last_closed_bar)
      return;

   MqlRates bars[];
   ArraySetAsSeries(bars, true);
   int copied = CopyRates(_Symbol, InpSignalTimeframe, 0, InpBarsToLoad, bars);
   if(copied < 60)
   {
      Print("NOVA_EA WAIT: insufficient market history; copied=", copied);
      return;
   }

   MqlTick tick;
   if(!SymbolInfoTick(_Symbol, tick) || tick.bid <= 0 || tick.ask < tick.bid)
   {
      Print("NOVA_EA WAIT: invalid market tick.");
      return;
   }

   g_last_closed_bar = closed_bar_time;
   MqlRates bar = bars[1];
   double spread_points = (tick.ask - tick.bid) / _Point;

   if(InpLogMarketEvents)
   {
      Print("NOVA_MARKET_EVENT",
            " symbol=", _Symbol,
            " timeframe=", TfLabel(),
            " bar_time_utc=", UtcTimestamp(bar.time),
            " open=", DoubleToString(bar.open, _Digits),
            " high=", DoubleToString(bar.high, _Digits),
            " low=", DoubleToString(bar.low, _Digits),
            " close=", DoubleToString(bar.close, _Digits),
            " tick_volume=", bar.tick_volume,
            " bid=", DoubleToString(tick.bid, _Digits),
            " ask=", DoubleToString(tick.ask, _Digits),
            " spread_points=", DoubleToString(spread_points, 2),
            " mode=DEMO_READ_ONLY");
   }
}

// Intentionally absent:
// OrderSend, CTrade, Buy, Sell, PositionOpen, pending orders,
// WebRequest, local ONNX inference, and local risk-approval bypass.
