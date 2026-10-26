'use client';

import { useState } from 'react';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '../../lib/supabase-client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setNotice('');
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      window.location.assign('/profile');
    } catch (error) {
      setNotice(error?.message || 'เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจข้อมูลหรือการตั้งค่า Supabase Auth');
    } finally {
      setBusy(false);
    }
  }

  return <main style={{minHeight:'100vh',background:'#080b13',color:'#eef2ff',padding:'32px 16px',fontFamily:'Inter,system-ui,sans-serif'}}>
    <section style={{maxWidth:480,margin:'6vh auto',padding:28,border:'1px solid #293149',borderRadius:18,background:'#111522'}}>
      <p style={{color:'#a99aff',fontSize:12,letterSpacing:'.15em',fontWeight:800}}>VOOM SYSTEM / NOVA</p>
      <h1 style={{fontSize:32,margin:'12px 0'}}>เข้าสู่ระบบ</h1>
      <p style={{color:'#a2adc4',fontSize:13,lineHeight:1.8}}>เข้าสู่บัญชีลูกค้าผ่าน Supabase Auth หากยังไม่มีบัญชี ให้สมัครสมาชิกก่อน</p>
      <form onSubmit={submit}>
        <label style={{display:'block',marginTop:18,fontSize:13}}>อีเมล
          <input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} style={fieldStyle}/>
        </label>
        <label style={{display:'block',marginTop:14,fontSize:13}}>รหัสผ่าน
          <input required type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} style={fieldStyle}/>
        </label>
        <button disabled={busy} type="submit" style={buttonStyle}>{busy?'กำลังเข้าสู่ระบบ…':'เข้าสู่ระบบ'}</button>
      </form>
      {notice && <p role="alert" aria-live="polite" style={{color:'#e8c982',fontSize:12,lineHeight:1.8,overflowWrap:'anywhere'}}>{notice}</p>}
      <p style={{fontSize:13,color:'#a2adc4'}}>ยังไม่มีบัญชี? <Link href="/signup" style={{color:'#a99aff'}}>สมัครสมาชิก</Link></p>
      <p style={{fontSize:11,color:'#7f8aa2',lineHeight:1.8}}>ต้องตั้งค่า NEXT_PUBLIC_SUPABASE_URL และ NEXT_PUBLIC_SUPABASE_ANON_KEY ใน Vercel รวมถึงเปิด Email provider และกำหนด Redirect URLs ใน Supabase Auth</p>
      <p style={{fontSize:12,color:'#7be8d1'}}>Read-only · Live Trading OFF · ไม่มีการส่งคำสั่งซื้อขาย</p>
      <Link href="/" style={{color:'#a2adc4',fontSize:12}}>← กลับ Dashboard</Link>
    </section>
  </main>;
}

const fieldStyle = {display:'block',width:'100%',boxSizing:'border-box',marginTop:7,padding:13,borderRadius:10,border:'1px solid #30384e',background:'#090d16',color:'#fff',fontSize:14};
const buttonStyle = {width:'100%',margin:'20px 0 14px',padding:13,border:0,borderRadius:10,background:'linear-gradient(100deg,#8974ff,#4a9df5)',color:'#fff',fontWeight:800,cursor:'pointer'};
