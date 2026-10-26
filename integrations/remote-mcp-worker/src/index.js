const ALLOWED_PROTOCOLS = new Set(["2025-03-26", "2024-11-05"]);
const UI_ORIGIN = "https://voom-system-nova-ui.suwapat787.workers.dev";
function json(data,status=200,headers={}) { return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store",...headers}}); }
function cors(origin) {
  const ok = origin === UI_ORIGIN || origin === "https://app.base44.com" || (origin && /^https:\/\/[a-z0-9-]+\.base44\.app$/i.test(origin));
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
function analyzeSmcCandles(candles,left=2,right=2) {
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
  let lastHigh=null,lastLow=null,structureDirection=null;
  for(let i=0;i<candles.length;i++){
    for(const p of pivots.filter(p=>p.confirmed_at===i)){if(p.kind==="high")lastHigh=p;else lastLow=p;}
    const close=Number(candles[i].close);
    if(lastHigh&&i>lastHigh.confirmed_at&&close>lastHigh.price&&!broken.has("high:"+lastHigh.index)){
      events.push({index:i,type:structureDirection==="bearish"?"CHoCH":"BOS",direction:"bullish",level:lastHigh.price,broken_pivot_index:lastHigh.index});structureDirection="bullish";broken.add("high:"+lastHigh.index);
    }
    if(lastLow&&i>lastLow.confirmed_at&&close<lastLow.price&&!broken.has("low:"+lastLow.index)){
      events.push({index:i,type:structureDirection==="bullish"?"CHoCH":"BOS",direction:"bearish",level:lastLow.price,broken_pivot_index:lastLow.index});structureDirection="bearish";broken.add("low:"+lastLow.index);
    }
  }
  const fvgs=[];
  for(let i=2;i<candles.length;i++){
    const a=candles[i-2],c=candles[i];
    if(Number(c.low)>Number(a.high))fvgs.push({index:i,direction:"bullish",low:Number(a.high),high:Number(c.low)});
    if(Number(c.high)<Number(a.low))fvgs.push({index:i,direction:"bearish",low:Number(c.high),high:Number(a.low)});
  }
  return {ok:true,strategy:"SMC",version:"research-1.0",bars:candles.length,swing_points:pivots.slice(-30),structure_events:events.slice(-30),fair_value_gaps:fvgs.slice(-30),signal:null,orders_submitted:false,live_trading_enabled:false,limitations:["Heuristic SMC labels; not independently validated","Research-only output; no order execution","Historical OHLC bars do not model intrabar path"]};
}
async function callTool(name,args,request,env,user) {
  if(name==="system_status") return {service:"voom-system-mcp",status:"online",authenticated:true,mode:"authenticated-read-only",liveTradingEnabled:false,executionEnabled:false,userId:user.id};
  if(name==="list_workers") return {workers:["data-ingestion","feature","gen-ai","backtest","tuning","risk","portfolio","execution"].map(worker=>({worker,status:worker==="execution"?"disabled": "prototype_or_local_module",liveExecutionEnabled:false})),note:"Python worker modules are not individually deployed as Cloudflare Workers."};
  if(name==="list_strategy_registry") {
    const r=await fetch(env.SUPABASE_URL+"/rest/v1/ai_strategies?select=strategy_key,display_name,version,lifecycle_status,trading_mode,backtest_passed,out_of_sample_passed,demo_passed,risk_review_passed&order=created_at.desc&limit=100",{headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,Authorization:request.headers.get("Authorization"),Accept:"application/json"}});
    if(!r.ok) throw new Error("Supabase read denied; verify table and RLS permissions");
    const strategies=await r.json(); return {count:strategies.length,strategies};
  }
  if(name==="analyze_smc_strategy") {
    const symbol=String(args.symbol||"BTCUSDT").toUpperCase();
    if(!/^[A-Z0-9]{5,20}$/.test(symbol)) throw new Error("Invalid symbol");
    const interval=String(args.interval||"1h");
    if(!["1m","5m","15m","30m","1h","4h","1d"].includes(interval)) throw new Error("Unsupported interval");
    const limit=Math.max(20,Math.min(500,Number(args.limit)||100));
    const res=await fetch("https://api.binance.com/api/v3/klines?symbol="+encodeURIComponent(symbol)+"&interval="+interval+"&limit="+limit);
    if(!res.ok) throw new Error("Public market data provider unavailable ("+res.status+")");
    const raw=await res.json(), candles=raw.map(k=>({time:k[0],open:Number(k[1]),high:Number(k[2]),low:Number(k[3]),close:Number(k[4]),volume:Number(k[5])}));
    return {...analyzeSmcCandles(candles,Number(args.swing_left)||2,Number(args.swing_right)||2),source:"Binance public market data",symbol,interval};
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
const tools=[
 {name:"system_status",description:"Read authenticated service status; never sends orders.",inputSchema:{type:"object",properties:{},additionalProperties:false}},
 {name:"list_workers",description:"List NOVA modules and clearly label local prototypes; execution remains disabled.",inputSchema:{type:"object",properties:{},additionalProperties:false}},
 {name:"list_strategy_registry",description:"Read strategy registry rows visible to this signed-in user under Supabase RLS.",inputSchema:{type:"object",properties:{},additionalProperties:false}},
 {name:"read_market_candles",description:"Read public Binance OHLCV candles. Research only.",inputSchema:{type:"object",properties:{symbol:{type:"string"},interval:{type:"string"},limit:{type:"integer"}},additionalProperties:false}},
 {name:"analyze_smc_strategy",description:"Analyze confirmed swing structure, BOS/CHoCH and fair value gaps on public Binance candles. Research only; never sends orders.",inputSchema:{type:"object",properties:{symbol:{type:"string"},interval:{type:"string"},limit:{type:"integer"},swing_left:{type:"integer"},swing_right:{type:"integer"}},additionalProperties:false}},
 {name:"run_ema_backtest",description:"Run a simplified long-only EMA crossover research backtest on public candle data. Not investment advice; no orders.",inputSchema:{type:"object",properties:{symbol:{type:"string"},interval:{type:"string"},limit:{type:"integer"},fast_period:{type:"integer"},slow_period:{type:"integer"}},additionalProperties:false}},
 {name:"validate_paper_risk",description:"Fail-closed paper risk checks. Cannot authorize live trading.",inputSchema:{type:"object",properties:{allocation_pct:{type:"number"},daily_loss_pct:{type:"number"},drawdown_pct:{type:"number"},leverage:{type:"number"},data_age_seconds:{type:"number"}},required:["allocation_pct","daily_loss_pct","drawdown_pct"],additionalProperties:false}}
];
async function handleMcp(request,env,origin) {
 const user=await getUser(request,env); if(!user?.id)return json({error:"unauthorized"},401,cors(origin));
 let body;try{body=await request.json()}catch{return json(rpc(null,null,{code:-32700,message:"Parse error"}),400,cors(origin))}
 if(!body||body.jsonrpc!=="2.0"||typeof body.method!=="string")return json(rpc(body?.id??null,null,{code:-32600,message:"Invalid Request"}),400,cors(origin));
 if(body.method.startsWith("notifications/"))return new Response(null,{status:202,headers:cors(origin)});
 if(body.method==="initialize"){const requested=body.params?.protocolVersion;return json(rpc(body.id,{protocolVersion:ALLOWED_PROTOCOLS.has(requested)?requested:"2025-03-26",capabilities:{tools:{}},serverInfo:{name:"voom-system-mcp",version:"0.2.0"}}),200,cors(origin))}
 if(body.method==="ping")return json(rpc(body.id,{}),200,cors(origin));
 if(body.method==="tools/list")return json(rpc(body.id,{tools}),200,cors(origin));
 if(body.method==="tools/call"){try{const result=await callTool(body.params?.name,body.params?.arguments||{},request,env,user);return json(rpc(body.id,{content:[{type:"text",text:JSON.stringify(result)}],isError:false}),200,cors(origin))}catch(e){return json(rpc(body.id,{content:[{type:"text",text:e instanceof Error?e.message:"Tool failed"}],isError:true}),200,cors(origin))}}
 return json(rpc(body.id,null,{code:-32601,message:"Method not found"}),200,cors(origin));
}
export default {async fetch(request,env){
 const url=new URL(request.url),origin=request.headers.get("Origin")||"";
 if(request.method==="OPTIONS"){const h=cors(origin);return Object.keys(h).length?new Response(null,{status:204,headers:h}):new Response(null,{status:403})}
 if(url.pathname==="/health"&&request.method==="GET")return json({ok:true,service:"voom-system-mcp",mode:"authenticated-read-only",liveTradingEnabled:false,toolCount:tools.length});
 if(url.pathname==="/mcp"&&request.method==="POST")return handleMcp(request,env,origin);
 if(url.pathname==="/api/status"&&request.method==="GET"){const user=await getUser(request,env);if(!user?.id)return json({error:"unauthorized"},401,cors(origin));return json({service:"voom-system-mcp",authenticated:true,mode:"read-only",tradingExecution:false},200,cors(origin))}
 return json({error:"not_found"},404);
}};
