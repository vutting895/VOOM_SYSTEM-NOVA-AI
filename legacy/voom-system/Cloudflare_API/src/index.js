export default { async fetch(request, env) {
 const url=new URL(request.url), origin=request.headers.get("Origin")||"", allowed=env.DASHBOARD_ORIGIN||"";
 const cors={}; if(origin&&origin===allowed) Object.assign(cors,{"Access-Control-Allow-Origin":allowed,"Vary":"Origin","Access-Control-Allow-Methods":"GET, POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type, X-Voom-Bridge-Secret"});
 const headers={"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store, max-age=0","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer","X-Frame-Options":"DENY",...cors};
 const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
 if(request.method==="OPTIONS") return origin===allowed&&!!origin?new Response(null,{status:204,headers}):json({ok:false,error:"origin_not_allowed"},403);
 if(origin&&origin!==allowed) return json({ok:false,error:"origin_not_allowed"},403);
 if(request.method==="GET"&&url.pathname==="/api/health") return json({ok:true,service:"Voom_system API",storage:"cloudflare-kv",tradingMode:"paper",liveTradingEnabled:false,orderExecution:"disabled"});
 // Keep both status paths for compatibility with the dashboard and MT5 status checks.
 if(request.method==="GET"&&(url.pathname==="/api/dashboard/status"||url.pathname==="/api/mt5/status")){
  let t=null; try{t=await env.DATA.get("latest_mt5_telemetry","json")}catch{}
  const rec=t?Date.parse(t.receivedAt):NaN, fresh=Number.isFinite(rec)&&Date.now()-rec<=90000&&Date.now()>=rec;
  return json({ok:true,service:"Voom_system API",connected:!!(t&&fresh&&t.terminalConnected&&t.accountConnected),stale:!!t&&!fresh,tradingMode:"paper",liveTradingEnabled:false,orderExecution:"disabled",telemetry:t?{source:t.source,mode:t.mode,timestamp:t.timestamp,receivedAt:t.receivedAt,terminalConnected:t.terminalConnected,accountConnected:t.accountConnected,symbol:t.symbol??null,timeframe:t.timeframe??null,bid:t.bid??null,ask:t.ask??null,ageSeconds:Math.max(0,Math.floor((Date.now()-Date.parse(t.timestamp))/1000))}:null});
 }
 if(request.method==="POST"&&url.pathname==="/api/mt5/telemetry"){
  if(!env.VOOM_BRIDGE_SHARED_SECRET||env.VOOM_BRIDGE_SHARED_SECRET.length<32)return json({ok:false,error:"bridge_secret_not_configured"},503);
  const supplied=request.headers.get("X-Voom-Bridge-Secret")||""; if(supplied.length!==env.VOOM_BRIDGE_SHARED_SECRET.length||supplied!==env.VOOM_BRIDGE_SHARED_SECRET)return json({ok:false,error:"unauthorized"},401);
  let b; try{b=await request.json()}catch{return json({ok:false,error:"invalid_json"},400)}
  if(!b||b.source!=="mt5-ea"||b.mode!=="paper"||typeof b.timestamp!=="string"||!Number.isFinite(Date.parse(b.timestamp))||typeof b.terminalConnected!=="boolean"||typeof b.accountConnected!=="boolean")return json({ok:false,error:"invalid_telemetry"},400);
  const age=Date.now()-Date.parse(b.timestamp); if(age< -60000||age>300000)return json({ok:false,error:"stale_or_future_telemetry"},400);
  const {bid,ask}=b; if((bid!==undefined&&(typeof bid!=="number"||!Number.isFinite(bid)||bid<0))||(ask!==undefined&&(typeof ask!=="number"||!Number.isFinite(ask)||ask<0))||(bid!==undefined&&ask!==undefined&&ask<bid))return json({ok:false,error:"invalid_prices"},400);
  const safe={source:"mt5-ea",mode:"paper",timestamp:b.timestamp,receivedAt:new Date().toISOString(),terminalConnected:b.terminalConnected,accountConnected:b.accountConnected};
  for(const k of ["symbol","timeframe"])if(typeof b[k]==="string")safe[k]=b[k].slice(0,k==="symbol"?32:16);
  for(const k of ["bid","ask"])if(typeof b[k]==="number")safe[k]=b[k];
  await env.DATA.put("latest_mt5_telemetry",JSON.stringify(safe),{expirationTtl:86400});
  return json({ok:true,accepted:true,tradingMode:"paper",liveTradingEnabled:false,orderExecution:"disabled",receivedAt:safe.receivedAt},202);
 }
 return json({ok:false,error:"not_found"},404);
}};
