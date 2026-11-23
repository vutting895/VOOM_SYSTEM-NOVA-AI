//+------------------------------------------------------------------+
//| NOVA EA Bridge v1.82 — local telemetry only / READ-ONLY          |
//| Sends a two-second heartbeat to the loopback MT5 bridge.         |
//| No broker order, position, modify, close, or trade API exists.   |
//+------------------------------------------------------------------+
#ifndef NOVA_EA_BRIDGE_V182_MQH
#define NOVA_EA_BRIDGE_V182_MQH

#define NOVA_EA_BRIDGE_URL "http://127.0.0.1:8787/api/ea/heartbeat"
#define NOVA_EA_BRIDGE_TOKEN_FILE "nova-ea-bridge.token"
#define NOVA_EA_BRIDGE_INTERVAL_SEC 2

string   gNovaEABridgeToken = "";
datetime gNovaEABridgeLastSent = 0;
datetime gNovaEABridgeLastErrorLog = 0;

string NovaEABridgeIsoUtc(const datetime value)
{
   MqlDateTime dt;
   TimeToStruct(value,dt);
   return StringFormat("%04d-%02d-%02dT%02d:%02d:%02dZ",
                       dt.year,dt.mon,dt.day,dt.hour,dt.min,dt.sec);
}

bool NovaEABridgeInit()
{
   int handle=FileOpen(NOVA_EA_BRIDGE_TOKEN_FILE,FILE_READ|FILE_TXT|FILE_COMMON|FILE_ANSI);
   if(handle==INVALID_HANDLE)
   {
      Print("NOVA EA Bridge: private token file not found; telemetry remains disconnected.");
      return false;
   }
   gNovaEABridgeToken=FileReadString(handle);
   FileClose(handle);
   StringTrimLeft(gNovaEABridgeToken);
   StringTrimRight(gNovaEABridgeToken);
   if(StringLen(gNovaEABridgeToken)<48)
   {
      gNovaEABridgeToken="";
      Print("NOVA EA Bridge: private token file is invalid; telemetry remains disconnected.");
      return false;
   }
   Print("NOVA EA Bridge initialized; local telemetry only; READ-ONLY.");
   return true;
}

void NovaEABridgeHeartbeat(const ulong signalCount)
{
   if(StringLen(gNovaEABridgeToken)<48) return;
   datetime now=TimeLocal();
   if(gNovaEABridgeLastSent>0 && now-gNovaEABridgeLastSent<NOVA_EA_BRIDGE_INTERVAL_SEC) return;
   gNovaEABridgeLastSent=now;

   MqlTick tick;
   datetime tickTime=0;
   if(SymbolInfoTick(_Symbol,tick)) tickTime=(datetime)tick.time;
   datetime barTime=iTime(_Symbol,_Period,0);
   string payload=StringFormat(
      "{\"ea_id\":\"NOVA_EA_v1.82\",\"version\":\"1.82\",\"symbol\":\"%s\",\"timeframe\":\"%s\",\"mode\":\"read-only\",\"orders_enabled\":false,\"live_trading_enabled\":false,\"last_tick_utc\":\"%s\",\"last_bar_utc\":\"%s\",\"signal_count\":%I64u}",
      _Symbol,EnumToString(_Period),NovaEABridgeIsoUtc(tickTime),NovaEABridgeIsoUtc(barTime));

   char data[];
   int bytes=StringToCharArray(payload,data,0,WHOLE_ARRAY,CP_UTF8);
   if(bytes>0) ArrayResize(data,bytes-1); // omit the terminating NUL
   char result[];
   string resultHeaders;
   string headers="Content-Type: application/json\r\nX-NOVA-EA-TOKEN: "+gNovaEABridgeToken+"\r\n";
   ResetLastError();
   int status=WebRequest("POST",NOVA_EA_BRIDGE_URL,headers,1500,data,result,resultHeaders);
   if(status!=200 && now-gNovaEABridgeLastErrorLog>=30)
   {
      Print("NOVA EA Bridge heartbeat unavailable; HTTP=",status," err=",GetLastError(),
            ". Check MT5 WebRequest allowlist and local Bridge process.");
      gNovaEABridgeLastErrorLog=now;
   }
}

void NovaEABridgeDeinit()
{
   gNovaEABridgeToken="";
}

#endif // NOVA_EA_BRIDGE_V182_MQH
