//+------------------------------------------------------------------+
//| NOVA_BrainEventExporter.mqh                                       |
//| Local-only JSONL telemetry writer. No network or trade APIs.     |
//+------------------------------------------------------------------+
#ifndef NOVA_BRAIN_EVENT_EXPORTER_MQH
#define NOVA_BRAIN_EVENT_EXPORTER_MQH

string NOVA_JsonEscape(string value)
{
   StringReplace(value, "\\", "\\\\");
   StringReplace(value, "\"", "\\\"");
   StringReplace(value, "\r", "\\r");
   StringReplace(value, "\n", "\\n");
   StringReplace(value, "\t", "\\t");
   return value;
}

string NOVA_UtcIso(const datetime value)
{
   MqlDateTime p;
   TimeToStruct(value, p);
   return StringFormat("%04d-%02d-%02dT%02d:%02d:%02dZ",
                       p.year, p.mon, p.day, p.hour, p.min, p.sec);
}

string NOVA_TimeframeName(const ENUM_TIMEFRAMES timeframe)
{
   switch(timeframe)
   {
      case PERIOD_M1: return "M1";
      case PERIOD_M5: return "M5";
      case PERIOD_M15: return "M15";
      case PERIOD_M30: return "M30";
      case PERIOD_H1: return "H1";
      case PERIOD_H4: return "H4";
      case PERIOD_D1: return "D1";
   }
   return "";
}

string NOVA_NewEventId()
{
   static bool seeded=false;
   if(!seeded)
   {
      MathSrand((int)(TimeLocal() ^ GetTickCount()));
      seeded=true;
   }
   uint a=(uint)TimeGMT();
   uint b=(uint)MathRand();
   uint c=(uint)(MathRand() & 0x0FFF);
   uint d=(uint)((MathRand() & 0x3FFF) | 0x8000);
   uint e=(uint)GetMicrosecondCount();
   return StringFormat("%08X-%04X-4%03X-%04X-%08X", a, b, c, d, e);
}

// Emits only market_snapshot observations. HMAC is deliberately a placeholder:
// the host uploader overwrites it using a locally provisioned HMAC key.
// Never add account login, broker server, balance, equity, token or credentials.
bool NOVA_ExportMarketSnapshot(const string symbol,
                               const ENUM_TIMEFRAMES timeframe,
                               const string ea_version,
                               const string source_sha256,
                               const string repo_commit,
                               const long magic_scope,
                               const double bid,
                               const double ask,
                               const double spread_points,
                               const double atr,
                               const bool bar_closed,
                               const string data_quality,
                               const bool use_common_files=true)
{
   if(symbol=="" || ea_version=="" || StringLen(source_sha256)!=64 ||
      StringLen(repo_commit)!=40 || magic_scope<0 ||
      bid<0 || ask<0 || spread_points<0 || atr<0)
   {
      Print("NOVA_EVENT_EXPORT_REJECTED reason=invalid_input");
      return false;
   }
   if(StringLen(NOVA_TimeframeName(timeframe))==0)
   {
      Print("NOVA_EVENT_EXPORT_REJECTED reason=unsupported_timeframe");
      return false;
   }
   string folder="NOVA_BRAIN_EVENTS";
   int common_flag=use_common_files ? FILE_COMMON : 0;
   if(!FolderCreate(folder, common_flag) && GetLastError()!=5019)
   {
      PrintFormat("NOVA_EVENT_EXPORT_REJECTED reason=folder_create error=%d", GetLastError());
      return false;
   }
   string filename=folder+"\\events.jsonl";
   int flags=FILE_READ|FILE_WRITE|FILE_TXT|FILE_ANSI|FILE_SHARE_READ|common_flag;
   ResetLastError();
   int file=FileOpen(filename, flags);
   if(file==INVALID_HANDLE)
   {
      PrintFormat("NOVA_EVENT_EXPORT_REJECTED reason=file_open error=%d", GetLastError());
      return false;
   }
   string event_id=NOVA_NewEventId();
   string event="{";
   event+="\"schema_version\":\"1.0\",";
   event+="\"event_id\":\""+event_id+"\",";
   event+="\"event_type\":\"market_snapshot\",";
   event+="\"occurred_at\":\""+NOVA_UtcIso(TimeGMT())+"\",";
   event+="\"source\":{";
   event+="\"component\":\"mt5_ea\",";
   event+="\"ea_version\":\""+NOVA_JsonEscape(ea_version)+"\",";
   event+="\"source_sha256\":\""+StringToLower(source_sha256)+"\",";
   event+="\"repo_commit\":\""+StringToLower(repo_commit)+"\",";
   event+="\"symbol\":\""+NOVA_JsonEscape(symbol)+"\",";
   event+="\"timeframe\":\""+NOVA_TimeframeName(timeframe)+"\"},";
   event+="\"scope\":{\"account_scope_hmac\":\""+StringFormat("%064d",0)+"\",";
   event+="\"magic_scope\":"+IntegerToString(magic_scope)+"},";
   event+="\"market\":{";
   event+="\"bid\":"+DoubleToString(bid, _Digits)+",";
   event+="\"ask\":"+DoubleToString(ask, _Digits)+",";
   event+="\"spread_points\":"+DoubleToString(spread_points, 2)+",";
   event+="\"atr\":"+DoubleToString(atr, _Digits)+",";
   event+="\"bar_closed\":"+(bar_closed ? "true" : "false")+",";
   event+="\"data_quality\":\""+NOVA_JsonEscape(data_quality)+"\"}}";
   FileSeek(file, 0, SEEK_END);
   uint written=FileWriteString(file, event+"\r\n");
   FileFlush(file);
   FileClose(file);
   if(written==0)
   {
      Print("NOVA_EVENT_EXPORT_REJECTED reason=write_failed");
      return false;
   }
   PrintFormat("NOVA_EVENT_EXPORTED event_id=%s type=market_snapshot bytes=%u",
               event_id, written);
   return true;
}
#endif
