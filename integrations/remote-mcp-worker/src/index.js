const ALLOWED_PROTOCOLS = new Set(["2025-03-26", "2024-11-05"]);
const UI_ORIGIN = "https://voom-system-nova-ui.suwapat787.workers.dev";
function isAllowedOrigin(origin) {
  return origin === UI_ORIGIN || origin === "https://app.base44.com" || Boolean(origin && /^https:\/\/[a-z0-9-]+\.base44\.app$/i.test(origin));
}
function json(data,status=200,headers={}) { return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store",...headers}}); }
function cors(origin) {
  const ok = isAllowedOrigin(origin);
  return ok ? {"access-control-allow-origin":origin,"vary":"Origin","access-control-allow-methods":"POST, GET, OPTIONS","access-control-allow-headers":"Authorization, Content-Type, Accept, apikey"} : {};
}
async function getUser(request,env) {
  const auth=request.headers.get("Authorization")||"";
  if(!/^Bearer\s+\S+$/i.test(auth)) return null;
  const r=await fetch(env.SUPABASE_URL+"/auth/v1/user",{headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,Authorization:auth}});
  if(!r.ok) return null; try{return await r.json()}catch{return null}
}
function rpc(id,result,error){return error?{jsonrpc:"2.0",id,error}:{jsonrpc:"2.0",id,result}}
function ema(values,period){const k=2/(period+1);let v=values[0];const out=[v];for(let i=1;i<values.length;i++){v=values[i]*k+v*(1-k);out.push(v)}return out}
export function classifyStructureEvent(previousBias,direction) {
  if (direction !== "bullish" && direction !== "bearish") throw new Error("direction must be bullish or bearish");
  return previousBias && previousBias !== direction ? "CHoCH" : "BOS";
}
function analyzeSmcCandles(candles,left=2,right=2,includeFullHistory=false) {
  if(!Array.isArray(candles)||candles.length<10) throw new Error("SMC requires at least 10 candles");
  if(!Number.isInteger(left)||left<1||left>5||!Number.isInteger(right)||right<1||right>5) throw new Error("swing_left/right must be integers from 1 to 5");
  for(const [i,c] of candles.entries()) {
    if(!["open","high","low","close"].every(k=>Number.isFinite(Number(c[k])))) throw new Error("Invalid OHLC at candle "+i);
    const o=Number(c.open),h=Number(c.high),l=Number(c.low),cl=Number(c.close);
    if(h<l||o<l||o>h||cl<l||cl>h) throw new Error("Invalid OHLC bounds at candle "+i);
  }
  const pivots=[];
  for(let i=left;i<candles.length-right;i++){
    const w=candles.slice(i-left,i+right+1), hi=Number(candles[i].high), lo=Number(candles[i].low);
    if(w.filter(x=>Number(x.high)===hi).length===1&&w.every(x=>Number(x.high)<=hi)) pivots.push({index:i,confirmed_at:i+right,kind:"high",price:hi});
    if(w.filter(x=>Number(x.low)===lo).length===1&&w.every(x=>Number(x.low)>=lo)) pivots.push({index:i,confirmed_at:i+right,kind:"low",price:lo});
  }
  pivots.sort((a,b)=>a.index-b.index||a.kind.localeCompare(b.kind));
  const events=[], broken=new Set();
  let lastHigh=null,lastLow=null,structureBias=null;
  for(let i=0;i<candles.length;i++){
    for(const p of pivots.filter(p=>p.confirmed_at===i)){if(p.kind==="high")lastHigh=p;else lastLow=p;}
    const close=Number(candles[i].close);
    if(lastHigh&&i>lastHigh.confirmed_at&&close>lastHigh.price&&!broken.has("high:"+lastHigh.index)){
      events.push({index:i,type:classifyStructureEvent(structureBias,"bullish"),direction:"bullish",level:lastHigh.price,broken_pivot_index:lastHigh.index});structureBias="bullish";broken.add("high:"+lastHigh.index);
    }
    if(lastLow&&i>lastLow.confirmed_at&&close<lastLow.price&&!broken.has("low:"+lastLow.index)){
      events.push({index:i,type:classifyStructureEvent(structureBias,"bearish"),direction:"bearish",level:lastLow.price,broken_pivot_index:lastLow.index});structureBias="bearish";broken.add("low:"+lastLow.index);
    }
  }
  const fvgs=[];
  for(let i=2;i<candles.length;i++){
    const a=candles[i-2],c=candles[i];
    if(Number(c.low)>Number(a.high))fvgs.push({index:i,direction:"bullish",low:Number(a.high),high:Number(c.low)});
    if(Number(c.high)<Number(a.low))fvgs.push({index:i,direction:"bearish",low:Number(c.high),high:Number(a.low)});
  }
  return {ok:true,strategy:"SMC",version:"research-1.0",bars:candles.length,swing_points:includeFullHistory?pivots:pivots.slice(-30),structure_events:includeFullHistory?events:events.slice(-30),fair_value_gaps:includeFullHistory?fvgs:fvgs.slice(-30),signal:null,orders_submitted:false,live_trading_enabled:false,limitations:["Heuristic SMC labels; not independently validated","Research-only output; no order execution","Historical OHLC bars do not model intrabar path"]};
}

