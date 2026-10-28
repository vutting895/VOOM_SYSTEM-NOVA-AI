import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
const SUPABASE_URL = "https://tlyyxufuiimrbaksoitf.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_YR_oZbHEc0t1XvLkDDKakA_8JX9XIFD";
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: window.sessionStorage } });
const $ = id => document.getElementById(id);
const loginPanel=$("login-panel"), chatPanel=$("chat-panel"), loginForm=$("login-form"), loginButton=$("login-button"), loginStatus=$("login-status"), chatStatus=$("chat-status"), messagesEl=$("messages"), promptEl=$("prompt"), sendButton=$("send-button");
let history=[], busy=false;
function setStatus(element,message,isError=true){element.textContent=message||"";element.style.color=isError?"var(--danger)":"var(--good)";}
function setBusy(value){busy=value;sendButton.disabled=value;sendButton.querySelector("span").textContent=value?"เธเธณเธฅเธฑเธเธเธดเธ”":"เธชเนเธ";}
function showLogin(){loginPanel.classList.remove("hidden");chatPanel.classList.add("hidden");messagesEl.replaceChildren();history=[];}
function showChat(user){loginPanel.classList.add("hidden");chatPanel.classList.remove("hidden");$("account-email").textContent=user.email||"";$("account-email").title=user.email||"";renderMessages();}
function addMessage(role,content,pending=false){const wrap=document.createElement("article");wrap.className="message "+role+(pending?" pending":"");const avatar=document.createElement("div");avatar.className="avatar";avatar.textContent=role==="user"?"YOU":"V";const bubble=document.createElement("div");bubble.className="bubble";bubble.textContent=content;wrap.append(avatar,bubble);messagesEl.append(wrap);messagesEl.scrollTop=messagesEl.scrollHeight;return {wrap,bubble};}
function renderMessages(){messagesEl.replaceChildren();if(!history.length){const note=document.createElement("p");note.className="empty-note";note.textContent="เน€เธฃเธดเนเธกเธชเธเธ—เธเธฒเนเธ”เนเน€เธฅเธข เธเนเธญเธเธงเธฒเธกเนเธเนเธเธ•เธเธตเนเน€เธเนเธเนเธงเนเนเธเธซเธเนเธงเธขเธเธงเธฒเธกเธเธณเธเธญเธเธซเธเนเธฒเน€เธงเนเธเน€เธ—เนเธฒเธเธฑเนเธ เนเธฅเธฐเธเธฐเธซเธฒเธขเนเธเน€เธกเธทเนเธญเน€เธฃเธดเนเธกเนเธเธ•เนเธซเธกเนเธซเธฃเธทเธญเธญเธญเธเธเธฒเธเธฃเธฐเธเธ";messagesEl.append(note);return;}for(const item of history)addMessage(item.role,item.content);}
function safeError(error){const message=String(error?.message||"");if(/invalid login credentials/i.test(message))return "เธญเธตเน€เธกเธฅเธซเธฃเธทเธญเธฃเธซเธฑเธชเธเนเธฒเธเนเธกเนเธ–เธนเธเธ•เนเธญเธ";if(/fetch|network|failed to connect/i.test(message))return "เน€เธเธทเนเธญเธกเธ•เนเธญเธเธฃเธดเธเธฒเธฃเน€เธเนเธฒเธชเธนเนเธฃเธฐเธเธเนเธกเนเนเธ”เน เนเธเธฃเธ”เธฅเธญเธเธญเธตเธเธเธฃเธฑเนเธ";return message.slice(0,220)||"เน€เธเธดเธ”เธเนเธญเธเธดเธ”เธเธฅเธฒเธ” เนเธเธฃเธ”เธฅเธญเธเธญเธตเธเธเธฃเธฑเนเธ";}
async function verifyAuthorizedSession(token){const response=await fetch("/api/session",{headers:{Authorization:"Bearer "+token},cache:"no-store"});const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.error||"เธเธฑเธเธเธตเธเธตเนเธขเธฑเธเนเธกเนเนเธ”เนเธฃเธฑเธเธญเธเธธเธเธฒเธ•เนเธซเนเนเธเน VOOM AI");return payload;}
async function signIn(event){event.preventDefault();setStatus(loginStatus,"");loginButton.disabled=true;loginButton.textContent="เธเธณเธฅเธฑเธเธ•เธฃเธงเธเธชเธญเธ...";try{const {data,error}=await supabase.auth.signInWithPassword({email:$("email").value.trim(),password:$("password").value});if(error)throw error;if(!data.user?.email_confirmed_at){await supabase.auth.signOut();throw new Error("เธเธฃเธธเธ“เธฒเธขเธทเธเธขเธฑเธเธญเธตเน€เธกเธฅเธเธญเธเธเธฑเธเธเธตเธเนเธญเธเน€เธเนเธฒเธชเธนเนเธฃเธฐเธเธ");}await verifyAuthorizedSession(data.session.access_token);showChat(data.user);setStatus(chatStatus,"เน€เธเนเธฒเธชเธนเนเธฃเธฐเธเธเนเธฅเนเธง เธเธฃเนเธญเธกเธชเธเธ—เธเธฒ",false);}catch(error){setStatus(loginStatus,safeError(error));await supabase.auth.signOut().catch(()=>{});}finally{loginButton.disabled=false;loginButton.textContent="เน€เธเนเธฒเธชเธนเนเธฃเธฐเธเธ";}}
async function sendMessage(text){const content=text.trim();if(!content||busy)return;if(content.length>4000){setStatus(chatStatus,"เธเนเธญเธเธงเธฒเธกเธขเธฒเธงเน€เธเธดเธ 4,000 เธ•เธฑเธงเธญเธฑเธเธฉเธฃ");return;}setStatus(chatStatus,"");history.push({role:"user",content});renderMessages();promptEl.value="";promptEl.style.height="auto";setBusy(true);const pending=addMessage("assistant","เธเธณเธฅเธฑเธเธเธดเธ”เธเธณเธ•เธญเธโ€ฆ",true);try{const {data}=await supabase.auth.getSession();const token=data.session?.access_token;if(!token)throw new Error("เน€เธเธชเธเธฑเธเธซเธกเธ”เธญเธฒเธขเธธ เธเธฃเธธเธ“เธฒเน€เธเนเธฒเธชเธนเนเธฃเธฐเธเธเนเธซเธกเน");const messages=history.slice(-12).map(item=>({role:item.role,content:item.content}));const response=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},body:JSON.stringify({messages}),cache:"no-store"});const payload=await response.json().catch(()=>({}));if(!response.ok){if(response.status===401){await supabase.auth.signOut();showLogin();}throw new Error(payload.error||"เนเธกเนเธชเธฒเธกเธฒเธฃเธ–เธฃเธฑเธเธเธณเธ•เธญเธเธเธฒเธ AI เนเธ”เน");}pending.wrap.remove();history.push({role:"assistant",content:payload.reply});addMessage("assistant",payload.reply);}catch(error){pending.bubble.textContent=safeError(error);pending.wrap.classList.remove("pending");setStatus(chatStatus,"เธชเนเธเธเนเธญเธเธงเธฒเธกเนเธกเนเธชเธณเน€เธฃเนเธ");}finally{setBusy(false);promptEl.focus();}}
loginForm.addEventListener("submit",signIn);
$("chat-form").addEventListener("submit",event=>{event.preventDefault();sendMessage(promptEl.value);});
$("logout-button").addEventListener("click",async()=>{await supabase.auth.signOut();history=[];showLogin();setStatus(loginStatus,"เธญเธญเธเธเธฒเธเธฃเธฐเธเธเนเธฅเนเธง",false);});
$("new-chat").addEventListener("click",()=>{history=[];renderMessages();setStatus(chatStatus,"เน€เธฃเธดเนเธกเธเธ—เธชเธเธ—เธเธฒเนเธซเธกเนเนเธฅเนเธง",false);});
document.querySelectorAll("[data-prompt]").forEach(button=>button.addEventListener("click",()=>{promptEl.value=button.dataset.prompt||"";promptEl.focus();if(window.matchMedia("(max-width: 760px)").matches)promptEl.scrollIntoView({behavior:"smooth",block:"end"});}));
promptEl.addEventListener("input",()=>{promptEl.style.height="auto";promptEl.style.height=Math.min(promptEl.scrollHeight,160)+"px";});
const {data:initial}=await supabase.auth.getSession();
if(initial.session?.user){try{const {data,error}=await supabase.auth.getUser();if(error||!data.user?.email_confirmed_at)throw new Error("Session invalid");await verifyAuthorizedSession(initial.session.access_token);showChat(data.user);}catch{await supabase.auth.signOut();showLogin();}}else showLogin();


