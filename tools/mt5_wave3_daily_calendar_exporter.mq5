#property strict
#property version "1.00"
#property description "Read-only hourly refresh of the Exness high-impact USD calendar for VOOM Wave3."

input string OutputFileName = "VOOM_USD_High_Impact_Daily.csv";
input datetime CoverageStart = D'2022.07.21 00:00';
input int RefreshIntervalSeconds = 3600;
input int ServerUtcToleranceSeconds = 120;

string TemporaryFileName()
{
   return OutputFileName + ".tmp";
}

string FormatUtc(datetime value)
{
   MqlDateTime parts;
   TimeToStruct(value, parts);
   return StringFormat("%04d-%02d-%02dT%02d:%02d:%02dZ",
                       parts.year, parts.mon, parts.day,
                       parts.hour, parts.min, parts.sec);
}

string TimeModeName(ENUM_CALENDAR_EVENT_TIMEMODE mode)
{
   switch(mode)
   {
      case CALENDAR_TIMEMODE_DATETIME:  return "datetime";
      case CALENDAR_TIMEMODE_DATE:      return "date";
      case CALENDAR_TIMEMODE_NOTIME:    return "notime";
      case CALENDAR_TIMEMODE_TENTATIVE: return "tentative";
   }
   return "unknown";
}

datetime NextMonth(datetime value)
{
   MqlDateTime parts;
   TimeToStruct(value, parts);
   parts.day=1;
   parts.hour=0;
   parts.min=0;
   parts.sec=0;
   parts.mon++;
   if(parts.mon>12)
   {
      parts.mon=1;
      parts.year++;
   }
   return StructToTime(parts);
}

bool AlreadyWritten(const ulong value_id, ulong &seen_ids[])
{
   for(int i=0; i<ArraySize(seen_ids); i++)
      if(seen_ids[i]==value_id)
         return true;
   return false;
}

bool ExportCalendar()
{
   if(CoverageStart<=0 || RefreshIntervalSeconds<300)
   {
      Print("NEWS_EXPORT_ERROR: invalid coverage start or refresh interval");
      return false;
   }

   datetime server_now=TimeTradeServer();
   datetime utc_now=TimeGMT();
   long utc_offset=(long)(server_now-utc_now);
   if(MathAbs(utc_offset)>ServerUtcToleranceSeconds)
   {
      PrintFormat("NEWS_EXPORT_ERROR: Exness server/UTC offset is %d seconds; expected GMT+0", utc_offset);
      return false;
   }
   if(server_now<=CoverageStart)
   {
      Print("NEWS_EXPORT_ERROR: current time is not later than coverage start");
      return false;
   }

   string temp_name=TemporaryFileName();
   FileDelete(temp_name,FILE_COMMON);
   int file=FileOpen(temp_name,FILE_WRITE|FILE_CSV|FILE_ANSI|FILE_COMMON|FILE_SHARE_READ,',');
   if(file==INVALID_HANDLE)
   {
      PrintFormat("NEWS_EXPORT_ERROR: temporary FileOpen failed, error=%d",GetLastError());
      return false;
   }

   FileWrite(file,"timestamp","impact","currency","event","country",
             "time_mode","calendar_source","calendar_timezone",
             "coverage_start_utc","coverage_end_exclusive_utc",
             "event_id","value_id");

   int queried_values=0;
   int high_events=0;
   int lookup_failures=0;
   int query_failures=0;
   int unknown_time_modes=0;
   ulong seen_ids[];

   datetime cursor=CoverageStart;
   while(cursor<server_now)
   {
      datetime next=NextMonth(cursor);
      datetime chunk_end=(next<server_now ? next : server_now);
      MqlCalendarValue values[];
      ResetLastError();
      int count=CalendarValueHistory(values,cursor,chunk_end,"US","USD");
      if(count<0)
      {
         query_failures++;
         PrintFormat("NEWS_EXPORT_ERROR: CalendarValueHistory failed for %s to %s, error=%d",
                     FormatUtc(cursor),FormatUtc(chunk_end),GetLastError());
         break;
      }

      queried_values+=count;
      for(int i=0; i<count; i++)
      {
         if(AlreadyWritten(values[i].id,seen_ids))
            continue;
         int seen_count=ArraySize(seen_ids);
         ArrayResize(seen_ids,seen_count+1);
         seen_ids[seen_count]=values[i].id;

         MqlCalendarEvent event;
         if(!CalendarEventById(values[i].event_id,event))
         {
            lookup_failures++;
            PrintFormat("NEWS_EXPORT_ERROR: CalendarEventById failed for event_id=%I64u, error=%d",
                        values[i].event_id,GetLastError());
            continue;
         }
         if(event.importance!=CALENDAR_IMPORTANCE_HIGH)
            continue;

         MqlCalendarCountry country;
         if(!CalendarCountryById(event.country_id,country))
         {
            lookup_failures++;
            PrintFormat("NEWS_EXPORT_ERROR: CalendarCountryById failed for country_id=%I64u, error=%d",
                        event.country_id,GetLastError());
            continue;
         }
         if(country.code!="US" || country.currency!="USD")
            continue;

         string mode=TimeModeName(event.time_mode);
         if(mode=="unknown")
            unknown_time_modes++;

         string event_name=event.name;
         StringReplace(event_name,"\r"," ");
         StringReplace(event_name,"\n"," ");

         FileWrite(file,
                   FormatUtc(values[i].time),
                   "high",
                   country.currency,
                   event_name,
                   country.code,
                   mode,
                   "MQL5 Economic Calendar",
                   "UTC (Exness trade server GMT+0)",
                   FormatUtc(CoverageStart),
                   FormatUtc(server_now),
                   StringFormat("%I64u",values[i].event_id),
                   StringFormat("%I64u",values[i].id));
         high_events++;
      }
      cursor=chunk_end;
   }

   FileFlush(file);
   FileClose(file);

   if(query_failures>0 || lookup_failures>0 || unknown_time_modes>0 || high_events==0)
   {
      FileDelete(temp_name,FILE_COMMON);
      PrintFormat("NEWS_EXPORT_INVALID: query_failures=%d lookup_failures=%d unknown_time_modes=%d high_events=%d; previous valid export preserved",
                  query_failures,lookup_failures,unknown_time_modes,high_events);
      return false;
   }

   ResetLastError();
   if(!FileMove(temp_name,FILE_COMMON,OutputFileName,FILE_COMMON|FILE_REWRITE))
   {
      PrintFormat("NEWS_EXPORT_ERROR: atomic replacement failed, error=%d; previous valid export preserved",
                  GetLastError());
      FileDelete(temp_name,FILE_COMMON);
      return false;
   }

   PrintFormat("NEWS_EXPORT_SUCCESS: high_events=%d queried_values=%d unknown_time_modes=0 coverage_start_utc=%s coverage_end_exclusive_utc=%s file=Common\\Files\\%s",
               high_events,queried_values,FormatUtc(CoverageStart),FormatUtc(server_now),OutputFileName);
   return true;
}

int OnInit()
{
   if(!EventSetTimer(RefreshIntervalSeconds))
   {
      PrintFormat("NEWS_EXPORT_ERROR: EventSetTimer failed, error=%d",GetLastError());
      return INIT_FAILED;
   }
   ExportCalendar();
   Print("NEWS_EXPORT_INFO: hourly read-only calendar refresh is active; no trading functions are present");
   return INIT_SUCCEEDED;
}

void OnTimer()
{
   ExportCalendar();
}

void OnDeinit(const int reason)
{
   EventKillTimer();
}