export function runSmcBacktest(candles, options={}) {
  const left=Number(options.swingLeft??2), right=Number(options.swingRight??2);
  const rewardRisk=Number(options.rewardRisk??2), feeRate=Number(options.feeRate??0.001);
  const slippageRate=Number(options.slippageRate??0.0005), initialEquity=Number(options.initialEquity??10000);
  if(!Number.isFinite(rewardRisk)||rewardRisk<0.5||rewardRisk>5) throw new Error("reward_risk must be between 0.5 and 5");
  if(!Number.isFinite(feeRate)||feeRate<0||feeRate>=0.05||!Number.isFinite(slippageRate)||slippageRate<0||slippageRate>=0.05) throw new Error("fee_rate and slippage_rate must be in [0, 0.05)");
  if(!Number.isFinite(initialEquity)||initialEquity<=0) throw new Error("initial_equity must be positive and finite");
  const analysis=analyzeSmcCandles(candles,left,right,true), pivots=analysis.swing_points, events=analysis.structure_events;
  const trades=[]; let busyUntil=-1, equity=initialEquity, peak=initialEquity, maxDrawdown=0;
  for(const event of events) {
    const i=event.index, entryIndex=i+1;
    if(entryIndex>=candles.length||entryIndex<=busyUntil) continue;
    const bullish=event.direction==="bullish", kind=bullish?"low":"high";
    let relevant=null;
    for(const pivot of pivots) if(pivot.index<i&&pivot.confirmed_at<i&&pivot.kind===kind) relevant=pivot;
    if(!relevant) continue;
    const stop=relevant.price, entry=Number(candles[entryIndex].open), risk=bullish?entry-stop:stop-entry;
    if(!Number.isFinite(risk)||risk<=0) continue;
    const target=bullish?entry+risk*rewardRisk:entry-risk*rewardRisk;
    let exitIndex=candles.length-1, exitPrice=Number(candles[candles.length-1].close), exitReason="end_of_data";
    for(let j=entryIndex;j<candles.length;j++) {
      const stopHit=bullish?Number(candles[j].low)<=stop:Number(candles[j].high)>=stop;
      const targetHit=bullish?Number(candles[j].high)>=target:Number(candles[j].low)<=target;
      if(stopHit){exitIndex=j;exitPrice=stop;exitReason="stop_loss";break}
      if(targetHit){exitIndex=j;exitPrice=target;exitReason="take_profit";break}
    }
    const gross=bullish?exitPrice-entry:entry-exitPrice;
    const costs=(Math.abs(entry)+Math.abs(exitPrice))*(feeRate+slippageRate), net=gross-costs, rMultiple=net/risk;
    equity+=net; peak=Math.max(peak,equity); if(peak>0)maxDrawdown=Math.max(maxDrawdown,(peak-equity)/peak);
    trades.push({direction:bullish?"long":"short",structure_event:event.type,signal_index:i,entry_index:entryIndex,entry_price:entry,stop_swing_index:relevant.index,stop_price:stop,target_price:target,exit_index:exitIndex,exit_price:exitPrice,exit_reason:exitReason,gross_pnl_per_unit:gross,estimated_cost_per_unit:costs,net_pnl_per_unit:net,r_multiple:rMultiple});
    busyUntil=exitIndex;
  }
  const wins=trades.filter(t=>t.net_pnl_per_unit>0).length;
  return {ok:true,strategy:"SMC_structure_break_baseline",mode:"research_backtest_only",bars_analyzed:candles.length,trade_count:trades.length,win_rate_pct:trades.length?wins/trades.length*100:0,total_net_pnl_per_unit:trades.reduce((sum,t)=>sum+t.net_pnl_per_unit,0),mean_r_multiple:trades.length?trades.reduce((sum,t)=>sum+t.r_multiple,0)/trades.length:0,max_drawdown_pct:maxDrawdown*100,initial_equity_reference:initialEquity,cost_assumptions:{fee_rate_per_side:feeRate,slippage_rate_per_side:slippageRate},fill_assumptions:["signal only after structure-break candle closes","entry at next candle open","if stop and target both touched, stop is assumed first"],trades,orders_submitted:false,live_trading_enabled:false,warning:"Research baseline only; per-unit PnL is not portfolio sizing. Validate spread, contract sizing, funding/swap, and out-of-sample performance."};
}


const DEFAULT_MT5_PROXY_URL = "https://voom-mt5-readonly-proxy.suwapat787.workers.dev";
const MT5_TIMEFRAMES = new Set(["M1", "M5", "M15", "M30", "H1", "H4", "D1"]);

