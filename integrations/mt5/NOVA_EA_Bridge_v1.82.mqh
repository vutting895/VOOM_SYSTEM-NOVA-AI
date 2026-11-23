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

string NovaEABridgeTimeframe()
{
   if(_Period==PERIOD_M1) return "M1";
   if(_Period==PERIOD_M2) return "M2";
   if(_Period==PERIOD_M3) return "M3";
   if(_Period==PERIOD_M4) return "M4";
   if(_Period==PERIOD_M5) return "M5";
   if(_Period==PERIOD_M6) return "M6";
   if(_Period==PERIOD_M10) return "M10";
   if(_Period==PERIOD_M12) return "M12";
   if(_Period==PERIOD_M15) return "M15";
   if(_Period==PERIOD_M20) return "M20";
   if(_Period==PERIOD_M30) return "M30";
   if(_Period==PERIOD_H1) return "H1";
   if(_Period==PERIOD_H2) return "H2";
   if(_Period==PERIOD_H3) return "H3";
   if(_Period==PERIOD_H4) return "H4";
   if(_Period==PERIOD_H6) return "H6";
   if(_Period==PERIOD_H8) return "H8";
   if(_Period==PERIOD_H12) return "H12";
   if(_Period==PERIOD_D1) return "D1";
   if(_Period==PERIOD_W1) return "W1";
   if(_Period==PERIOD_MN1) return "MN1";
   return "UNSUPPORTED";
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
   if(StringLen(gNovaEABridgeToken)<48 || (bool)MQLInfoInteger(MQL_TESTER)) return;
   datetime now=TimeLocal();
   if(gNovaEABridgeLastSent>0 && now-gNovaEABridgeLastSent<NOVA_EA_BRIDGE_INTERVAL_SEC) return;
   gNovaEABridgeLastSent=now;

   MqlTick tick;
   datetime tickTime=0;
   if(SymbolInfoTick(_Symbol,tick)) tickTime=(datetime)tick.time;
   datetime barTime=iTime(_Symbol,_Period,0);
   datetime utcNow=TimeGMT();
   int serverUtcOffset=(int)(TimeCurrent()-utcNow);
   if(tickTime>0) tickTime-=serverUtcOffset; else tickTime=utcNow;
   if(barTime>0) barTime-=serverUtcOffset; else barTime=utcNow;
   string payload=StringFormat(
      "{\"ea_id\":\"NOVA_EA_v1.82\",\"version\":\"1.82\",\"symbol\":\"%s\",\"timeframe\":\"%s\",\"mode\":\"read-only\",\"orders_enabled\":false,\"live_trading_enabled\":false,\"last_tick_utc\":\"%s\",\"last_bar_utc\":\"%s\",\"signal_count\":%I64u}",
      _Symbol,NovaEABridgeTimeframe(),NovaEABridgeIsoUtc(tickTime),NovaEABridgeIsoUtc(barTime));

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
