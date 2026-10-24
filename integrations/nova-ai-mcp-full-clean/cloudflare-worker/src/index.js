const VERSION="1.0.0";
const cors={"access-control-allow-origin":"https://voom-system-nova-ui.suwapat787.workers.dev","access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"Authorization,Content-Type","vary":"Origin"};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store",...cors}});
const tools=[
{name:"generate_strategy",description:"Generate a research-only strategy proposal. Metrics are synthetic and are not a real backtest."},
{name:"backtest_strategy",description:"Not enabled on this Worker; source archive backtest engine uses random synthetic trades."},
{name:"tuning_strategy",description:"Not enabled on this Worker; source archive tuning objective uses random synthetic scores."},
{name:"allocate_portfolio",description:"Validate a paper allocation only; never submits orders."},
{name:"get_market_features",description:"Returns module availability; no production features are computed."}
];
export default {async fetch(request,env){
 const u=new URL(request.url);
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(u.pathname==="/health"&&request.method==="GET")return json({ok:true,service:"nova-ai-mcp-full-clean",version:VERSION,sourceArchive:"NOVA AI MCP FULL CLEAN",mode:"paper-test-only",liveTradingEnabled:false,executionEnabled:false,syntheticMetrics:true});
 if(u.pathname==="/"&&request.method==="GET")return json({service:"NOVA AI MCP FULL CLEAN",version:VERSION,mode:"paper-test-only",liveTradingEnabled:false});
 if(u.pathname==="/tools"&&request.method==="GET")return json({tools,qualityGate:{minScore:60,warning:"The source archive's backtest and tuning metrics are mocked. A pass is not evidence of trading performance."}});
 if(u.pathname==="/generate"&&request.method==="POST"){
   let body;try{body=await request.json()}catch{return json({error:"invalid_json"},400)}
   const prompt=typeof body.prompt==="string"?body.prompt.slice(0,1000):"";
   const style=["scalping","swing","dca","arbitrage"].includes(body.style)?body.style:"scalping";
   if(!prompt.trim())return json({error:"prompt_required"},400);
   return json({mode:"paper-test-only",researchOnly:true,syntheticMetrics:true,liveTradingEnabled:false,executionEnabled:false,strategy:{name:"Research proposal (not validated)",style,prompt,entry_workers:["EMA12/26 research placeholder","RSI14 research placeholder"],exit_rule:"No order execution; define and validate rules before use",backtest:{status:"not_run",reason:"Archive implementation uses random synthetic metrics"},tuning:{status:"not_run",reason:"Archive implementation uses random synthetic scores"},passed_gate:false,score:null}});
 }
 if(u.pathname==="/allocate"&&request.method==="POST"){
   let b;try{b=await request.json()}catch{return json({error:"invalid_json"},400)}
   const p=Number(b.allocation_pct);
   if(!Number.isFinite(p)||p<0||p>0.25)return json({approved:false,mode:"paper-test-only",reason:"allocation_pct must be between 0 and 0.25",executionEnabled:false},400);
   return json({approved:true,mode:"paper-test-only",allocation_pct:p,executionEnabled:false,liveTradingEnabled:false});
 }
 if(u.pathname==="/market-features"&&request.method==="GET")return json({status:"prototype_only",modules:["data_ingestion","feature","gen_ai","backtest","tuning","risk","rl"],productionDataConnected:false,executionEnabled:false});
 return json({error:"not_found"},404);
}};