export function normalizeMt5Symbol(value) {
  const symbol = String(value ?? "").trim();
  if (!/^[A-Za-z0-9._-]{1,40}$/.test(symbol)) throw new Error("symbol must contain 1-40 letters, numbers, dots, underscores or hyphens");
  return symbol;
}
export function normalizeMt5Timeframe(value) {
  const timeframe = String(value ?? "M5").toUpperCase();
  if (!MT5_TIMEFRAMES.has(timeframe)) throw new Error("Unsupported MT5 timeframe");
  return timeframe;
}
export function normalizeMt5Count(value, fallback = 100, maximum = 500) {
  const count = value === undefined || value === null ? fallback : Number(value);
  if (!Number.isInteger(count) || count < 1 || count > maximum) throw new Error("count is outside the allowed range");
  return count;
}

async function loadOwnMt5Connection(request, env, user) {
  const authorization = request.headers.get("Authorization") || "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) throw new Error("A signed-in Supabase session is required");
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) throw new Error("Supabase runtime is not configured");
  const url = new URL(env.SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/broker_connections");
  url.searchParams.set("select", "id,provider,environment,status,account_label,last_verified_at,created_at");
  url.searchParams.set("provider", "eq.exness_mt5");
  url.searchParams.set("environment", "eq.demo");
  url.searchParams.set("user_id", "eq." + user.id);
  url.searchParams.set("order", "created_at.desc");
  url.searchParams.set("limit", "1");
  const response = await fetch(url, {
    method: "GET",
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: authorization, Accept: "application/json" },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(6000)
  });
  if (!response.ok) throw new Error("Could not read this user's Exness MT5 Demo connection; check Supabase RLS and grants");
  const rows = await response.json();
  return Array.isArray(rows) ? (rows[0] || null) : null;
}

async function requestMt5DemoConnection(request, env, user) {
  const existing = await loadOwnMt5Connection(request, env, user);
  if (existing) {
    return {
      broker: "Exness MT5",
      environment: "demo",
      status: existing.status === "connected" ? "connected" : existing.status === "pending" ? "pending_provisioning" : "connection_disabled",
      connectionRequestId: existing.id,
      message: existing.status === "pending"
        ? "A request already exists. A dedicated read-only Bridge and tenant route must be provisioned before the account can connect."
        : existing.status === "connected"
          ? "A connection record already exists; verify it with mt5_connection_status."
          : "This connection is disabled. Ask the administrator to review it.",
      executionEnabled: false,
      liveTradingEnabled: false,
      ordersEnabled: false
    };
  }

  const url = new URL(env.SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/broker_connections");
  url.searchParams.set("select", "id,provider,environment,status,account_label,last_verified_at,created_at");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      Authorization: request.headers.get("Authorization") || "",
      Accept: "application/json",
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    body: JSON.stringify({ provider: "exness_mt5", environment: "demo", status: "pending", account_label: "Exness MT5 Demo" }),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(6000)
  });
  if (!response.ok) {
    if (response.status === 409 || response.status === 23505) {
      const raced = await loadOwnMt5Connection(request, env, user);
      if (raced) return {
        broker: "Exness MT5",
        environment: "demo",
        status: raced.status === "pending" ? "pending_provisioning" : raced.status === "connected" ? "connected" : "connection_disabled",
        connectionRequestId: raced.id,
        executionEnabled: false,
        liveTradingEnabled: false,
        ordersEnabled: false
      };
    }
    throw new Error("Could not create the Exness MT5 Demo connection request; verify the installed migration and INSERT policy");
  }
  const rows = await response.json();
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row?.id) throw new Error("Supabase did not return the Exness MT5 Demo request record");
  return {
    broker: "Exness MT5",
    environment: "demo",
    status: "pending_provisioning",
    connectionRequestId: row.id,
    message: "Request created. A trusted administrator must provision the dedicated Bridge route and secret before account data can be read.",
    executionEnabled: false,
    liveTradingEnabled: false,
    ordersEnabled: false
  };
}

