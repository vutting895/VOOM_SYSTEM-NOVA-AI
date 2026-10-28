//+------------------------------------------------------------------+
//| VoomSystemEA.mq5                                                  |
//| Voom_system Source 1 bridge - paper/demo validation only          |
//| SECURITY: this build never sends, modifies, or closes orders.     |
//+------------------------------------------------------------------+
#property strict
#property version   "1.00"
#property description "Voom_system Source 1 bridge; analysis only, no order execution"

input group "=== Source 1 Local API ==="
input string InpApiUrl = "http://127.0.0.1:8000/strategy/analyze";
input string InpApiToken = ""; // Set locally in MT5 Inputs. Never put secrets in source control.
input int    InpHttpTimeoutMs = 5000;
input int    InpBarsToSend = 200; // Effective range 100..500
input int    InpTimerSeconds = 2;
input ENUM_TIMEFRAMES InpSignalTimeframe = PERIOD_M15;

input group "=== Safety / Display ==="
input bool   InpPaperOnly = true; // Required; this EA contains no order execution.
input bool   InpShowPanel = true;
input bool   InpLogResponses = false; // Keep false to avoid leaking API response details.
input ulong  InpMagic = 20261023; // Reserved metadata; not used to trade.
input string InpTelemetryUrl = "https://voom-system-api.suwapat787.workers.dev/api/mt5/telemetry";
input string InpTelemetrySecret = ""; // Set locally; never log or commit.
input int    InpTelemetryIntervalSeconds = 10;

string   g_status = "STARTING";
string   g_direction = "HOLD";
string   g_reason = "Waiting for a completed candle";
string   g_source = "-";
double   g_entry = 0.0, g_sl = 0.0, g_tp1 = 0.0, g_tp2 = 0.0, g_score = 0.0;
datetime g_lastTelemetry = 0;
datetime g_lastBar = 0;
datetime g_lastRequest = 0;
datetime g_lastSuccess = 0;
int      g_lastHttp = 0;

int OnInit()
{
   if(!InpPaperOnly)
   {
      Print("SAFETY BLOCK: this build is analysis-only; set InpPaperOnly=true.");
      return INIT_PARAMETERS_INCORRECT;
   }
   if(StringFind(InpApiUrl, "http://127.0.0.1:") != 0 &&
      StringFind(InpApiUrl, "http://localhost:") != 0)
   {
      Print("SAFETY BLOCK: only a localhost API URL is allowed.");
      return INIT_PARAMETERS_INCORRECT;
   }
   EventSetTimer((int)MathMax(1, InpTimerSeconds));
   g_status = (StringLen(InpApiToken) >= 40 ? "PAPER READY" : "TOKEN REQUIRED");
   UpdatePanel();
   Print("VoomSystemEA v1.00 initialized: Source 1 analysis only; NO order functions included.");
   if(StringLen(InpApiToken) < 40)
      Print("Set the local API bearer token in EA Inputs. Token is not logged.");
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
   SendTelemetryIfDue();
   if(StringLen(InpApiToken) < 40) { g_status = "TOKEN REQUIRED"; UpdatePanel(); return; }
   datetime currentBar = iTime(_Symbol, InpSignalTimeframe, 0);
   if(currentBar <= 0 || currentBar == g_lastBar) { UpdatePanel(); return; }
   if(TimeCurrent() - currentBar < 2) { UpdatePanel(); return; }

   string payload;
   if(!BuildPayload(payload))
   {
      g_status = "WAITING FOR HISTORY";
      g_reason = "MT5 needs at least 100 completed bars";
      UpdatePanel();
      return;
   }

   string response;
   g_lastRequest = TimeCurrent();
   int http = PostAnalysis(payload, response);
   g_lastHttp = http;
   if(http != 200)
   {
      g_status = StringFormat("API ERROR %d", http);
      g_reason = (http == -1 ? "WebRequest failed; check MT5 URL allowlist and local API" : "API rejected request; check local API log");
      PrintFormat("VoomSystemEA: HTTP request failed, code=%d. No order was sent.", http);
      UpdatePanel();
      return; // Retry on next timer tick; do not mark bar complete on failure.
   }

   if(InpLogResponses) Print("VoomSystemEA API response received (length=", StringLen(response), ")");
   if(!ParseAndValidate(response))
   {
      g_status = "BLOCKED: INVALID API RESPONSE";
      g_reason = "Response missing safe execution flag or valid signal fields";
      UpdatePanel();
      return;
   }
   g_lastBar = currentBar;
   g_lastSuccess = TimeCurrent();
   UpdatePanel();
}

