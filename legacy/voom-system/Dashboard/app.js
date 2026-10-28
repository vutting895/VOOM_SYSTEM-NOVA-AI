(() => {
  'use strict';
  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  let readinessRefreshTimer = null;
  const toast = message => {
    const el=$('#toast'); if(!el) return;
    el.textContent=message; el.classList.add('show');
    clearTimeout(window.__voomToastTimer);
    window.__voomToastTimer=setTimeout(()=>el.classList.remove('show'),2800);
  };
  const meta={
    overview:['Overview','Workspace overview','Verified setup status for Voom_system.'],
    agents:['AI Marketplace','AI Strategy Registry','Strategies are listed as ready only after validation and explicit approval.'],
    signals:['Signals','Strategy Signals','Read-only signal records. Signals are paper-only and do not place trades.'],
    positions:['Positions','Position Monitor','MT5 open positions are not yet available from a verified read-only endpoint.'],
    risk:['Risk Guard','Risk Guard','Read-only risk decision history. This screen cannot change execution or risk settings.'],
    security:['Security Center','Security Operations','Staff-only security event feed. Keep this dashboard private.'],
    customers:['Customer Accounts','Customer Accounts','Protected customer profile directory for authorized staff.'],
    activity:['Audit Log','Audit & System Events','Security events returned by the trusted backend.'],
    settings:['Settings','Workspace Settings','Safe configuration overview. Privileged credentials remain server-side.']
  };
  const panel=(title,subtitle,body)=>`<section class="panel full-panel"><div class="panel-heading"><div><h2>${title}</h2><p>${subtitle}</p></div></div>${body}</section>`;
  const notice=(title,detail,kind='info')=>`<div class="inline-state ${kind}"><span class="inline-state-icon">${kind==='warning'?'!':'i'}</span><div><b>${title}</b><p>${detail}</p></div></div>`;
  const table=(headers,rows,empty='No records available.')=>`<div class="table-scroll"><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(row=>`<tr>${row.map(cell=>`<td>${cell}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${headers.length}" class="empty-cell">${empty}</td></tr>`}</tbody></table></div>`;
  const status=(text,cls='gray')=>`<span class="badge badge-${cls}"><i></i>${text}</span>`;
  const views={
    agents:()=>panel('AI Strategy Marketplace','ตรวจสอบความพร้อมอัตโนมัติจากหลักฐานใน Voom_system · read-only',notice('การอนุมัติแบบ fail-closed','หากหลักฐานหายไป ไม่ครบ หรือยังไม่ได้ยืนยัน ระบบจะไม่แสดง AI ว่าพร้อมให้บริการ และจะไม่เปิด Live Trading อัตโนมัติ.','warning')+'<div id="aiReadiness" class="readiness-container"><p>กำลังอ่านรายงานตรวจสอบอัตโนมัติ…</p></div>'),
    signals:()=>panel('Strategy signals','Source 1 · paper-only',notice('No execution controls','Signals displayed here are informational candidates only.')),
    positions:()=>panel('Position monitor','Broker positions are not connected',notice('No verified position feed','The current database schema stores trading sessions, not open position snapshots. No positions or P/L values will be fabricated.')),
    risk:()=>panel('Risk decisions','Read-only · backend only',notice('Risk Guard cannot control orders from this page','The feed is informational and has no approve/reject action.')),
    security:()=>panel('Security operations','Staff-only · private network or VPN',notice('Private access required','The API verifies Supabase JWT and active staff/admin role on each request. Keep this dashboard local/VPN only.','warning')),
    customers:()=>panel('Customer account directory','Protected customer metadata only',notice('Role-checked API','Only active staff/admin sessions may query the customer directory.')),
    activity:()=>panel('Audit log','Trusted backend event history',notice('Minimized security event fields','Sensitive IP hashes, request IDs, and arbitrary details are not returned in the event feed.')),
    settings:()=>panel('Environment status','Safe configuration overview',`<div class="settings-list">
      <div class="settings-row"><div><b>Database</b><p>Supabase project provisioned.</p></div>${status('Provisioned','green')}</div>
      <div class="settings-row"><div><b>Voom_system API</b><p id="voomApiDetail">ตรวจสอบการเชื่อมต่อผ่าน HTTPS health endpoint เท่านั้น; ไม่อ่านข้อมูลบัญชีจาก endpoint สาธารณะ</p></div><span id="voomApiStatus" class="badge badge-amber">Not configured</span></div>
      <div class="settings-row"><div><b>Live trading</b><p>Order execution remains disabled.</p></div>${status('Disabled','green')}</div>
      <div class="settings-row"><div><b>Secret management</b><p>Service-role credentials belong only in trusted backend environment.</p></div>${status('Server-side only','blue')}</div>
      <div class="settings-row"><div><b>Security Dashboard</b><p>Local/VPN and authenticated staff only.</p></div>${status('Private','green')}</div>
      <div class="settings-row"><div><b>MT5 order path</b><p>No changes to EA order routing.</p></div>${status('Preserved','green')}</div>
    </div>`)
  };
  const feeds={
    agents:{url:'/admin/ai-strategies',title:'Registered AI strategies',cols:[['display_name','AI STRATEGY'],['version','VERSION'],['lifecycle_status','LIFECYCLE'],['trading_mode','MODE'],['supported_symbols','SYMBOLS'],['supported_timeframes','TIMEFRAMES'],['risk_profile','RISK'],['backtest_passed','BACKTEST'],['out_of_sample_passed','OOS'],['demo_passed','DEMO'],['risk_review_passed','RISK REVIEW'],['approved_at','APPROVED AT']]},
    signals:{url:'/admin/signals',title:'Latest strategy signals',cols:[['created_at','CREATED'],['symbol','SYMBOL'],['direction','DIRECTION'],['timeframe','TIMEFRAME'],['score','SCORE'],['paper_only','PAPER ONLY']]},
    risk:{url:'/admin/risk-decisions',title:'Risk decision history',cols:[['created_at','TIME'],['decision','DECISION'],['reason_code','REASON'],['user_id','CUSTOMER REF']]},
    security:{url:'/admin/security-events',title:'Security events',cols:[['created_at','TIME'],['severity','SEVERITY'],['event_type','EVENT'],['summary','SUMMARY'],['acknowledged_at','REVIEWED']]},
    customers:{url:'/admin/customers',title:'Customer profiles',cols:[['display_name','CUSTOMER'],['role','ROLE'],['account_status','ACCOUNT STATUS'],['created_at','CREATED']]},
    activity:{url:'/admin/security-events',title:'Recent security audit events',cols:[['created_at','TIME'],['severity','SEVERITY'],['event_type','CATEGORY'],['summary','SUMMARY']]}
  };
  function fmt(v){if(v===null||v===undefined||v==='')return '—';if(typeof v==='boolean')return v?'Passed':'Not passed';if(Array.isArray(v))return v.length?v.join(', '):'—';if(typeof v==='object')return '[structured data omitted]';if(typeof v==='string'&&v.length>100)return v.slice(0,97)+'…';return String(v);}
  async function checkVoomApiStatus(){
    const badge=$('#voomApiStatus');const detail=$('#voomApiDetail');if(!badge||!detail)return;
    let base=String(window.VOOM_CONFIG?.apiBaseUrl||'').trim();while(base.endsWith('/'))base=base.slice(0,-1);
    if(!base){badge.className='badge badge-amber';badge.textContent='Not configured';detail.textContent='ตั้งค่า apiBaseUrl ใน api-config.js เป็น URL HTTPS ของ API ที่ deploy แล้ว';return;}
    let parsed;try{parsed=new URL(base);}catch(_){badge.className='badge badge-amber';badge.textContent='Invalid URL';detail.textContent='URL ของ API ไม่ถูกต้อง';return;}
    if(parsed.protocol!=='https:'&&parsed.hostname!=='localhost'&&parsed.hostname!=='127.0.0.1'){badge.className='badge badge-amber';badge.textContent='HTTPS required';detail.textContent='ระบบปฏิเสธ API ที่ไม่ใช้ HTTPS';return;}
    badge.className='badge badge-amber';badge.textContent='Checking…';detail.textContent='กำลังตรวจสอบ /api/health';
    try{
      const response=await fetch(base+'/api/health',{method:'GET',headers:{Accept:'application/json'},cache:'no-store'});
      if(!response.ok)throw new Error('HTTP '+response.status);
      const data=await response.json();
      if(data.ok!==true||data.tradingMode!=='paper'||data.liveTradingEnabled!==false||data.orderExecution!=='disabled')throw new Error('Safety flags mismatch');
      badge.className='badge badge-green';badge.textContent='Connected · Paper';detail.textContent='API ตอบกลับสำเร็จ · '+(data.service||'Voom_system API')+' · Live trading disabled';
    }catch(_){badge.className='badge badge-amber';badge.textContent='Offline / blocked';detail.textContent='เชื่อมต่อไม่ได้ ตรวจ URL, HTTPS, CORS_ORIGINS และสถานะบริการ API';}
  }
  async function loadReadinessReport(root){
    const host=$('#aiReadiness',root);
    if(!host){if(readinessRefreshTimer){clearInterval(readinessRefreshTimer);readinessRefreshTimer=null;}return;}
    if(!readinessRefreshTimer)readinessRefreshTimer=setInterval(()=>{const current=$('#aiReadiness');if(current)loadReadinessReport($('#viewContent')||document);else{clearInterval(readinessRefreshTimer);readinessRefreshTimer=null;}},60000);
    host.replaceChildren();
    try{
      const response=await fetch('./ai_readiness.json?refresh='+Date.now(),{cache:'no-store',headers:{Accept:'application/json'}});
      if(!response.ok)throw new Error('ไม่พบรายงานล่าสุด กรุณารัน Python/ai_readiness_check.py บนเครื่องระบบ');
      const report=await response.json();
      const summary=document.createElement('div');summary.className='inline-state '+(report.summary?.ready_for_service?'success':'warning');
      const summaryText=document.createElement('div');const title=document.createElement('b');title.textContent='ผลตรวจอัตโนมัติ: '+(report.summary?.ready_for_service||0)+' AI พร้อมให้บริการ';
      const detail=document.createElement('p');detail.textContent='ตรวจพบ '+(report.summary?.strategies_total||0)+' กลยุทธ์ · ยังถูกบล็อก/ทดสอบ '+(report.summary?.blocked_or_testing||0)+' · Live Trading: ปิด';summaryText.append(title,detail);summary.append(summaryText);host.append(summary);
      const generated=document.createElement('p');generated.className='empty-cell';generated.textContent='สร้างรายงาน (UTC): '+(report.generated_at_utc||'ไม่ทราบเวลา')+' · สถานะระบบ: '+(report.system_status||'UNKNOWN');host.append(generated);
      const tests=Object.values(report.test_results||{});const testSummary=document.createElement('p');testSummary.className='empty-cell';testSummary.textContent='ผลชุดทดสอบอัตโนมัติ: '+tests.filter(t=>t.passed).length+'/'+tests.length+' ชุดผ่าน';host.append(testSummary);
      (report.strategies||[]).forEach(strategy=>{
        const card=document.createElement('article');card.className='settings-row readiness-card';
        const info=document.createElement('div');const name=document.createElement('b');name.textContent=strategy.name||strategy.strategy_key||'AI strategy';
        const metaLine=document.createElement('p');metaLine.textContent='Version '+(strategy.version||'—')+' · Lifecycle '+(strategy.lifecycle||'—')+' · Mode '+(strategy.trading_mode||'—');info.append(name,metaLine);
        const badge=document.createElement('span');badge.className='badge badge-'+(strategy.ready_for_service?'green':'amber');badge.textContent=strategy.ready_for_service?'พร้อมให้บริการ':'ยังไม่ผ่านเกณฑ์';card.append(info,badge);host.append(card);
        const list=document.createElement('ul');list.className='readiness-check-list';
        (strategy.checks||[]).forEach(check=>{const li=document.createElement('li');li.textContent=(check.passed?'ผ่าน: ':'ไม่ผ่าน: ')+(check.name||'Gate')+' — '+(check.detail||'ไม่มีรายละเอียด');li.className=check.passed?'check-pass':'check-blocked';list.append(li);});host.append(list);
      });
      const systemTitle=document.createElement('h3');systemTitle.textContent='การตรวจระบบโดยรวม';host.append(systemTitle);
      (report.system_checks||[]).forEach(check=>{const line=document.createElement('p');line.className=check.passed?'check-pass':'check-blocked';line.textContent=(check.passed?'ผ่าน: ':'ต้องตรวจสอบ: ')+(check.name||'System check')+' — '+(check.detail||'');host.append(line);});
    }catch(err){const warning=document.createElement('div');warning.className='inline-state warning';warning.textContent=err.message||'โหลดรายงานตรวจสอบอัตโนมัติไม่สำเร็จ';host.append(warning);}
  }
  async function loadBackendData(key,root){
    const feed=feeds[key]; if(!feed)return;
    const auth=window.VoomAuth;
    const section=document.createElement('section');section.className='panel full-panel live-feed-panel';
    const heading=document.createElement('div');heading.className='panel-heading';
    const titles=document.createElement('div');const h=document.createElement('h2');h.textContent=feed.title;const p=document.createElement('p');p.textContent='Read-only trusted API · latest 50 records';titles.append(h,p);heading.append(titles);section.append(heading);
    const state=document.createElement('div');state.className='inline-state';state.textContent='Loading verified records…';section.append(state);root.append(section);
    try{
      if(!auth||!auth.client)throw new Error('Authenticated session not available');
      const {data,error}=await auth.client.auth.getSession();if(error||!data.session)throw new Error('Session expired; sign in again');
      const response=await fetch('http://127.0.0.1:8010'+feed.url,{method:'GET',headers:{Authorization:'Bearer '+data.session.access_token,Accept:'application/json'}});
      if(!response.ok){if(response.status===401||response.status===403)throw new Error('Staff authorization failed. Sign in with an active staff/admin account.');throw new Error('Staff API unavailable ('+response.status+'). Start the private API and check its server configuration.');}
      const payload=await response.json();const rows=Array.isArray(payload.data)?payload.data:[];
      section.removeChild(state);
      if(!rows.length){const empty=document.createElement('p');empty.className='empty-cell';empty.textContent='No records returned by the API.';section.append(empty);return;}
      const wrap=document.createElement('div');wrap.className='table-scroll';const t=document.createElement('table');const thead=document.createElement('thead');const tr=document.createElement('tr');
      feed.cols.forEach(([,label])=>{const th=document.createElement('th');th.textContent=label;tr.append(th);});thead.append(tr);t.append(thead);
      const tbody=document.createElement('tbody');rows.forEach(record=>{const row=document.createElement('tr');feed.cols.forEach(([field])=>{const td=document.createElement('td');let value=record[field];if(field==='created_at'||field==='last_seen_at'||field==='acknowledged_at'){value=value?new Date(value).toLocaleString():'—';}td.textContent=fmt(value);row.append(td);});tbody.append(row);});t.append(tbody);wrap.append(t);section.append(wrap);
    }catch(err){state.classList.add('warning');state.textContent=err.message||'Could not load backend data.';}
  }
  const render=key=>{
    const m=meta[key]||meta.overview;$('#crumb').textContent=m[0];$('#pageTitle').textContent=m[1];$('#pageDescription').textContent=m[2];$('.eyebrow').textContent='VOOM SYSTEM / '+m[0].toUpperCase();
    const overview=key==='overview';$$('.preview-notice,.stats-grid,.dashboard-grid,.footer').forEach(el=>el.hidden=!overview);
    const view=$('#viewContent');view.hidden=overview;view.replaceChildren();
    if(!overview){view.innerHTML=(views[key]||views.settings)();if(key==='agents')loadReadinessReport(view);if(key==='settings')checkVoomApiStatus();loadBackendData(key,view);}
    $$('.nav-item').forEach(btn=>{const active=btn.dataset.view===key;btn.classList.toggle('active',active);btn.setAttribute('aria-current',active?'page':'false');});
    $('#sidebar').classList.remove('open');
  };
  $$('.nav-item').forEach(btn=>btn.addEventListener('click',()=>render(btn.dataset.view)));
  $$('[data-goto]').forEach(btn=>btn.addEventListener('click',()=>{const nav=$('[data-view="'+btn.dataset.goto+'"]');if(nav)nav.click();}));
  $('#refreshBtn').addEventListener('click',()=>{const el=$('#lastUpdated');el.textContent=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});const active=$('.nav-item.active');render(active?active.dataset.view:'overview');toast('View refreshed; feeds are read-only.');});
  $('#dismissNotice').addEventListener('click',()=>$('.preview-notice')?.remove());
  $('#themeBtn').addEventListener('click',()=>{document.body.classList.toggle('high-contrast');toast('Display contrast toggled.');});
  $('#noticeBtn').addEventListener('click',()=>toast('Open a feed page to check backend availability.'));
  $('#mobileMenu').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));
  $('#lastUpdated').textContent=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  render('overview');
})();