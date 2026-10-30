#property strict
#property script_show_inputs
#property version "1.00"
#property description "Read-only export of high-impact USD calendar events for VOOM Wave3 research."

input string OutputFileName = "VOOM_USD_High_Impact_2022_2026.csv";
input datetime CoverageStart = D'2022.07.21 00:00';
input datetime CoverageEndExclusive = D'2026.10.30 00:00';

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

void OnStart()
{
   if(CoverageStart>=CoverageEndExclusive)
   {
      Print("NEWS_EXPORT_ERROR: invalid coverage range");
      return;
   }

   int file=FileOpen(OutputFileName, FILE_WRITE|FILE_CSV|FILE_ANSI|FILE_COMMON, ',');
   if(file==INVALID_HANDLE)
   {
      PrintFormat("NEWS_EXPORT_ERROR: FileOpen failed, error=%d", GetLastError());
      return;
   }

   FileWrite(file, "timestamp", "impact", "currency", "event", "country",
             "time_mode", "calendar_source", "calendar_timezone",
             "coverage_start_utc", "coverage_end_exclusive_utc",
             "event_id", "value_id");

   int queried_values=0;
   int high_events=0;
   int lookup_failures=0;
   int query_failures=0;
   int unknown_time_modes=0;

   datetime cursor=CoverageStart;
   while(cursor<CoverageEndExclusive)
   {
      datetime next=NextMonth(cursor);
      datetime chunk_end=(next<CoverageEndExclusive ? next : CoverageEndExclusive);
      MqlCalendarValue values[];
      ResetLastError();
      int count=CalendarValueHistory(values, cursor, chunk_end, "US", "USD");
      if(count<0)
      {
         query_failures++;
         PrintFormat("NEWS_EXPORT_ERROR: CalendarValueHistory failed for %s to %s, error=%d",
                     FormatUtc(cursor), FormatUtc(chunk_end), GetLastError());
         break;
      }

      queried_values+=count;
      for(int i=0; i<count; i++)
      {
         MqlCalendarEvent event;
         if(!CalendarEventById(values[i].event_id, event))
         {
            lookup_failures++;
            PrintFormat("NEWS_EXPORT_ERROR: CalendarEventById failed for event_id=%I64u, error=%d",
                        values[i].event_id, GetLastError());
            continue;
         }
         if(event.importance!=CALENDAR_IMPORTANCE_HIGH)
            continue;

         MqlCalendarCountry country;
         if(!CalendarCountryById(event.country_id, country))
         {
            lookup_failures++;
            PrintFormat("NEWS_EXPORT_ERROR: CalendarCountryById failed for country_id=%I64u, error=%d",
                        event.country_id, GetLastError());
            continue;
         }
         if(country.code!="US" || country.currency!="USD")
            continue;

         string mode=TimeModeName(event.time_mode);
         if(mode=="unknown")
            unknown_time_modes++;

         string event_name=event.name;
         StringReplace(event_name, "\r", " ");
         StringReplace(event_name, "\n", " ");

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
                   FormatUtc(CoverageEndExclusive),
                   StringFormat("%I64u", values[i].event_id),
                   StringFormat("%I64u", values[i].id));
         high_events++;
      }

      cursor=chunk_end;
   }

   FileClose(file);

   if(query_failures>0 || lookup_failures>0 || high_events==0)
   {
      FileDelete(OutputFileName, FILE_COMMON);
      PrintFormat("NEWS_EXPORT_INVALID: query_failures=%d lookup_failures=%d high_events=%d; partial file deleted",
                  query_failures, lookup_failures, high_events);
      return;
   }

   PrintFormat("NEWS_EXPORT_SUCCESS: high_events=%d queried_values=%d unknown_time_modes=%d file=Common\\Files\\%s",
               high_events, queried_values, unknown_time_modes, OutputFileName);
   Print("NEWS_EXPORT_NOTE: date/notime/tentative/unknown events must be treated as full-day blackouts by the research loader.");
}