void SendTelemetryIfDue()
{
   if(StringLen(InpTelemetrySecret) < 40 || StringLen(InpTelemetryUrl) < 20) return;
   datetime now = TimeCurrent();
   if(g_lastTelemetry > 0 && now - g_lastTelemetry < (int)MathMax(5, InpTelemetryIntervalSeconds)) return;
   g_lastTelemetry = now;

   string stamp = TimeToString(TimeGMT(), TIME_DATE|TIME_SECONDS);
   StringReplace(stamp, ".", "-");
   StringReplace(stamp, " ", "T");
   bool terminalOK = (bool)TerminalInfoInteger(TERMINAL_CONNECTED);
   bool accountOK = (bool)AccountInfoInteger(ACCOUNT_LOGIN) > 0;
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   string body = "{\"source\":\"mt5-ea\",\"mode\":\"paper\",\"timestamp\":\"" + stamp + "\",\"terminalConnected\":" + (terminalOK ? "true" : "false") + ",\"accountConnected\":" + (accountOK ? "true" : "false") + ",\"symbol\":\"" + JsonEscape(_Symbol) + "\",\"timeframe\":\"" + EnumToString((ENUM_TIMEFRAMES)_Period) + "\",\"bid\":" + DoubleToString(bid, _Digits) + ",\"ask\":" + DoubleToString(ask, _Digits) + "}";
   char data[], result[];
   string headers = "Content-Type: application/json\r\nX-Voom-Bridge-Secret: " + InpTelemetrySecret + "\r\n";
   string resultHeaders;
   int n = StringToCharArray(body, data, 0, WHOLE_ARRAY, CP_UTF8);
   if(n <= 1) return;
   ArrayResize(data, n-1);
   ResetLastError();
   int status = WebRequest("POST", InpTelemetryUrl, headers, InpHttpTimeoutMs, data, result, resultHeaders);
   if(status != 202)
      PrintFormat("Voom telemetry failed HTTP=%d err=%d; no trading actions are available.", status, GetLastError());
}

bool BuildPayload(string &body)
{
   int count = (int)MathMax(100, MathMin(InpBarsToSend, 500));
   MqlRates rates[];
   ArraySetAsSeries(rates, false);
   int copied = CopyRates(_Symbol, InpSignalTimeframe, 1, count, rates);
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
   string resultHeaders;
   int n = StringToCharArray(body, data, 0, WHOLE_ARRAY, CP_UTF8);
   if(n <= 1) return -1;
   ArrayResize(data, n-1); // remove NUL terminator
   ResetLastError();
   int status = WebRequest("POST", InpApiUrl, headers, InpHttpTimeoutMs, data, result, resultHeaders);
   if(status == -1)
   {
      PrintFormat("VoomSystemEA WebRequest failed, error=%d. Add http://127.0.0.1:8000 to MT5 allowed URLs.", GetLastError());
      reply = "";
      return -1;
   }
   reply = CharArrayToString(result, 0, -1, CP_UTF8);
   return status;
}

int FindValueStart(const string json, const string key)
{
   string marker = "\"" + key + "\"";
   int p = StringFind(json, marker);
   if(p < 0) return -1;
   p = StringFind(json, ":", p + StringLen(marker));
   if(p < 0) return -1;
   p++;
   while(p < StringLen(json))
   {
      ushort c = StringGetCharacter(json,p);
      if(c!=' ' && c!='\t' && c!='\r' && c!='\n') break;
      p++;
   }
   return p;
}

