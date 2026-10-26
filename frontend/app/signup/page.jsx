'use client';

import { useState } from 'react';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '../../lib/supabase-client';

export default function SignupPage() {
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
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: `${window.location.origin}/profile` },
      });
      if (error) throw error;
      setNotice(data.session
        ? 'สมัครสมาชิกสำเร็จ กำลังเปิดหน้าโปรไฟล์…'
        : 'ส่งคำขอสมัครแล้ว โปรดตรวจอีเมลเพื่อยืนยันบัญชีก่อนเข้าสู่ระบบ');
      if (data.session) window.location.assign('/profile');
    } catch (error) {
      setNotice(error?.message || 'สมัครสมาชิกไม่สำเร็จ กรุณาตรวจการตั้งค่า Auth');
    } finally {
      setBusy(false);
    }
  }

  return <main style={{minHeight:'100vh',background:'#080b13',color:'#eef2ff',padding:'32px 16px',fontFamily:'Inter,system-ui,sans-serif'}}>
    <section style={{maxWidth:480,margin:'6vh auto',padding:28,border:'1px solid #293149',borderRadius:18,background:'#111522'}}>
      <p style={{color:'#a99aff',fontSize:12,letterSpacing:'.15em',fontWeight:800}}>VOOM SYSTEM / NOVA</p>
      <h1 style={{fontSize:32,margin:'12px 0'}}>สร้างบัญชีลูกค้า</h1>
      <p style={{color:'#a2adc4',fontSize:13,lineHeight:1.8}}>ใช้ Supabase Auth สำหรับบัญชีผู้ใช้ VOOM เท่านั้น อย่าใช้รหัสผ่านหรือ API Secret ของโบรกเกอร์</p>
      <form onSubmit={submit}>
        <label style={{display:'block',marginTop:18,fontSize:13}}>อีเมล
          <input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} style={fieldStyle} />
        </label>
        <label style={{display:'block',marginTop:14,fontSize:13}}>รหัสผ่าน (อย่างน้อย 8 ตัวอักษร)
          <input required minLength={8} type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} style={fieldStyle} />
        </label>
        <button disabled={busy} type="submit" style={buttonStyle}>{busy?'กำลังดำเนินการ…':'สมัครสมาชิก'}</button>
      </form>
      {notice && <p role="status" aria-live="polite" style={{color:'#e8c982',fontSize:12,lineHeight:1.8,overflowWrap:'anywhere'}}>{notice}</p>}
      <p style={{fontSize:13,color:'#a2adc4'}}>มีบัญชีแล้ว? <Link href="/login" style={{color:'#a99aff'}}>เข้าสู่ระบบ</Link></p>
      <p style={{fontSize:11,color:'#7f8aa2',lineHeight:1.8}}>หากระบบแจ้งว่า Auth ยังไม่พร้อม ให้ตรวจ Email provider และ Site URL / Redirect URLs ใน Supabase ก่อนเปิดให้ลูกค้าใช้งาน</p>
      <Link href="/" style={{color:'#a2adc4',fontSize:12}}>← กลับ Dashboard</Link>
    </section>
  </main>;
}

const fieldStyle = {display:'block',width:'100%',boxSizing:'border-box',marginTop:7,padding:13,borderRadius:10,border:'1px solid #30384e',background:'#090d16',color:'#fff',fontSize:14};
const buttonStyle = {width:'100%',margin:'20px 0 14px',padding:13,border:0,borderRadius:10,background:'linear-gradient(100deg,#8974ff,#4a9df5)',color:'#fff',fontWeight:800,cursor:'pointer'};