async function runMt5ReadonlyTool(name, args, request, env, user) {
  const connection = await loadOwnMt5Connection(request, env, user);
  const safe = {
    broker: "Exness MT5",
    environment: "demo",
    mode: "read-only",
    executionEnabled: false,
    liveTradingEnabled: false,
    ordersEnabled: false
  };
  if (!connection) return {
    ...safe,
    status: "not_requested",
    message: "No Exness MT5 Demo connection request exists. Call request_mt5_demo_connection to create a pending request."
  };
  if (connection.status === "pending") return {
    ...safe,
    status: "pending_provisioning",
    connectionRequestId: connection.id,
    message: "The request exists, but the dedicated Bridge route has not been provisioned."
  };
  if (connection.status === "disabled") return {
    ...safe,
    status: "connection_disabled",
    connectionRequestId: connection.id
  };
  if (connection.status !== "connected") return {
    ...safe,
    status: "connection_not_ready",
    connectionRequestId: connection.id
  };

  const paths = {
    mt5_connection_status: "/health",
    mt5_account_summary: "/api/account",
    mt5_symbols: "/api/symbols",
    mt5_quotes: "/api/quotes"
  };
  const base = String(env.MT5_READONLY_PROXY_URL || DEFAULT_MT5_PROXY_URL).replace(/\/+$/, "");
  let url;
  try {
    url = new URL(paths[name], base);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("Invalid proxy URL");
  } catch {
    return { ...safe, status: "proxy_not_configured", connectionRequestId: connection.id };
  }
  url.searchParams.set("connection_id", connection.id);
  if (name === "mt5_symbols") {
    const q = String(args.q ?? "").trim();
    if (q.length > 40 || (q && !/^[A-Za-z0-9._-]+$/.test(q))) throw new Error("q must contain at most 40 letters, numbers, dots, underscores or hyphens");
    const limit = normalizeMt5Count(args.limit, 100, 500);
    url.searchParams.set("q", q);
    url.searchParams.set("limit", String(limit));
  }
  if (name === "mt5_quotes") {
    url.searchParams.set("symbol", normalizeMt5Symbol(args.symbol));
    url.searchParams.set("timeframe", normalizeMt5Timeframe(args.timeframe));
    url.searchParams.set("count", String(normalizeMt5Count(args.count, 100, 500)));
  }

  let response;
  let data;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Authorization: request.headers.get("Authorization") || "", Accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(9000)
    });
    data = await response.json().catch(() => ({}));
  } catch {
    return { ...safe, status: "proxy_unavailable", connectionRequestId: connection.id, message: "Could not reach the read-only MT5 proxy." };
  }
  if (!response.ok) {
    const status = response.status === 401 ? "session_rejected"
      : response.status === 403 ? "tenant_guard_rejected"
        : response.status === 404 ? "connection_not_found"
          : response.status === 409 ? "bridge_not_provisioned"
            : response.status === 503 ? "bridge_or_proxy_unavailable" : "proxy_request_failed";
    return { ...safe, status, httpStatus: response.status, connectionRequestId: connection.id, error: data.error || "MT5 proxy refused or could not complete the read-only request" };
  }
  if (name === "mt5_connection_status") {
    const connected = data.status === "ok" && data.terminal_connected === true &&
      data.account_session_available === true && data.mode === "read-only" &&
      data.order_submission_enabled === false;
    return {
      ...safe,
      status: connected ? "connected" : "bridge_unavailable",
      connectionRequestId: connection.id,
      accountLabel: connection.account_label,
      checkedAt: data.checked_at || null,
      terminalConnected: data.terminal_connected === true,
      accountSessionAvailable: data.account_session_available === true,
      message: connected ? "Exness MT5 Demo is responding through the dedicated read-only Bridge." : "The Bridge did not confirm a ready MT5 account session."
    };
  }
  return {
    ...safe,
    status: "ok",
    connectionRequestId: connection.id,
    accountLabel: connection.account_label,
    data
  };
}

