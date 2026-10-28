//+------------------------------------------------------------------+
//| VoomSource1Bridge.mq5                                            |
//| Source 1 v6.2 -> MT5 read-only candidate bridge (paper-safe)      |
//| Does NOT send, modify, or close trading orders.                   |
//+------------------------------------------------------------------+
#property strict
#property version   "1.00"
#property description "Voom_system Source 1 candidate bridge; order execution disabled"

input group "=== Local Source 1 API ==="
input string InpApiUrl = "http://127.0.0.1:8000/strategy/analyze";
input string InpTelemetryUrl = "http://127.0.0.1:8000/mt5/telemetry";
input string InpApiToken = ""; // Enter token locally in EA inputs; never commit it.
input int    InpHttpTimeoutMs = 5000;
input int    InpBarsToSend = 200;
input int    InpTimerSeconds = 5;

input group "=== Safety ==="
input bool   InpPaperOnly = true; // Must remain true: this API is analysis-only.
input bool   InpShowPanel = true;
input ulong  InpMagic = 20261023; // Reserved for future reviewed execution; unused.

datetime g_lastBar = 0;
datetime g_lastRequest = 0;
datetime g_lastTelemetryError = 0;
string g_status = "STARTING";
string g_direction = "HOLD";
string g_reason = "No analysis yet";
double g_entry = 0.0, g_sl = 0.0, g_tp1 = 0.0, g_tp2 = 0.0, g_score = 0.0;
string g_response = "";

int OnInit()
{
   if(!InpPaperOnly)
   {
      Print("SAFETY BLOCK: this EA supports candidate analysis only; paper-only must remain true.");
      return INIT_PARAMETERS_INCORRECT;
   }
   if(StringFind(InpApiUrl, "http://127.0.0.1:") != 0 &&
      StringFind(InpApiUrl, "http://localhost:") != 0)
   {
      Print("SAFETY BLOCK: API URL must be localhost; public/network endpoints are not allowed.");
      return INIT_PARAMETERS_INCORRECT;
   }
   if(StringLen(InpApiToken) < 40)
   {
      g_status = "TOKEN MISSING";
      Print("Voom Source1 Bridge: set the local API token in EA Inputs; token is not logged.");
   }
   EventSetTimer(MathMax(1, InpTimerSeconds));
   g_status = (StringLen(InpApiToken) >= 40 ? "PAPER / READY" : "TOKEN REQUIRED");
   UpdatePanel();
   Print("Voom Source1 Bridge initialized. Paper-only; order execution is not implemented.");
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   Comment("");
}

void OnTick() {}

void OnTimer()
{
   UpdatePanel();
   if(StringLen(InpApiToken) < 40) return;
   PostTelemetry(); // heartbeat every timer tick; no trading functions are called.

   datetime bar = iTime(_Symbol, PERIOD_M15, 0);
   if(bar == 0 || bar == g_lastBar) return;
   // Wait until a new M15 candle is established; use only completed candles.
   if(TimeCurrent() - bar < 3) return;

   string body;
   if(!BuildPayload(body)) { g_status = "NOT ENOUGH BARS"; UpdatePanel(); return; }
   g_lastRequest = TimeCurrent();
   string reply;
   int code = PostAnalysis(body, reply);
   g_response = reply;
   if(code != 200)
   {
      g_status = StringFormat("API ERROR %d", code);
      g_reason = "HTTP request failed; see Experts log";
      PrintFormat("Voom Source1 Bridge HTTP error=%d (response length=%d)", code, StringLen(reply));
      UpdatePanel();
      return;
   }

   if(!ParseCandidate(reply))
   {
      g_status = "BLOCKED: INVALID API RESPONSE";
      if(g_reason == "") g_reason = "Missing paper-only flags or invalid signal fields";
      UpdatePanel();
      return; // Do not mark this candle processed when the response is rejected.
   }
   g_lastBar = bar; // Mark only after a fully validated response.
   UpdatePanel();
}


