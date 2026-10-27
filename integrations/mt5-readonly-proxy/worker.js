const UI="https://voom-system-nova-ui.suwapat787.workers.dev";
const BRIDGE="https://bridge.voom.ai";
const BASE={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
const cors=(origin)=>origin===UI?{"Access-Control-Allow-Origin":UI,"Access-Control-Allow-Credentials":"true","Access-Control-Allow-Methods":"GET, OPTIONS","Access-Control-Allow-Headers":"Content-Type","Access-Control-Max-Age":"300","Vary":"Origin"}:{};
const json=(v,status=200,headers={})=>new Response(JSON.stringify(v),{status,headers:{...BASE,"Content-Type":"application/json; charset=utf-8",...headers}});
async function authorize(ctx,env){
 if(!env.ALLOWED_EMAIL)return{ok:false,status:503,error:"access_not_configured"};
 if(!ctx?.access)return{ok:false,status:401,error:"access_login_required"};
 try{
  const identity=await ctx.access.getIdentity();
  const email=String(identity?.email||"").toLowerCase();
  if(!email||email!==env.ALLOWED_EMAIL.toLowerCase())return{ok:false,status:403,error:"user_not_allowed"};
  return{ok:true};
 }catch{return{ok:false,status:401,error:"access_identity_unavailable"}}
}
export default{async fetch(req,env,ctx){
 const u=new URL(req.url),origin=req.headers.get("Origin")||"",ch=cors(origin);
 if(req.method==="OPTIONS")return origin===UI?new Response(null,{status:204,headers:{...BASE,...ch}}):new Response(null,{status:403,headers:BASE});
 if(req.method!=="GET")return json({error:"method_not_allowed",mode:"read-only",ordersEnabled:false},405,ch);
 if(!["/health","/api/account","/api/symbols","/api/quotes"].includes(u.pathname))return json({error:"not_found"},404,ch);
 const a=await authorize(ctx,env);if(!a.ok)return json({error:a.error,mode:"read-only",ordersEnabled:false},a.status,ch);
 if(u.pathname==="/health")return json({ok:true,service:"voom-mt5-readonly-proxy",mode:"read-only",accessIdentityVerified:true,bridgeSecretConfigured:!!env.MT5_BRIDGE_TOKEN,ordersEnabled:false},200,ch);
 if(!env.MT5_BRIDGE_TOKEN)return json({error:"bridge_secret_not_configured"},503,ch);
 const target=new URL(BRIDGE+u.pathname);for(const k of ["q","limit","symbol","timeframe","count"]){const v=u.searchParams.get(k);if(v!==null)target.searchParams.set(k,v.slice(0,120))}
 try{const r=await fetch(target,{headers:{Authorization:"Bearer "+env.MT5_BRIDGE_TOKEN,Accept:"application/json"},redirect:"error",signal:AbortSignal.timeout(8000)});return new Response(await r.text(),{status:r.status,headers:{...BASE,"Content-Type":r.headers.get("Content-Type")||"application/json",...ch}})}
 catch{return json({error:"bridge_unavailable",mode:"read-only",ordersEnabled:false},502,ch)}
}};
