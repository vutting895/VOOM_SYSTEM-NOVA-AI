const ISS="https://veezerotrust.cloudflareaccess.com";
const UI="https://voom-system-nova-ui.suwapat787.workers.dev";
const BRIDGE="https://bridge.voom.ai";
const BASE={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
const cors=(origin)=>origin===UI?{"Access-Control-Allow-Origin":UI,"Access-Control-Allow-Credentials":"true","Access-Control-Allow-Methods":"GET, OPTIONS","Access-Control-Allow-Headers":"Content-Type","Access-Control-Max-Age":"300","Vary":"Origin"}:{};
const json=(v,status=200,headers={})=>new Response(JSON.stringify(v),{status,headers:{...BASE,"Content-Type":"application/json; charset=utf-8",...headers}});
async function authorize(req,env){
 if(!env.ACCESS_AUD||!env.ALLOWED_EMAIL)return{ok:false,status:503,error:"access_not_configured"};
 const jwt=req.headers.get("Cf-Access-Jwt-Assertion");if(!jwt)return{ok:false,status:401,error:"access_login_required"};
 try{
  const p=jwt.split(".");if(p.length!==3)throw 0;
  const dec=x=>JSON.parse(atob(x.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(x.length/4)*4,"=")));
  const h=dec(p[0]),c=dec(p[1]),now=Math.floor(Date.now()/1000);
  if(h.alg!=="RS256"||!h.kid||c.iss!==ISS||c.exp<=now||(c.nbf&&c.nbf>now)||!(Array.isArray(c.aud)?c.aud:[c.aud]).includes(env.ACCESS_AUD)||String(c.email||"").toLowerCase()!==env.ALLOWED_EMAIL.toLowerCase())throw 0;
  const cr=await fetch(ISS+"/cdn-cgi/access/certs");if(!cr.ok)throw 0;const certs=await cr.json(),jwk=certs.keys.find(k=>k.kid===h.kid);if(!jwk)throw 0;
  const key=await crypto.subtle.importKey("jwk",jwk,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
  const sig=Uint8Array.from(atob(p[2].replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(p[2].length/4)*4,"=")),x=>x.charCodeAt(0));
  if(!await crypto.subtle.verify("RSASSA-PKCS1-v1_5",key,sig,new TextEncoder().encode(p[0]+"."+p[1])))throw 0;
  return{ok:true};
 }catch{return{ok:false,status:401,error:"invalid_access_assertion"}}
}
export default{async fetch(req,env){
 const u=new URL(req.url),origin=req.headers.get("Origin")||"",ch=cors(origin);
 if(req.method==="OPTIONS")return origin===UI?new Response(null,{status:204,headers:{...BASE,...ch}}):new Response(null,{status:403,headers:BASE});
 if(u.pathname==="/health"&&req.method==="GET")return json({ok:true,service:"voom-mt5-readonly-proxy",mode:"read-only",accessConfigured:!!env.ACCESS_AUD&&!!env.ALLOWED_EMAIL,bridgeSecretConfigured:!!env.MT5_BRIDGE_TOKEN,ordersEnabled:false},200,ch);
 if(req.method!=="GET")return json({error:"method_not_allowed",mode:"read-only",ordersEnabled:false},405,ch);
 if(!["/api/account","/api/symbols","/api/quotes"].includes(u.pathname))return json({error:"not_found"},404,ch);
 const a=await authorize(req,env);if(!a.ok)return json({error:a.error,mode:"read-only"},a.status,ch);
 if(!env.MT5_BRIDGE_TOKEN)return json({error:"bridge_secret_not_configured"},503,ch);
 const target=new URL(BRIDGE+u.pathname);for(const k of ["q","limit","symbol","timeframe","count"]){const v=u.searchParams.get(k);if(v!==null)target.searchParams.set(k,v.slice(0,120))}
 try{const r=await fetch(target,{headers:{Authorization:"Bearer "+env.MT5_BRIDGE_TOKEN,Accept:"application/json"},redirect:"error",signal:AbortSignal.timeout(8000)});return new Response(await r.text(),{status:r.status,headers:{...BASE,"Content-Type":r.headers.get("Content-Type")||"application/json",...ch}})}
 catch{return json({error:"bridge_unavailable",mode:"read-only"},502,ch)}
}};