// AI Marketplace UI: authenticated Supabase RPC only; no order execution or EA delivery.
const marketplacePanel = $("marketplace-panel");
const marketplaceToggle = $("marketplace-toggle");
const strategyList = $("strategy-list");
const subscriptionList = $("subscription-list");
const marketplaceStatus = $("marketplace-status");
let marketplaceBusy = false;

function marketplaceMessage(message, isError = false) {
  marketplaceStatus.textContent = message || "";
  marketplaceStatus.style.color = isError ? "var(--danger)" : "var(--good)";
}
function makeText(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = value == null ? "" : String(value);
  return node;
}
function marketButton(label, action, disabled = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "quiet-button market-action";
  button.textContent = label;
  button.disabled = disabled;
  button.addEventListener("click", action);
  return button;
}
function strategyCard(strategy, subscribedIds) {
  const card = document.createElement("article");
  card.className = "strategy-card";
  const head = document.createElement("div");
  head.className = "strategy-card-head";
  const title = document.createElement("h3");
  title.textContent = String(strategy.display_name || strategy.strategy_key || "AI Strategy");
  const version = makeText("span", "strategy-version", "v" + String(strategy.version || "unknown"));
  head.append(title, version);
  card.append(head);
  card.append(makeText("p", "strategy-description", strategy.description || "ไม่มีคำอธิบาย"));
  card.append(makeText("p", "strategy-meta", "โหมด: " + String(strategy.trading_mode || "paper").toUpperCase() +
    " · ความเสี่ยง: " + String(strategy.risk_profile || "moderate") +
    " · สินทรัพย์: " + ((strategy.supported_symbols || []).join(", ") || "ยังไม่ระบุ")));
  card.append(makeText("p", "strategy-meta", "ตรวจผ่าน: Backtest / Out-of-sample / Demo / Risk Review"));
  if (subscribedIds.has(String(strategy.id))) {
    card.append(makeText("p", "strategy-active", "มีการสมัคร AI นี้อยู่แล้ว"));
  } else {
    card.append(marketButton("เปิดใช้ใน Paper Mode", async () => {
      if (marketplaceBusy) return;
      marketplaceBusy = true;
      marketplaceMessage("กำลังตรวจสิทธิ์และเปิดใช้ Paper Mode…");
      try {
        const { data, error } = await supabase.rpc("voom_marketplace_subscribe", {
          p_strategy_id: strategy.id, p_account_session_id: null, p_risk_profile: strategy.risk_profile || "moderate"
        });
        if (error) throw error;
        marketplaceMessage("เปิดใช้ Paper Mode แล้ว · ยังไม่มีการส่งคำสั่งซื้อขาย");
        marketplaceBusy = false;
        await loadMarketplace();
      } catch (error) {
        marketplaceMessage(/subscription_already_active|duplicate/i.test(String(error?.message)) ?
          "AI นี้เปิดใช้งานอยู่แล้ว" : "เปิดใช้ไม่ได้: " + safeError(error), true);
      } finally { marketplaceBusy = false; }
    }));
  }
  return card;
}
function subscriptionCard(subscription) {
  const card = document.createElement("article");
  card.className = "strategy-card";
  const title = makeText("h3", "", String(subscription.strategy_id || "AI Subscription"));
  card.append(title);
  card.append(makeText("p", "strategy-meta", "สถานะ: " + String(subscription.status || "unknown") +
    " · เวอร์ชัน: " + String(subscription.strategy_version || "unknown") +
    " · ความเสี่ยง: " + String(subscription.risk_profile || "moderate")));
  if (["paper_active", "demo_active", "pending"].includes(String(subscription.status))) {
    card.append(marketButton("หยุดใช้ AI", async () => {
      if (marketplaceBusy) return;
      marketplaceBusy = true;
      marketplaceMessage("กำลังหยุดการสมัคร AI…");
      try {
        const { error } = await supabase.rpc("voom_marketplace_pause", { p_subscription_id: subscription.id });
        if (error) throw error;
        marketplaceMessage("หยุดการสมัครแล้ว · ไม่มีการส่งคำสั่งซื้อขาย");
        marketplaceBusy = false;
        await loadMarketplace();
      } catch (error) { marketplaceMessage("หยุดใช้ไม่สำเร็จ: " + safeError(error), true); }
      finally { marketplaceBusy = false; }
    }));
  }
  return card;
}
async function loadMarketplace() {
  marketplaceMessage("กำลังโหลดรายการ AI ที่ผ่านการอนุมัติ…");
  strategyList.replaceChildren();
  subscriptionList.replaceChildren();
  try {
    const [{ data: strategies, error: strategyError }, { data: subscriptions, error: subscriptionError }] = await Promise.all([
      supabase.rpc("voom_marketplace_list_strategies"),
      supabase.rpc("voom_marketplace_my_subscriptions")
    ]);
    if (strategyError) throw strategyError;
    if (subscriptionError) throw subscriptionError;
    const safeStrategies = Array.isArray(strategies) ? strategies : [];
    const safeSubscriptions = Array.isArray(subscriptions) ? subscriptions : [];
    const activeIds = new Set(safeSubscriptions.filter(s => ["pending", "paper_active", "demo_active"].includes(String(s.status))).map(s => String(s.strategy_id)));
    if (!safeStrategies.length) {
      strategyList.append(makeText("p", "marketplace-empty", "ยังไม่มี AI ที่ผ่านเกณฑ์และได้รับอนุมัติให้แสดงใน Marketplace"));
    } else {
      safeStrategies.forEach(strategy => strategyList.append(strategyCard(strategy, activeIds)));
    }
    if (!safeSubscriptions.length) {
      subscriptionList.append(makeText("p", "marketplace-empty", "คุณยังไม่ได้เปิดใช้ AI"));
    } else {
      safeSubscriptions.forEach(subscription => subscriptionList.append(subscriptionCard(subscription)));
    }
    marketplaceMessage("โหลดข้อมูลสำเร็จ · Paper-only · การเชื่อมต่อ EA และ Copy Trading ยังปิดอยู่");
  } catch (error) {
    marketplaceMessage("โหลด Marketplace ไม่สำเร็จ ตรวจสอบการล็อกอิน สิทธิ์บัญชี และ RPC ใน Supabase: " + safeError(error), true);
  }
}
marketplaceToggle.addEventListener("click", async () => {
  const opening = marketplacePanel.classList.contains("hidden");
  marketplacePanel.classList.toggle("hidden", !opening);
  marketplaceToggle.setAttribute("aria-expanded", String(opening));
  if (opening) await loadMarketplace();
});
$("refresh-marketplace").addEventListener("click", loadMarketplace);