async function callTool(name,args,request,env,user) {
  if (name === "request_mt5_demo_connection") return await requestMt5DemoConnection(request, env, user);
  if (["mt5_connection_status", "mt5_account_summary", "mt5_symbols", "mt5_quotes"].includes(name)) {
    return await runMt5ReadonlyTool(name, args, request, env, user);
  }
  if(name==="system_status") return {service:"voom-system-mcp",status:"online",authenticated:true,mode:"authenticated-read-only",liveTradingEnabled:false,executionEnabled:false,userId:user.id};
  if(name==="list_workers") return {workers:["data-ingestion","feature","gen-ai","backtest","tuning","risk","portfolio","execution"].map(worker=>({worker,status:worker==="execution"?"disabled": "prototype_or_local_module",liveExecutionEnabled:false})),note:"Python worker modules are not individually deployed as Cloudflare Workers."};
  if(name==="list_strategy_registry") {
    const r=await fetch(env.SUPABASE_URL+"/rest/v1/ai_strategies?select=strategy_key,display_name,version,lifecycle_status,trading_mode,backtest_passed,out_of_sample_passed,demo_passed,risk_review_passed&order=created_at.desc&limit=100",{headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,Authorization:request.headers.get("Authorization"),Accept:"application/json"}});
    if(!r.ok) throw new Error("Supabase read denied; verify table and RLS permissions");
    const strategies=await r.json(); return {count:strategies.length,strategies};
  }
  if(name==="analyze_smc_strategy" || name==="run_smc_backtest") {
    const symbol=String(args.symbol||"BTCUSDT").toUpperCase();
    if(!/^[A-Z0-9]{5,20}$/.test(symbol)) throw new Error("Invalid symbol");
    const interval=String(args.interval||"1h");
    if(!["1m","5m","15m","30m","1h","4h","1d"].includes(interval)) throw new Error("Unsupported interval");
    const limit=Math.max(20,Math.min(500,Number(args.limit)||100));
    const res=await fetch("https://api.binance.com/api/v3/klines?symbol="+encodeURIComponent(symbol)+"&interval="+interval+"&limit="+limit);
    if(!res.ok) throw new Error("Public market data provider unavailable ("+res.status+")");
    const raw=await res.json(), candles=raw.map(k=>({time:k[0],open:Number(k[1]),high:Number(k[2]),low:Number(k[3]),close:Number(k[4]),volume:Number(k[5])}));
    if(name==="analyze_smc_strategy") return {...analyzeSmcCandles(candles,Number(args.swing_left)||2,Number(args.swing_right)||2),source:"Binance public market data",symbol,interval};
    return {...runSmcBacktest(candles,{swingLeft:Number(args.swing_left)||2,swingRight:Number(args.swing_right)||2,rewardRisk:Number(args.reward_risk??2),feeRate:Number(args.fee_rate??0.001),slippageRate:Number(args.slippage_rate??0.0005),initialEquity:Number(args.initial_equity??10000)}),source:"Binance public market data",symbol,interval};
  }
  if(name==="read_market_candles" || name==="run_ema_backtest") {
    const symbol=String(args.symbol||"BTCUSDT").toUpperCase();
    if(!/^[A-Z0-9]{5,20}$/.test(symbol)) throw new Error("Invalid symbol");
    const interval=String(args.interval||"1h");
    if(!["1m","5m","15m","30m","1h","4h","1d"].includes(interval)) throw new Error("Unsupported interval");
    const limit=Math.max(20,Math.min(500,Number(args.limit)||100));
    const res=await fetch("https://api.binance.com/api/v3/klines?symbol="+encodeURIComponent(symbol)+"&interval="+interval+"&limit="+limit);
    if(!res.ok) throw new Error("Public market data provider unavailable ("+res.status+")");
    const raw=await res.json(); const candles=raw.map(k=>({time:k[0],open:Number(k[1]),high:Number(k[2]),low:Number(k[3]),close:Number(k[4]),volume:Number(k[5])}));
    if(name==="read_market_candles") return {source:"Binance public market data",symbol,interval,count:candles.length,candles,executionEnabled:false};
    const fast=Math.max(2,Math.min(50,Number(args.fast_period)||12)), slow=Math.max(fast+1,Math.min(100,Number(args.slow_period)||26));
    if(candles.length<slow+2) throw new Error("Not enough candles for selected EMA periods");
    const closes=candles.map(c=>c.close), f=ema(closes,fast), s=ema(closes,slow);
    let position=0, entry=0, trades=0, wins=0, equity=1, peak=1, maxDrawdown=0;
    for(let i=1;i<closes.length;i++){
      if(position===0 && f[i-1]<=s[i-1] && f[i]>s[i]) {position=1;entry=closes[i];trades++}
      else if(position===1 && f[i-1]>=s[i-1] && f[i]<s[i]) {const ret=closes[i]/entry-1;if(ret>0)wins++;equity*=1+ret;position=0}
      peak=Math.max(peak,equity);maxDrawdown=Math.max(maxDrawdown,(peak-equity)/peak);
    }
    if(position===1){const ret=closes[closes.length-1]/entry-1;if(ret>0)wins++;equity*=1+ret}
    return {mode:"historical-research-only",symbol,interval,candles:candles.length,fastPeriod:fast,slowPeriod:slow,closedAndOpenTrades:trades,winRate:trades?wins/trades:0,approxReturnPct:(equity-1)*100,maxDrawdownPct:maxDrawdown*100,method:"long-only EMA cross on candle closes; excludes fees, spread, slippage and funding",executionEnabled:false};
  }
  if(name==="validate_paper_risk") {
    const allocation=Number(args.allocation_pct), dailyLoss=Number(args.daily_loss_pct), drawdown=Number(args.drawdown_pct), leverage=Number(args.leverage??1), age=Number(args.data_age_seconds??0);
    const reasons=[];
    if(!Number.isFinite(allocation)||allocation<0||allocation>0.25) reasons.push("allocation_pct must be between 0 and 0.25");
    if(!Number.isFinite(dailyLoss)||dailyLoss<0||dailyLoss>2) reasons.push("daily_loss_pct exceeds paper guardrail (0–2)");
    if(!Number.isFinite(drawdown)||drawdown<0||drawdown>5) reasons.push("drawdown_pct exceeds paper guardrail (0–5)");
    if(!Number.isFinite(leverage)||leverage<1||leverage>1) reasons.push("leverage must equal 1 in this paper policy");
    if(!Number.isFinite(age)||age<0||age>120) reasons.push("market data is stale or invalid (max 120 seconds)");
    return {approved:reasons.length===0,mode:"paper-only",reasons,limits:{maxAllocationPct:0.25,maxDailyLossPct:2,maxDrawdownPct:5,maxLeverage:1,maxDataAgeSeconds:120},liveTradingEnabled:false};
  }
  throw new Error("Unknown or unavailable tool");
}
export const tools=[
 {name:"system_status",description:"Read authenticated service status; never sends orders.",inputSchema:{type:"object",properties:{},additionalProperties:false}},
 {name:"list_workers",description:"List NOVA modules and clearly label local prototypes; execution remains disabled.",inputSchema:{type:"object",properties:{},additionalProperties:false}},
 {name:"list_strategy_registry",description:"Read strategy registry rows visible to this signed-in user under Supabase RLS.",inputSchema:{type:"object",properties:{},additionalProperties:false}},
 {name:"read_market_candles",description:"Read public Binance OHLCV candles. Research only.",inputSchema:{type:"object",properties:{symbol:{type:"string"},interval:{type:"string"},limit:{type:"integer"}},additionalProperties:false}},
 {name:"analyze_smc_strategy",description:"Analyze confirmed swing structure, BOS/CHoCH and fair value gaps on public Binance candles. Research only; never sends orders.",inputSchema:{type:"object",properties:{symbol:{type:"string"},interval:{type:"string"},limit:{type:"integer"},swing_left:{type:"integer"},swing_right:{type:"integer"}},additionalProperties:false}},
 {name:"run_smc_backtest",description:"Run a conservative SMC structure-break historical backtest with next-bar entry, confirmed swing stops, fixed reward/risk and configurable costs. Research only; never sends orders.",inputSchema:{type:"object",properties:{symbol:{type:"string"},interval:{type:"string"},limit:{type:"integer"},swing_left:{type:"integer"},swing_right:{type:"integer"},reward_risk:{type:"number"},fee_rate:{type:"number"},slippage_rate:{type:"number"},initial_equity:{type:"number"}},additionalProperties:false}},
 {name:"run_ema_backtest",description:"Run a simplified long-only EMA crossover research backtest on public candle data. Not investment advice; no orders.",inputSchema:{type:"object",properties:{symbol:{type:"string"},interval:{type:"string"},limit:{type:"integer"},fast_period:{type:"integer"},slow_period:{type:"integer"}},additionalProperties:false}},
 {name:"validate_paper_risk",description:"Fail-closed paper risk checks. Cannot authorize live trading.",inputSchema:{type:"object",properties:{allocation_pct:{type:"number"},daily_loss_pct:{type:"number"},drawdown_pct:{type:"number"},leverage:{type:"number"},data_age_seconds:{type:"number"}},required:["allocation_pct","daily_loss_pct","drawdown_pct"],additionalProperties:false}},
 {name:"mt5_connection_status",description:"Check the signed-in user's own Exness MT5 Demo connection and verify that the dedicated Windows Bridge is healthy. Read-only; no orders.",inputSchema:{type:"object",properties:{},additionalProperties:false}},
 {name:"request_mt5_demo_connection",description:"Create a pending Exness MT5 Demo connection request for the signed-in user only. A trusted administrator must provision the tenant-isolated Bridge route. Does not connect or place orders by itself.",inputSchema:{type:"object",properties:{},additionalProperties:false}},
 {name:"mt5_account_summary",description:"Read account summary from the signed-in user's own connected Exness MT5 Demo terminal through the tenant-guarded proxy. Read-only; no orders.",inputSchema:{type:"object",properties:{},additionalProperties:false}},
 {name:"mt5_symbols",description:"Read symbol discovery results from the signed-in user's connected Exness MT5 Demo terminal. Optional q substring and limit 1-500. Read-only.",inputSchema:{type:"object",properties:{q:{type:"string"},limit:{type:"integer",minimum:1,maximum:500}},additionalProperties:false}},
 {name:"mt5_quotes",description:"Read quote and OHLC candle data from the signed-in user's connected Exness MT5 Demo terminal. Supported timeframes M1, M5, M15, M30, H1, H4, D1; count 1-500. Read-only.",inputSchema:{type:"object",properties:{symbol:{type:"string"},timeframe:{type:"string"},count:{type:"integer",minimum:1,maximum:500}},required:["symbol"],additionalProperties:false}}

];

