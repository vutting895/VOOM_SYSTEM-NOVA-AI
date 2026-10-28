"use strict";
const $ = id => document.getElementById(id);
let csrfToken = "";
let currentRole = "admin";
function el(tag, cls, text) { const n=document.createElement(tag); if(cls)n.className=cls; if(text!==undefined)n.textContent=String(text); return n; }
async function api(path, options={}) { const headers={...(options.headers||{})}; if(options.method==="POST" && csrfToken) headers["X-CSRF-Token"]=csrfToken; const r=await fetch(path,{cache:"no-store",...options,headers}); const data=await r.json(); if(r.status===401){location.replace("/login");throw new Error("Admin login required");} if(!r.ok)throw new Error(data.error||"Request failed"); return data; }
function badge(label,kind) { return el("span","status "+(kind||""),label); }
function renderModules(data) {
 const root=$("modules"); root.replaceChildren();
 if(!data.modules||!data.modules.length){root.append(el("div","empty","ไม่พบโมดูลใน catalog"));return;}
 data.modules.forEach(m=>{
  const item=el("article","item"), row=el("div","topline");
  row.append(el("h3","",m.name||m.id),badge(m.status||"unknown",m.status==="approved_for_ai"?"good":""));
  item.append(row); if(m.description)item.append(el("p","",m.description));
  const chips=el("div","chips");
  (m.allowed_ai_use||[]).forEach(a=>chips.append(el("span","chip","Allow: "+a)));
  (m.blocked_actions||[]).slice(0,5).forEach(a=>chips.append(el("span","chip","Block: "+a)));
  item.append(chips);
  const ev=m.evidence||{}, keys=Object.keys(ev);
  if(keys.length)item.append(el("p","",keys.map(k=>k+": "+String(ev[k])).join(" · ")));
  root.append(item);
 });
 $("policyStatus").textContent=data.production_changes_enabled?"Production enabled":"Production changes disabled";
 $("policyStatus").className="status "+(data.production_changes_enabled?"bad":"good");
}
function renderControls(data) {
 const root=$("controls"); root.replaceChildren(); const controls=data.controls||[];
 if(!controls.length){root.append(el("div","empty","Checklist unavailable"));return;}
 function update(){const done=controls.filter((_,i)=>$("control-"+i).checked).length;$("controlProgress").style.width=Math.round(done/controls.length*100)+"%";$("controlStatus").textContent=done+" reviewed locally";}
 controls.forEach((c,i)=>{const label=el("label","checkrow"),box=document.createElement("input");box.type="checkbox";box.id="control-"+i;box.addEventListener("change",update);const span=el("span","",c.label);span.append(el("small","","Evidence status: not tested"));label.append(box,span);root.append(label);});
 $("controlStatus").textContent="Not tested";
}
function renderFindings(data) {
 const root=$("findings"); root.replaceChildren(); const items=data.findings||[];
 $("queueMeta").textContent=items.length+" candidate(s) · newest first";
 if(!items.length){root.append(el("div","empty","ยังไม่มีข้อค้นพบที่บันทึกไว้"));return;}
 items.forEach(f=>{
  const item=el("article","item"),row=el("div","topline");
  row.append(el("h3","",f.title||f.id),el("span","sev "+(f.severity||"medium"),f.severity||"medium"));item.append(row);
  item.append(el("p","",(f.id||"")+" · "+(f.asset||"Asset not specified")+" · "+(f.status||"review_required")));
  item.append(el("p","",f.summary||""));
  if(f.proposed_remediation)item.append(el("p","","Proposed: "+f.proposed_remediation));
  if(f.source_url){const a=el("a","",f.source_url);a.href=f.source_url;a.target="_blank";a.rel="noopener noreferrer";a.style.color="var(--accent)";a.style.fontSize="12px";item.append(a);}
  item.append(el("p","","Created: "+(f.created_at||"unknown")+" · Unverified candidate; approval required."));root.append(item);
 });
}
async function refresh(){
 $("refresh").disabled=true;
 try{
  const results=await Promise.all([api("/api/status"),api("/api/catalog"),api("/api/controls"),api("/api/findings")]);
  const auditData=(currentRole==="admin"||currentRole==="auditor")?await api("/api/audit"):{events:[]};
  const s=results[0];$("moduleCount").textContent=s.module_count;$("controlCount").textContent=s.control_count;$("findingCount").textContent=s.finding_count;$("indexStatus").textContent=s.semantic_index_present?"Present":"Missing";$("authStatus").textContent=s.account_monitoring_active?"Connected":"Not connected";$("authStatus").style.color=s.account_monitoring_active?"var(--accent)":"var(--red)";
  renderModules(results[1]);renderControls(results[2]);renderFindings(results[3]);renderAudit(auditData);
 }catch(e){$("formMessage").textContent="API error: "+e.message;$("policyStatus").textContent="Unavailable";$("policyStatus").className="status bad";}
 finally{$("refresh").disabled=false;}
}
$("refresh").addEventListener("click",refresh);
$("findingForm").addEventListener("submit",async event=>{
 event.preventDefault();const message=$("formMessage");message.textContent="Saving candidate…";
 const payload={title:$("title").value,asset:$("asset").value,severity:$("severity").value,source_url:$("source").value,summary:$("summary").value,proposed_remediation:$("remediation").value};
 try{const r=await api("/api/findings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});message.textContent="Saved as "+r.finding.id+" — waiting for review.";$("findingForm").reset();await refresh();}
 catch(e){message.textContent="Not saved: "+e.message;}
});
function renderAudit(data){const root=$("auditEvents");root.replaceChildren();const events=data.events||[];if(!events.length){root.append(el("div","empty",currentRole==="security_analyst"?"Your role does not include audit-log access.":"No admin events recorded yet."));return;}events.slice().reverse().forEach(e=>{const row=el("article","item"),top=el("div","topline");top.append(el("strong","",e.event||"event"),badge(e.outcome||"unknown",e.outcome==="success"?"good":""));row.append(top,el("p","",(e.timestamp||"")+" · "+(e.actor||"unknown")+" · "+(e.source||"local")));root.append(row);});}
async function initAdmin(){try{const s=await api("/api/session");if(!s.authenticated){location.replace("/login");return;}csrfToken=s.csrf||"";currentRole=s.role||"admin";const badgeNode=el("span","pill","SIGNED IN: "+s.username+" · "+currentRole);$("adminActions").prepend(badgeNode);await refresh();}catch(e){if(!String(e.message).includes("Admin login required"))$("formMessage").textContent="Session error: "+e.message;}}
const logoutButton=$("logout");
if(logoutButton)logoutButton.addEventListener("click",async()=>{logoutButton.disabled=true;try{await api("/api/logout",{method:"POST"});location.replace("/login");}catch(e){$("formMessage").textContent="Logout error: "+e.message;logoutButton.disabled=false;}});
initAdmin();
