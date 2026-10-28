"use strict";
const form=document.getElementById("loginForm"),message=document.getElementById("message"),submit=document.getElementById("submit");
(async()=>{try{const r=await fetch("/api/session",{cache:"no-store"});const s=await r.json();if(s.authenticated)location.replace("/");}catch(_){}})();
form.addEventListener("submit",async e=>{e.preventDefault();submit.disabled=true;message.textContent="Checking credentials…";
try{const r=await fetch("/api/login",{method:"POST",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:document.getElementById("username").value,password:document.getElementById("password").value})});const data=await r.json();if(!r.ok)throw new Error(data.error==="too_many_login_attempts"?"Too many attempts. Wait five minutes and try again.":"Invalid username or password.");message.style.color="var(--accent)";message.textContent="Signed in. Redirecting…";location.replace("/");}
catch(err){message.style.color="var(--red)";message.textContent=err.message;document.getElementById("password").value="";}
finally{submit.disabled=false;}});