void PostTelemetry()
{
   MqlDateTime tm;
   TimeToStruct(TimeGMT(), tm);
   string timestamp = StringFormat("%04d-%02d-%02dT%02d:%02d:%02dZ", tm.year, tm.mon, tm.day, tm.hour, tm.min, tm.sec);
   bool terminalConnected = (TerminalInfoInteger(TERMINAL_CONNECTED) != 0);
   bool accountConnected = (AccountInfoInteger(ACCOUNT_LOGIN) > 0 && terminalConnected);
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   string body = StringFormat("{\"source\":\"mt5-ea\",\"mode\":\"paper\",\"timestamp\":\"%s\",\"terminalConnected\":%s,\"accountConnected\":%s,\"symbol\":\"%s\",\"timeframe\":\"M15\",\"bid\":%.10f,\"ask\":%.10f}", timestamp, (terminalConnected ? "true" : "false"), (accountConnected ? "true" : "false"), JsonEscape(_Symbol), bid, ask);
   char data[], result[];
   string headers = "Content-Type: application/json\r\nAuthorization: Bearer " + InpApiToken + "\r\n";
   string result_headers;
   int n = StringToCharArray(body, data, 0, WHOLE_ARRAY, CP_UTF8);
   if(n <= 1) return;
   ArrayResize(data, n-1);
   ResetLastError();
   int status = WebRequest("POST", InpTelemetryUrl, headers, InpHttpTimeoutMs, data, result, result_headers);
   if(status != 202 && TimeCurrent() - g_lastTelemetryError >= 60)
   {
      g_lastTelemetryError = TimeCurrent();
      PrintFormat("Voom telemetry relay not accepted; HTTP=%d (paper-only, no orders)", status);
   }
}

bool BuildPayload(string &body)
{
   int count = (int)MathMax(100, MathMin(InpBarsToSend, 500));
   MqlRates rates[];
   ArraySetAsSeries(rates, false);
   int copied = CopyRates(_Symbol, PERIOD_M15, 1, count, rates); // completed bars only
   if(copied < 100) return false;

   body = "{\"symbol\":\"" + JsonEscape(_Symbol) + "\",\"dl_score\":0.0,\"candles\":[";
   for(int i=0; i<copied; i++)
   {
      if(i > 0) body += ",";
      body += StringFormat("{\"open\":%.10f,\"high\":%.10f,\"low\":%.10f,\"close\":%.10f,\"tick_volume\":%.0f}",
                           rates[i].open, rates[i].high, rates[i].low, rates[i].close,
                           (double)rates[i].tick_volume);
   }
   body += "]}";
   return true;
}

string JsonEscape(const string value)
{
   string out = value;
   StringReplace(out, "\\", "\\\\");
   StringReplace(out, "\"", "\\\"");
   return out;
}

int PostAnalysis(const string body, string &reply)
{
   char data[], result[];
   string headers = "Content-Type: application/json\r\nAuthorization: Bearer " + InpApiToken + "\r\n";
   string result_headers;
   int n = StringToCharArray(body, data, 0, WHOLE_ARRAY, CP_UTF8);
   if(n <= 1) return -1;
   ArrayResize(data, n-1); // remove terminating NUL
   ResetLastError();
   int status = WebRequest("POST", InpApiUrl, headers, InpHttpTimeoutMs, data, result, result_headers);
   if(status == -1)
   {
      int err = GetLastError();
      PrintFormat("Voom Source1 Bridge WebRequest failed, error=%d. Add http://127.0.0.1:8000 to MT5 allowed URLs.", err);
      reply = "";
      return -1;
   }
   reply = CharArrayToString(result, 0, -1, CP_UTF8);
   return status;
}

string JsonString(const string json, const string key)
{
   string marker = "\"" + key + "\"";
   int p = StringFind(json, marker);
   if(p < 0) return "";
   p = StringFind(json, ":", p + StringLen(marker));
   if(p < 0) return "";
   p++;
   while(p < StringLen(json) && (StringGetCharacter(json,p)==' ' || StringGetCharacter(json,p)=='\t')) p++;
   if(p >= StringLen(json) || StringGetCharacter(json,p)!='"') return "";
   p++;
   int e = StringFind(json, "\"", p);
   if(e < 0) return "";
   return StringSubstr(json, p, e-p);
}