const MODERN_PROTOCOL_VERSION = "2026-07-28";
const PROTOCOL_META_KEY = "io.modelcontextprotocol/protocolVersion";
const CLIENT_INFO_META_KEY = "io.modelcontextprotocol/clientInfo";
const CLIENT_CAPABILITIES_META_KEY = "io.modelcontextprotocol/clientCapabilities";
const SERVER_INFO_META_KEY = "io.modelcontextprotocol/serverInfo";
const SERVER_INFO = { name: "voom-system-mcp", version: "0.3.0" };
const SUPPORTED_PROTOCOL_VERSIONS = [MODERN_PROTOCOL_VERSION, ...ALLOWED_PROTOCOLS];

function protocolError(id, code, message, data, status, origin) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  return json(rpc(id ?? null, null, error), status, cors(origin));
}

function decodeProtocolHeaderValue(value) {
  const prefix = "=?base64?";
  const suffix = "?=";
  const hasPrefix = value.startsWith(prefix);
  const hasSuffix = value.endsWith(suffix);
  if (hasPrefix || hasSuffix) {
    if (!hasPrefix || !hasSuffix || value.length <= prefix.length + suffix.length) return { ok: false };
    const encoded = value.slice(prefix.length, -suffix.length);
    try {
      if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) return { ok: false };
      const binary = atob(encoded);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      return { ok: true, value: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
    } catch {
      return { ok: false };
    }
  }
  if (value !== value.trim() || /[^\x09\x20-\x7E]/.test(value)) return { ok: false };
  return { ok: true, value };
}

