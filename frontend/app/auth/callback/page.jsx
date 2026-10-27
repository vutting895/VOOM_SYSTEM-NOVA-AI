"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "../../../lib/supabase-browser";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [message, setMessage] = useState("กำลังตรวจสอบลิงก์เข้าสู่ระบบ…");

  useEffect(() => {
    let active = true;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setMessage("ระบบยืนยันตัวตนยังตั้งค่าไม่ครบ กรุณาติดต่อผู้ดูแลระบบ");
      return;
    }

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (session?.user) {
        setMessage("เข้าสู่ระบบสำเร็จ กำลังเปิดหน้าโปรไฟล์…");
        router.replace("/profile");
      } else if (event === "SIGNED_OUT") {
        setMessage("ไม่พบเซสชัน กรุณาขอลิงก์เข้าสู่ระบบใหม่");
      }
    });

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setMessage("ตรวจสอบเซสชันไม่สำเร็จ กรุณาขอลิงก์ใหม่");
      else if (data.session?.user) {
        setMessage("เข้าสู่ระบบสำเร็จ กำลังเปิดหน้าโปรไฟล์…");
        router.replace("/profile");
      } else {
        setMessage("ลิงก์หมดอายุหรือใช้ไปแล้ว กรุณากลับไปขอลิงก์เข้าสู่ระบบใหม่");
      }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [router]);

  return (
    <main style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:24,background:"#060910",color:"#eef3ff",fontFamily:"Inter,system-ui,sans-serif"}}>
      <section style={{maxWidth:480,width:"100%",padding:28,border:"1px solid #252b3d",borderRadius:18,background:"#101420"}}>
        <p style={{color:"#7be8d1",fontSize:11,letterSpacing:".2em",fontWeight:800}}>VOOM SYSTEM · AUTH</p>
        <h1 style={{fontSize:26}}>ยืนยันการเข้าสู่ระบบ</h1>
        <p role="status" style={{color:"#aab4cb",lineHeight:1.8}}>{message}</p>
        <Link href="/login" style={{display:"inline-block",marginTop:12,padding:"12px 16px",borderRadius:9,background:"#8974ff",color:"#fff",fontWeight:700}}>กลับหน้าเข้าสู่ระบบ</Link>
      </section>
    </main>
  );
}
