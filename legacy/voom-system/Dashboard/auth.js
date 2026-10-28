(() => {
  'use strict';
  const SUPABASE_URL = 'https://tlyyxufuiimrbaksoitf.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_YR_oZbHEc0t1XvLkDDKakA_8JX9XIFD';
  const STAFF_ROLES = new Set(['staff','admin']);
  let client = null;
  let authReady = false;
  const el = (tag, attrs={}, text='') => {
    const n=document.createElement(tag);
    Object.entries(attrs).forEach(([k,v])=> k==='class' ? n.className=v : n.setAttribute(k,v));
    if(text) n.textContent=text;
    return n;
  };
  function mountGate() {
    const gate=el('main',{id:'authGate',class:'auth-gate'});
    gate.innerHTML = `
      <section class="auth-card">
        <div class="auth-brand"><span class="auth-mark">V</span><div><b>VOOM SYSTEM</b><small>PRIVATE CONTROL CENTER</small></div></div>
        <p class="auth-eyebrow">SECURE STAFF ACCESS</p>
        <h1 id="authTitle">Sign in to continue</h1>
        <p class="auth-copy">This workspace is restricted to authorized staff. Customer accounts cannot access administration screens.</p>
        <form id="authForm" autocomplete="on">
          <label for="authEmail">Staff email</label>
          <input id="authEmail" name="email" type="email" autocomplete="username" required maxlength="254" placeholder="staff@company.com">
          <label for="authPassword">Password</label>
          <input id="authPassword" name="password" type="password" autocomplete="current-password" required minlength="8" maxlength="256" placeholder="Enter password">
          <button id="authSubmit" type="submit">Sign in securely</button>
          <p id="authMessage" class="auth-message" role="status" aria-live="polite"></p>
        </form>
        <div class="auth-foot"><span>โ—</span> Supabase Auth ยท Role-checked access</div>
      </section>`;
    document.body.prepend(gate);
    document.querySelector('.app-shell').hidden=true;
    document.getElementById('authForm').addEventListener('submit', signIn);
  }
  function message(text, bad=false) {
    const m=document.getElementById('authMessage');
    m.textContent=text; m.classList.toggle('error',bad);
  }
  function setBusy(busy) {
    const btn=document.getElementById('authSubmit');
    btn.disabled=busy; btn.textContent=busy?'Checking accessโ€ฆ':'Sign in securely';
  }
  async function signIn(event) {
    event.preventDefault();
    if(!client) return message('Authentication service is not available. Check network access and reload.',true);
    const email=document.getElementById('authEmail').value.trim();
    const password=document.getElementById('authPassword').value;
    setBusy(true); message('');
    try {
      const {data,error}=await client.auth.signInWithPassword({email,password});
      if(error) throw error;
      await verifyRole(data.user);
    } catch(err) {
      message('Sign-in failed or this account is not authorized for staff access.',true);
      try { await client.auth.signOut(); } catch (_) {}
    } finally { setBusy(false); }
  }
  async function verifyRole(user) {
    if(!user) throw new Error('No authenticated user');
    const {data,error}=await client.from('customer_profiles')
      .select('user_id,display_name,role,account_status')
      .eq('user_id',user.id).maybeSingle();
    if(error || !data) throw new Error('Profile unavailable');
    if(data.account_status!=='active' || !STAFF_ROLES.has(data.role)) {
      document.getElementById('authTitle').textContent='Access not authorized';
      message('Your account does not have an active staff/admin role. Contact the system owner.',true);
      throw new Error('Insufficient role');
    }
    document.body.classList.add('auth-verified');
    document.querySelector('.app-shell').hidden=false;
    document.getElementById('authGate').hidden=true;
    const name=data.display_name || user.email || 'Authorized staff';
    const profile=document.querySelector('.profile-name');
    if(profile) profile.innerHTML='';
    if(profile) { profile.append(el('b',{},name)); profile.append(el('small',{},data.role.toUpperCase())); }
    const brand=document.querySelector('.mini-avatar'); if(brand) brand.textContent=(name[0]||'V').toUpperCase();
    const env=document.querySelector('.environment small'); if(env) env.textContent='Authenticated staff session';
    window.VoomAuth={client, user:{id:user.id,email:user.email,role:data.role}, signOut};
    authReady=true;
  }
  async function signOut() {
    if(client) await client.auth.signOut();
    window.location.reload();
  }
  async function init() {
    mountGate();
    try {
      if(!window.supabase || typeof window.supabase.createClient!=='function') throw new Error('Supabase SDK missing');
      client=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{
        auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
      });
      const signOutButton=document.getElementById('signOutBtn');
      if(signOutButton) signOutButton.addEventListener('click',signOut);
      const {data,error}=await client.auth.getSession();
      if(error) throw error;
      if(data.session) {
        try { await verifyRole(data.session.user); }
        catch (_) { try { await client.auth.signOut(); } catch (__) {} }
      }
    } catch (_) {
      message('Cannot initialize authentication. Verify connection to Supabase and reload.',true);
    }
  }
  document.addEventListener('DOMContentLoaded',init,{once:true});
})();