function validateModernTransportHeaders(request, body, origin) {
  const id = body?.id ?? null;
  const versionHeader = request.headers.get("MCP-Protocol-Version");
  const methodHeader = request.headers.get("Mcp-Method");
  const metadata = body?.params?._meta;
  const metadataVersion = metadata?.[PROTOCOL_META_KEY];

  if (!versionHeader || versionHeader !== MODERN_PROTOCOL_VERSION || metadataVersion !== MODERN_PROTOCOL_VERSION) {
    return protocolError(id, -32020, "Header mismatch: MCP-Protocol-Version must match request metadata", undefined, 400, origin);
  }
  if (versionHeader !== metadataVersion) {
    return protocolError(id, -32020, "Header mismatch: protocol version differs from request metadata", undefined, 400, origin);
  }
  if (!methodHeader || methodHeader !== body?.method) {
    return protocolError(id, -32020, "Header mismatch: Mcp-Method must match the JSON-RPC method", undefined, 400, origin);
  }

  const nameHeader = request.headers.get("Mcp-Name");
  const requiresName = ["tools/call", "resources/read", "prompts/get"].includes(body?.method);
  const sourceName = body?.params?.name ?? body?.params?.uri;
  if (requiresName) {
    if (typeof sourceName !== "string" || !nameHeader) {
      return protocolError(id, -32020, "Header mismatch: Mcp-Name is required for this method", undefined, 400, origin);
    }
    const decoded = decodeProtocolHeaderValue(nameHeader);
    if (!decoded.ok || decoded.value !== sourceName) {
      return protocolError(id, -32020, "Header mismatch: Mcp-Name does not match the request body", undefined, 400, origin);
    }
  } else if (nameHeader !== null) {
    return protocolError(id, -32020, "Header mismatch: Mcp-Name is not valid for this method", undefined, 400, origin);
  }

  if (!Object.prototype.hasOwnProperty.call(body || {}, "id") || body.id === null) {
    return protocolError(null, -32600, "Invalid Request: Streamable HTTP requests must have an id", undefined, 400, origin);
  }
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return protocolError(id, -32602, "Invalid params: modern protocol metadata is required", undefined, 400, origin);
  }
  const clientInfo = metadata[CLIENT_INFO_META_KEY];
  const clientCapabilities = metadata[CLIENT_CAPABILITIES_META_KEY];
  if (
    !clientInfo || typeof clientInfo !== "object" || Array.isArray(clientInfo) ||
    typeof clientInfo.name !== "string" || !clientInfo.name.trim() ||
    typeof clientInfo.version !== "string" || !clientInfo.version.trim() ||
    !clientCapabilities || typeof clientCapabilities !== "object" || Array.isArray(clientCapabilities)
  ) {
    return protocolError(id, -32602, "Invalid params: clientInfo and clientCapabilities metadata are required", undefined, 400, origin);
  }
  return null;
}

function modernResult(result) {
  return {
    resultType: "complete",
    ...result,
    _meta: {
      ...(result?._meta || {}),
      [SERVER_INFO_META_KEY]: SERVER_INFO
    }
  };
}

function modernSuccess(id, result, origin) {
  return json(rpc(id, modernResult(result)), 200, cors(origin));
}

async function handleLegacyMcp(body, request, env, user, origin) {
  if (body.method.startsWith("notifications/")) return new Response(null, { status: 202, headers: cors(origin) });
  if (body.method === "initialize") {
    const requested = body.params?.protocolVersion;
    return json(rpc(body.id, {
      protocolVersion: ALLOWED_PROTOCOLS.has(requested) ? requested : "2025-03-26",
      capabilities: { tools: {} },
      serverInfo: SERVER_INFO
    }), 200, cors(origin));
  }
  if (body.method === "ping") return json(rpc(body.id, {}), 200, cors(origin));
  if (body.method === "tools/list") return json(rpc(body.id, { tools }), 200, cors(origin));
  if (body.method === "tools/call") {
    try {
      const result = await callTool(body.params?.name, body.params?.arguments || {}, request, env, user);
      return json(rpc(body.id, { content: [{ type: "text", text: JSON.stringify(result) }], isError: false }), 200, cors(origin));
    } catch (e) {
      return json(rpc(body.id, { content: [{ type: "text", text: e instanceof Error ? e.message : "Tool failed" }], isError: true }), 200, cors(origin));
    }
  }
  return json(rpc(body.id, null, { code: -32601, message: "Method not found" }), 200, cors(origin));
}

