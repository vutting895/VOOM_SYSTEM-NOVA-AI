'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '../../lib/supabase-client';

export default function ProfilePage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    let supabase;
    try {
      supabase = getSupabaseBrowserClient();
      supabase.auth.getUser().then(({ data, error }) => {
        if (!active) return;
        if (error) setNotice(error.message);
        setUser(data?.user || null);
        setLoading(false);
      }).catch(error => {
        if (!active) return;
        setNotice(error?.message || 'ตรวจสอบ session ไม่สำเร็จ');
        setLoading(false);
      });
      const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
        if (active) setUser(session?.user || null);
      });
      return () => {
        active = false;
        listener.subscription.unsubscribe();
      };
    } catch (error) {
      setNotice(error?.message || 'Supabase Auth ยังไม่พร้อม');
      setLoading(false);
      return () => { active = false; };
    }
  }, []);

  async function signOut() {
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      window.location.assign('/login');
    } catch (error) {
      setNotice(error?.message || 'ออกจากระบบไม่สำเร็จ');
    }
  }

  return <main style={{minHeight:'100vh',background:'#080b13',color:'#eef2ff',padding:'32px 16px',fontFamily:'Inter,system-ui,sans-serif'}}>
    <section style={{maxWidth:720,margin:'4vh auto',padding:28,border:'1px solid #293149',borderRadius:18,background:'#111522'}}>
      <p style={{color:'#a99aff',fontSize:12,letterSpacing:'.15em',fontWeight:800}}>VOOM SYSTEM / NOVA</p>
      <h1 style={{fontSize:32,margin:'12px 0'}}>โปรไฟล์ลูกค้า</h1>
      {loading ? <p style={{color:'#a2adc4'}}>กำลังตรวจสอบ session…</p> : user ? <>
        <p style={{color:'#7be8d1'}}>● ยืนยันตัวตนแล้ว</p>
        <dl style={{lineHeight:2.2,fontSize:14}}>
          <dt style={{color:'#9ba6bf'}}>อีเมล</dt><dd style={{margin:'0 0 12px',overflowWrap:'anywhere'}}>{user.email || 'ไม่มีอีเมลใน session'}</dd>
          <dt style={{color:'#9ba6bf'}}>สถานะอีเมล</dt><dd style={{margin:'0 0 12px'}}>{user.email_confirmed_at ? 'ยืนยันแล้ว' : 'ยังไม่ยืนยัน'}</dd>
          <dt style={{color:'#9ba6bf'}}>สร้างบัญชี</dt><dd style={{margin:'0 0 12px'}}>{user.created_at ? new Date(user.created_at).toLocaleString('th-TH') : '—'}</dd>
        </dl>
        <button onClick={signOut} style={{padding:'12px 16px',borderRadius:10,border:'1px solid #74474e',background:'#2a171d',color:'#ffb8c0',fontWeight:700,cursor:'pointer'}}>ออกจากระบบ</button>
      </> : <>
        <p style={{color:'#e8c982',lineHeight:1.8}}>ยังไม่มี session ที่ยืนยันตัวตน กรุณาเข้าสู่ระบบก่อน</p>
        <Link href="/login" style={{color:'#a99aff'}}>ไปหน้าเข้าสู่ระบบ →</Link>
      </>}
      {notice && <p role="status" style={{color:'#e8c982',fontSize:12,lineHeight:1.8,overflowWrap:'anywhere'}}>{notice}</p>}
      <hr style={{border:0,borderTop:'1px solid #293149',margin:'24px 0'}}/>
      <p style={{color:'#a2adc4',fontSize:12,lineHeight:1.8}}>สถานะความปลอดภัย: Read-only · Live Trading OFF · ยังไม่มีการเก็บ broker secret ในหน้าโปรไฟล์</p>
      <nav style={{display:'flex',gap:16,flexWrap:'wrap',fontSize:13}}><Link href="/" style={{color:'#a99aff'}}>Dashboard</Link><Link href="/broker" style={{color:'#a99aff'}}>Broker Hub</Link><Link href="/gen-ai" style={{color:'#a99aff'}}>AI Strategy Lab</Link></nav>
    </section>
  </main>;
}