double JsonNumber(const string json, const string key)
{
   string marker = "\"" + key + "\"";
   int p = StringFind(json, marker);
   if(p < 0) return 0.0;
   p = StringFind(json, ":", p + StringLen(marker));
   if(p < 0) return 0.0;
   p++;
   while(p < StringLen(json) && (StringGetCharacter(json,p)==' ' || StringGetCharacter(json,p)=='\t')) p++;
   int e = p;
   while(e < StringLen(json))
   {
      ushort c = StringGetCharacter(json,e);
      if((c>='0' && c<='9') || c=='-' || c=='+' || c=='.' || c=='e' || c=='E') e++;
      else break;
   }
   if(e == p) return 0.0;
   return StringToDouble(StringSubstr(json,p,e-p));
}

bool ParseCandidate(const string json)
{
   // Fail closed: require explicit API safety flags and matching symbol.
   if((StringFind(json, "\"executionEnabled\": false") < 0 &&
       StringFind(json, "\"executionEnabled\":false") < 0) ||
      (StringFind(json, "\"paper_only\": true") < 0 &&
       StringFind(json, "\"paper_only\":true") < 0))
   {
      g_reason = "API response missing paper-only safety flags";
      return false;
   }

   string symbol = JsonString(json, "symbol");
   string direction = JsonString(json, "direction");
   if(symbol != _Symbol)
   {
      g_reason = "API symbol mismatch";
      return false;
   }
   if(direction != "BUY" && direction != "SELL" && direction != "HOLD")
   {
      g_reason = "API returned an invalid direction";
      return false;
   }

   double entry = JsonNumber(json, "entry");
   double sl = JsonNumber(json, "stopLoss");
   double tp1 = JsonNumber(json, "takeProfit1");
   double tp2 = JsonNumber(json, "takeProfit2");
   double score = JsonNumber(json, "score");
   if(!MathIsValidNumber(score) || score < 0.0 || score > 1.5)
   {
      g_reason = "API score is outside the accepted range";
      return false;
   }
   if(direction != "HOLD")
   {
      if(!MathIsValidNumber(entry) || !MathIsValidNumber(sl) ||
         !MathIsValidNumber(tp1) || !MathIsValidNumber(tp2) ||
         entry <= 0.0 || sl <= 0.0 || tp1 <= 0.0 || tp2 <= 0.0)
      {
         g_reason = "API returned missing or invalid price levels";
         return false;
      }
      if(direction == "BUY" && !(sl < entry && tp1 > entry && tp2 >= tp1))
      {
         g_reason = "BUY stop-loss/take-profit levels are inconsistent";
         return false;
      }
      if(direction == "SELL" && !(sl > entry && tp1 < entry && tp2 <= tp1))
      {
         g_reason = "SELL stop-loss/take-profit levels are inconsistent";
         return false;
      }
   }

   g_direction = direction;
   g_entry = entry;
   g_sl = sl;
   g_tp1 = tp1;
   g_tp2 = tp2;
   g_score = score;
   g_reason = JsonString(json, "reason");
   if(g_reason == "") g_reason = "Source 1 response validated";
   if(direction == "HOLD") g_status = "PAPER / HOLD";
   else g_status = "PAPER CANDIDATE - NOT EXECUTED";
   PrintFormat("Source1 candidate validated: %s | score=%.2f | paper only, no orders", g_direction, g_score);
   return true;
}
void UpdatePanel()
{
   if(!InpShowPanel) return;
   Comment(StringFormat(
      "VOOM Source 1 Bridge v1.00\n"
      "Mode: PAPER ONLY - NO ORDERS\n"
      "API: %s\n"
      "Status: %s\n"
      "Symbol/TF: %s / M15\n"
      "Candidate: %s | Score: %.2f\n"
      "Entry: %.*f\nSL: %.*f\nTP1: %.*f\nTP2: %.*f\n"
      "Reason: %s\nLast request: %s",
      InpApiUrl, g_status, _Symbol, g_direction, g_score,
      _Digits, g_entry, _Digits, g_sl, _Digits, g_tp1, _Digits, g_tp2,
      StringSubstr(g_reason,0,180),
      (g_lastRequest>0 ? TimeToString(g_lastRequest,TIME_DATE|TIME_SECONDS) : "-")));
}