async function handleModernMcp(body, request, env, user, origin) {
  const id = body.id;
  if (body.method === "server/discover") {
    return modernSuccess(id, {
      supportedVersions: SUPPORTED_PROTOCOL_VERSIONS,
      capabilities: { tools: {} },
      instructions: "Authenticated, read-only NOVA research tools. Exness MT5 tools read the signed-in user's own Demo connection. No order submission or broker mutations are available.",
      ttlMs: 60000,
      cacheScope: "private"
    }, origin);
  }
  if (body.method === "ping") return modernSuccess(id, {}, origin);
  if (body.method === "tools/list") {
    return modernSuccess(id, { tools, ttlMs: 60000, cacheScope: "private" }, origin);
  }
  if (body.method === "tools/call") {
    try {
      const result = await callTool(body.params?.name, body.params?.arguments || {}, request, env, user);
      return modernSuccess(id, { content: [{ type: "text", text: JSON.stringify(result) }], isError: false }, origin);
    } catch (e) {
      return modernSuccess(id, { content: [{ type: "text", text: e instanceof Error ? e.message : "Tool failed" }], isError: true }, origin);
    }
  }
  return protocolError(id, -32601, "Method not found", undefined, 404, origin);
}

async function handleMcp(request, env, origin) {
  const user = await getUser(request, env);
  if (!user?.id) return json({ error: "unauthorized" }, 401, cors(origin));

  let body;
  try { body = await request.json(); }
  catch { return json(rpc(null, null, { code: -32700, message: "Parse error" }), 400, cors(origin)); }

  if (!body || body.jsonrpc !== "2.0" || typeof body.method !== "string" ||
      (body.params !== undefined && (!body.params || typeof body.params !== "object" || Array.isArray(body.params)))) {
    return json(rpc(body?.id ?? null, null, { code: -32600, message: "Invalid Request" }), 400, cors(origin));
  }

  const versionHeader = request.headers.get("MCP-Protocol-Version");
  const metadataVersion = body.params?._meta?.[PROTOCOL_META_KEY];
  const isModern = versionHeader === MODERN_PROTOCOL_VERSION || metadataVersion === MODERN_PROTOCOL_VERSION;

  if (versionHeader && metadataVersion && versionHeader !== metadataVersion) {
    return protocolError(body.id, -32020, "Header mismatch: MCP-Protocol-Version differs from request metadata", undefined, 400, origin);
  }
  if (isModern) {
    const validation = validateModernTransportHeaders(request, body, origin);
    if (validation) return validation;
    return handleModernMcp(body, request, env, user, origin);
  }

  const requestedVersion = versionHeader || metadataVersion;
  if (requestedVersion && !SUPPORTED_PROTOCOL_VERSIONS.includes(requestedVersion)) {
    return protocolError(body.id, -32022, "Unsupported protocol version", {
      supported: SUPPORTED_PROTOCOL_VERSIONS,
      requested: requestedVersion
    }, 400, origin);
  }
  return handleLegacyMcp(body, request, env, user, origin);
}

export default { async fetch(request, env) {
  const url = new URL(request.url), origin = request.headers.get("Origin") || "";
  if (request.method === "OPTIONS") {
    const h = cors(origin);
    return Object.keys(h).length ? new Response(null, { status: 204, headers: h }) : new Response(null, { status: 403 });
  }
  if (origin && !isAllowedOrigin(origin)) return json({ error: "origin_not_allowed" }, 403);
  if (url.pathname === "/health" && request.method === "GET") {
    return json({
      ok: true,
      service: "voom-system-mcp",
      mode: "authenticated-read-only",
      liveTradingEnabled: false,
      order_submission_enabled: false,
      ordersEnabled: false,
      toolCount: tools.length,
      protocolVersions: SUPPORTED_PROTOCOL_VERSIONS
    });
  }
  if (url.pathname === "/mcp" && request.method === "POST") return handleMcp(request, env, origin);
  if (url.pathname === "/api/status" && request.method === "GET") {
    const user = await getUser(request, env);
    if (!user?.id) return json({ error: "unauthorized" }, 401, cors(origin));
    return json({ service: "voom-system-mcp", authenticated: true, mode: "read-only", tradingExecution: false }, 200, cors(origin));
  }
  return json({ error: "not_found" }, 404);
}};