string JsonString(const string json, const string key)
{
   int p = FindValueStart(json, key);
   if(p < 0 || p >= StringLen(json) || StringGetCharacter(json,p)!='"') return "";
   p++;
   int e = p;
   while(e < StringLen(json))
   {
      if(StringGetCharacter(json,e)=='"' && (e==p || StringGetCharacter(json,e-1)!='\\')) break;
      e++;
   }
   if(e >= StringLen(json)) return "";
   return StringSubstr(json,p,e-p);
}

double JsonNumber(const string json, const string key, bool &found)
{
   found = false;
   int p = FindValueStart(json, key);
   if(p < 0) return 0.0;
   int e = p;
   while(e < StringLen(json))
   {
      ushort c = StringGetCharacter(json,e);
      if((c>='0' && c<='9') || c=='-' || c=='+' || c=='.' || c=='e' || c=='E') e++;
      else break;
   }
   if(e == p) return 0.0;
   found = true;
   return StringToDouble(StringSubstr(json,p,e-p));
}

bool ParseAndValidate(const string json)
{
   // Fail closed unless the API explicitly identifies itself as analysis-only.
   if(StringFind(json, "\"executionEnabled\": false") < 0 &&
      StringFind(json, "\"executionEnabled\":false") < 0)
      return false;
   if(StringFind(json, "\"paper_only\": true") < 0 &&
      StringFind(json, "\"paper_only\":true") < 0)
      return false;

   string direction = JsonString(json, "direction");
   if(direction != "BUY" && direction != "SELL" && direction != "HOLD") return false;
   string symbol = JsonString(json, "symbol");
   if(symbol != _Symbol) { g_reason = "API symbol mismatch"; return false; }

   bool hasEntry=false, hasSL=false, hasTP1=false, hasTP2=false, hasScore=false;
   double entry = JsonNumber(json,"entry",hasEntry);
   double sl = JsonNumber(json,"stopLoss",hasSL);
   double tp1 = JsonNumber(json,"takeProfit1",hasTP1);
   double tp2 = JsonNumber(json,"takeProfit2",hasTP2);
   double score = JsonNumber(json,"score",hasScore);

   if(direction != "HOLD")
   {
      if(!hasEntry || !hasSL || !hasTP1 || !hasTP2 || !hasScore) return false;
      if(entry<=0 || sl<=0 || tp1<=0 || tp2<=0 || !MathIsValidNumber(score) || score<0.0 || score>1.5) return false;
      if(direction=="BUY" && !(sl<entry && tp1>entry && tp2>=tp1)) return false;
      if(direction=="SELL" && !(sl>entry && tp1<entry && tp2<=tp1)) return false;
   }

   g_direction = direction;
   g_entry = entry; g_sl = sl; g_tp1 = tp1; g_tp2 = tp2; g_score = score;
   g_reason = JsonString(json,"reason");
   g_source = JsonString(json,"source");
   if(g_direction == "HOLD") g_status = "PAPER / HOLD";
   else g_status = "PAPER CANDIDATE - NOT EXECUTED";
   return true;
}

void UpdatePanel()
{
   if(!InpShowPanel) return;
   string lastOk = (g_lastSuccess>0 ? TimeToString(g_lastSuccess,TIME_DATE|TIME_SECONDS) : "-");
   string lastReq = (g_lastRequest>0 ? TimeToString(g_lastRequest,TIME_DATE|TIME_SECONDS) : "-");
   Comment(StringFormat(
      "VOOM SYSTEM EA v1.00 | SOURCE 1\n"
      "MODE: PAPER ONLY - NO ORDERS\n"
      "Symbol/TF: %s / %s | Magic(ref): %I64u\n"
      "Status: %s | HTTP: %d\n"
      "Signal: %s | Score: %.2f\n"
      "Entry: %.*f\nSL: %.*f\nTP1: %.*f\nTP2: %.*f\n"
      "Reason: %s\nLast request: %s\nLast success: %s",
      _Symbol, EnumToString(InpSignalTimeframe), InpMagic, g_status, g_lastHttp,
      g_direction, g_score, _Digits, g_entry, _Digits, g_sl, _Digits, g_tp1, _Digits, g_tp2,
      StringSubstr(g_reason,0,140), lastReq, lastOk));
}
//+------------------------------------------------------------------+
