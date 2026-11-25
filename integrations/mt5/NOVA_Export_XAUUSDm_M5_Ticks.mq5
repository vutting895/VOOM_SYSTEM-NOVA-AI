//+------------------------------------------------------------------+
//| NOVA_Export_XAUUSDm_M5_Ticks.mq5                                  |
//| Read-only historical data exporter. No trade/order functions.    |
//+------------------------------------------------------------------+
#property strict
#property script_show_inputs
#property version   "1.00"
#property description "Exports broker-provided XAUUSDm M5 bars and Bid/Ask ticks to CSV."

input string InpRequiredSymbol = "XAUUSDm";
input datetime InpFrom = D'2022.07.21 00:00';
input datetime InpToExclusive = D'2026.10.30 00:00';
input bool InpExportM5Bars = true;
input bool InpExportTicks = true;
input bool InpUseCommonFiles = true;
input int InpMaxDaysPerRun = 0; // 0 = all days; use a smaller value for staged runs

bool OpenCsv(const string filename, int &handle)
{
   int flags = FILE_WRITE | FILE_CSV | FILE_ANSI;
   if(InpUseCommonFiles)
      flags |= FILE_COMMON;
   handle = FileOpen(filename, flags, ',');
   if(handle == INVALID_HANDLE)
   {
      PrintFormat("EXPORT_ERROR file=%s error=%d", filename, GetLastError());
      return false;
   }
   return true;
}

string DateTag(const datetime value)
{
   MqlDateTime parts;
   TimeToStruct(value, parts);
   return StringFormat("%04d%02d%02d", parts.year, parts.mon, parts.day);
}

string MonthTag(const datetime value)
{
   MqlDateTime parts;
   TimeToStruct(value, parts);
   return StringFormat("%04d%02d", parts.year, parts.mon);
}

bool ExportBars()
{
   MqlRates rates[];
   ArraySetAsSeries(rates, false);
   ResetLastError();
   int copied = CopyRates(InpRequiredSymbol, PERIOD_M5, InpFrom, InpToExclusive - 1, rates);
   if(copied < 0)
   {
      PrintFormat("M5_COPY_FAILED error=%d", GetLastError());
      return false;
   }

   string filename = "NOVA_" + InpRequiredSymbol + "_M5_" +
                     DateTag(InpFrom) + "_" + DateTag(InpToExclusive) + ".csv";
   int file;
   if(!OpenCsv(filename, file))
      return false;

   FileWrite(file, "symbol", "timeframe", "time_server", "time_epoch",
             "open", "high", "low", "close", "tick_volume", "spread_points", "real_volume");
   for(int i = 0; i < copied; i++)
   {
      FileWrite(file, InpRequiredSymbol, "M5",
                TimeToString(rates[i].time, TIME_DATE | TIME_MINUTES | TIME_SECONDS),
                (long)rates[i].time,
                DoubleToString(rates[i].open, _Digits),
                DoubleToString(rates[i].high, _Digits),
                DoubleToString(rates[i].low, _Digits),
                DoubleToString(rates[i].close, _Digits),
                (long)rates[i].tick_volume,
                rates[i].spread,
                DoubleToString(rates[i].real_volume, 8));
   }
   FileFlush(file);
   FileClose(file);
   PrintFormat("M5_EXPORT_DONE file=%s rows=%d first=%s last=%s",
               filename, copied,
               copied > 0 ? TimeToString(rates[0].time, TIME_DATE | TIME_MINUTES) : "NONE",
               copied > 0 ? TimeToString(rates[copied-1].time, TIME_DATE | TIME_MINUTES) : "NONE");
   return true;
}

bool ExportOneTickDay(const datetime day_start)
{
   datetime day_end = day_start + 86400;
   if(day_end > InpToExclusive)
      day_end = InpToExclusive;

   ulong from_msc = (ulong)day_start * 1000;
   ulong to_msc = (ulong)day_end * 1000 - 1;
   MqlTick ticks[];
   ResetLastError();
   int copied = CopyTicksRange(InpRequiredSymbol, ticks, COPY_TICKS_ALL, from_msc, to_msc);
   if(copied < 0)
   {
      PrintFormat("TICK_COPY_FAILED day=%s error=%d",
                  TimeToString(day_start, TIME_DATE), GetLastError());
      return false;
   }

   string filename = "NOVA_" + InpRequiredSymbol + "_TICKS_" + DateTag(day_start) + ".csv";
   int file;
   if(!OpenCsv(filename, file))
      return false;

   FileWrite(file, "symbol", "time_server", "time_msc", "bid", "ask", "last",
             "volume", "volume_real", "flags");
   for(int i = 0; i < copied; i++)
   {
      FileWrite(file, InpRequiredSymbol,
                TimeToString(ticks[i].time, TIME_DATE | TIME_SECONDS),
                (long)ticks[i].time_msc,
                DoubleToString(ticks[i].bid, _Digits),
                DoubleToString(ticks[i].ask, _Digits),
                DoubleToString(ticks[i].last, _Digits),
                (long)ticks[i].volume,
                DoubleToString(ticks[i].volume_real, 8),
                (long)ticks[i].flags);
   }
   FileFlush(file);
   FileClose(file);
   PrintFormat("TICK_DAY_DONE day=%s rows=%d file=%s",
               TimeToString(day_start, TIME_DATE), copied, filename);
   return true;
}

bool ExportTicks()
{
   int days_done = 0;
   int failures = 0;
   datetime day = InpFrom - (InpFrom % 86400);
   while(day < InpToExclusive && !IsStopped())
   {
      if(InpMaxDaysPerRun > 0 && days_done >= InpMaxDaysPerRun)
         break;
      if(!ExportOneTickDay(day))
         failures++;
      days_done++;
      day += 86400;
   }
   PrintFormat("TICK_EXPORT_SUMMARY days=%d failures=%d", days_done, failures);
   return failures == 0;
}

void OnStart()
{
   if(_Symbol != InpRequiredSymbol)
   {
      PrintFormat("EXPORT_ABORT chart_symbol=%s required_symbol=%s",
                  _Symbol, InpRequiredSymbol);
      return;
   }
   if(!SymbolSelect(InpRequiredSymbol, true))
   {
      PrintFormat("EXPORT_ABORT symbol_not_available=%s error=%d",
                  InpRequiredSymbol, GetLastError());
      return;
   }
   if(InpFrom >= InpToExclusive)
   {
      Print("EXPORT_ABORT invalid_date_range");
      return;
   }

   long digits = 0;
   SymbolInfoInteger(InpRequiredSymbol, SYMBOL_DIGITS, digits);
   PrintFormat("NOVA_EXPORT_START symbol=%s digits=%d from=%s to_exclusive=%s server=%s",
               InpRequiredSymbol, (int)digits,
               TimeToString(InpFrom, TIME_DATE | TIME_MINUTES),
               TimeToString(InpToExclusive, TIME_DATE | TIME_MINUTES),
               AccountInfoString(ACCOUNT_SERVER));

   bool bars_ok = true;
   bool ticks_ok = true;
   if(InpExportM5Bars)
      bars_ok = ExportBars();
   if(InpExportTicks)
      ticks_ok = ExportTicks();

   PrintFormat("NOVA_EXPORT_FINISHED bars=%s ticks=%s common_files=%s",
               bars_ok ? "OK" : "FAILED",
               ticks_ok ? "OK" : "FAILED",
               InpUseCommonFiles ? "true" : "false");
}
