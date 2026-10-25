'use client';

import { useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "../../lib/supabase-browser";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function sendMagicLink(event) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    setError("");
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        throw new Error("ระบบยังตั้งค่า Supabase ไม่ครบ กรุณาตรวจ NEXT_PUBLIC_SUPABASE_URL และ NEXT_PUBLIC_SUPABASE_ANON_KEY ใน Vercel");
      }
      const { error: authError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          shouldCreateUser: true,
        },
      });
      if (authError) throw authError;
      setNotice("ส่งลิงก์เข้าสู่ระบบแล้ว กรุณาเปิดอีเมลและกดลิงก์บนเว็บไซต์ VOOM SYSTEM");
    } catch (e) {
      setError(e instanceof Error ? e.message : "ส่งลิงก์เข้าสู่ระบบไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{minHeight:"100vh",padding:"28px 16px",display:"grid",placeItems:"center",color:"#eef3ff",fontFamily:"Inter,system-ui,sans-serif",background:"radial-gradient(ellipse at 10% 0%,#654bce30,transparent 40%),radial-gradient(ellipse at 95% 40%,#00cba51a,transparent 35%),#060910"}}>
      <section style={{width:"100%",maxWidth:480,border:"1px solid #252b3d",borderRadius:20,padding:"clamp(22px,5vw,36px)",background:"#101420",boxShadow:"0 24px 90px #0005"}}>
        <Link href="/" style={{color:"#aab4cb",fontSize:13}}>← กลับหน้า VOOM</Link>
        <p style={{color:"#7be8d1",fontSize:11,letterSpacing:".2em",fontWeight:800,marginTop:32}}>VOOM SYSTEM · NOVA AI</p>
        <h1 style={{fontSize:32,letterSpacing:"-.04em",margin:"10px 0"}}>เข้าสู่ระบบ</h1>
        <p style={{color:"#98a4bd",fontSize:14,lineHeight:1.8}}>กรอกอีเมล แล้วเราจะส่งลิงก์เข้าสู่ระบบที่ปลอดภัยให้คุณ ไม่ต้องกรอกรหัสผ่านในหน้านี้</p>
        <form onSubmit={sendMagicLink}>
          <label htmlFor="email" style={{display:"block",color:"#c5cce0",fontSize:12,marginTop:22}}>อีเมล</label>
          <input id="email" type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" style={{display:"block",width:"100%",marginTop:8,border:"1px solid #30364a",background:"#090d16",color:"white",borderRadius:10,padding:14,fontSize:15,boxSizing:"border-box"}} />
          <button type="submit" disabled={busy} style={{width:"100%",marginTop:16,padding:14,border:0,borderRadius:10,background:busy?"#45445b":"linear-gradient(100deg,#8974ff,#4a9df5)",color:"white",fontWeight:800,cursor:busy?"wait":"pointer"}}>{busy?"กำลังส่งลิงก์…":"ส่งลิงก์เข้าสู่ระบบ"}</button>
        </form>
        {notice && <p role="status" style={{marginTop:16,padding:12,borderRadius:10,background:"#10271f",border:"1px solid #2c6d54",color:"#9ce9c7",fontSize:13,lineHeight:1.7}}>{notice}</p>}
        {error && <p role="alert" style={{marginTop:16,padding:12,borderRadius:10,background:"#2b171b",border:"1px solid #7a353f",color:"#ffb5bf",fontSize:13,lineHeight:1.7}}>{error}</p>}
        <p style={{marginTop:22,color:"#7f8ba4",fontSize:11,lineHeight:1.8}}>การซื้อขายจริงยังปิดอยู่ · ลิงก์ยืนยันจะกลับมายังเว็บไซต์ NOVA ที่กำลังเปิดอยู่</p>
      </section>
    </main>
  );
}
