'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '../lib/supabase-browser';

const TURNSTILE_SCRIPT_ID = 'cloudflare-turnstile-api';

export default function AuthPanel({ mode = 'login' }) {
  const isRegister = mode === 'register';
  const widgetRef = useRef(null);
  const widgetIdRef = useRef(null);
  const [email, setEmail] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [accepted, setAccepted] = useState(false);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';

  const resetCaptcha = useCallback(() => {
    setCaptchaToken('');
    if (window.turnstile && widgetIdRef.current !== null) {
      window.turnstile.reset(widgetIdRef.current);
    }
  }, []);

  useEffect(() => {
    if (!siteKey || !widgetRef.current) return undefined;
    let cancelled = false;
    const renderWidget = () => {
      if (cancelled || !window.turnstile || !widgetRef.current || widgetIdRef.current !== null) return;
      widgetIdRef.current = window.turnstile.render(widgetRef.current, {
        sitekey: siteKey,
        callback: (token) => { setCaptchaToken(token); setError(''); },
        'expired-callback': () => setCaptchaToken(''),
        'error-callback': () => {
          setCaptchaToken('');
          setError('ยืนยัน CAPTCHA ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
        },
      });
    };
    const existingScript = document.getElementById(TURNSTILE_SCRIPT_ID);
    if (window.turnstile) renderWidget();
    else if (existingScript) existingScript.addEventListener('load', renderWidget, { once: true });
    else {
      const script = document.createElement('script');
      script.id = TURNSTILE_SCRIPT_ID;
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.onload = renderWidget;
      script.onerror = () => setError('โหลด CAPTCHA ไม่สำเร็จ กรุณาลองใหม่');
      document.head.appendChild(script);
    }
    return () => {
      cancelled = true;
      if (widgetIdRef.current !== null && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [siteKey]);

  async function sendEmailLink(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    if (!siteKey || !captchaToken) {
      setError('กรุณาตั้งค่า Turnstile และยืนยัน CAPTCHA ก่อนดำเนินการ');
      return;
    }
    if (isRegister && !accepted) {
      setError('กรุณายืนยันการยอมรับข้อกำหนดก่อนสมัครสมาชิก');
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError('ยังไม่ได้ตั้งค่า Supabase URL หรือ Anon Key สำหรับหน้าเว็บ');
      return;
    }
    setBusy(true);
    try {
      const { error: authError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          captchaToken,
          shouldCreateUser: isRegister,
        },
      });
      if (authError) throw authError;
      setMessage(isRegister
        ? 'ส่งลิงก์ยืนยันการสมัครไปยังอีเมลแล้ว กรุณาตรวจสอบกล่องจดหมาย'
        : 'ส่งลิงก์เข้าสู่ระบบไปยังอีเมลแล้ว หากไม่พบให้ตรวจสอบโฟลเดอร์ Spam');
      resetCaptcha();
    } catch (err) {
      const detail = String(err?.message || '');
      setError(/captcha/i.test(detail)
        ? 'ระบบ CAPTCHA ปฏิเสธคำขอ กรุณายืนยันใหม่และตรวจการตั้งค่า Supabase Auth'
        : 'ไม่สามารถดำเนินการได้ กรุณาตรวจสอบอีเมลหรือการตั้งค่า Auth แล้วลองอีกครั้ง');
      resetCaptcha();
    } finally {
      setBusy(false);
    }
  }

  async function signInWithProvider(provider) {
    setError('');
    setMessage('');
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError('ยังไม่ได้ตั้งค่า Supabase สำหรับหน้าเว็บ');
      return;
    }
    setBusy(true);
    try {
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (authError) throw authError;
    } catch {
      setError(`ไม่สามารถเชื่อมต่อ ${provider === 'google' ? 'Google' : 'Facebook'} ได้ กรุณาตรวจการเปิด Provider ใน Supabase Auth`);
      setBusy(false);
    }
  }

  return (
    <main className="nova-login-wrap">
      <section className="nova-login-card nova-auth-card">
        <p className="nova-eyebrow">VOOM SYSTEM / NOVA</p>
        <span className="nova-pill">SECURE ACCOUNT ACCESS</span>
        <h1>{isRegister ? 'สร้างบัญชี NOVA' : 'ยินดีต้อนรับกลับ'}</h1>
        <p>{isRegister
          ? 'สมัครสมาชิกเพื่อสร้างพื้นที่ทำงานส่วนตัวและจัดการการเชื่อมต่อของคุณ'
          : 'เข้าสู่ระบบเพื่อใช้งาน NOVA Workspace และข้อมูลบัญชีของคุณ'}</p>

        <div className="nova-notice">
          <strong>READ-ONLY · LIVE TRADING OFF</strong>
          <p>การสมัครและเข้าสู่ระบบไม่ขอรหัสผ่านโบรกเกอร์ ไม่รับ API Secret และไม่เปิดสิทธิ์ส่งคำสั่งซื้อขาย</p>
        </div>

        <div className="nova-auth-providers">
          <button className="nova-auth-provider" type="button" onClick={() => signInWithProvider('google')} disabled={busy}>
            <span className="nova-provider-mark nova-google-mark" aria-hidden="true">G</span>
            ดำเนินการต่อด้วย Google
          </button>
          <button className="nova-auth-provider" type="button" onClick={() => signInWithProvider('facebook')} disabled={busy}>
            <span className="nova-provider-mark nova-facebook-mark" aria-hidden="true">f</span>
            ดำเนินการต่อด้วย Facebook
          </button>
        </div>

        <div className="nova-auth-divider"><span>หรือใช้อีเมล</span></div>
        <form onSubmit={sendEmailLink}>
          <label className="nova-label" htmlFor="auth-email">อีเมล</label>
          <input
            className="nova-input"
            id="auth-email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            maxLength={254}
            disabled={busy}
          />
          {isRegister && (
            <label className="nova-auth-consent">
              <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} disabled={busy} />
              <span>ฉันยืนยันว่าต้องการสร้างบัญชี NOVA และยอมรับข้อกำหนดการใช้บริการที่แสดงในระบบ</span>
            </label>
          )}
          <div className="nova-label">ยืนยัน CAPTCHA</div>
          {siteKey
            ? <div ref={widgetRef} aria-label="Cloudflare Turnstile CAPTCHA" />
            : <div className="nova-empty">ยังไม่ได้ตั้งค่า Turnstile Site Key ระบบอีเมลจะไม่ส่งคำขอจนกว่าจะตั้งค่าถูกต้อง</div>}
          {error && <p role="alert" className="nova-auth-error">{error}</p>}
          {message && <p role="status" className="nova-auth-success">{message}</p>}
          <button className="nova-button nova-button-primary nova-auth-submit" type="submit" disabled={busy || !siteKey || !captchaToken || (isRegister && !accepted)}>
            {busy ? 'กำลังดำเนินการ…' : isRegister ? 'สมัครสมาชิกด้วยอีเมล' : 'ส่งลิงก์เข้าสู่ระบบ'}
          </button>
        </form>

        <p className="nova-auth-switch">
          {isRegister ? 'มีบัญชีอยู่แล้ว?' : 'ยังไม่มีบัญชี?'}{' '}
          <Link href={isRegister ? '/login' : '/register'}>{isRegister ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}</Link>
        </p>
        <div className="nova-actions">
          <Link className="nova-link-button" href="/">กลับ Dashboard</Link>
        </div>
        <p className="nova-small">การใช้ Google/Facebook ต้องเปิด Provider และกำหนด OAuth Client/Redirect URL ใน Supabase Auth ก่อนใช้งานจริง</p>
        <p className="nova-small">ห้ามใส่ OAuth Client Secret หรือ Turnstile Secret Key ลงใน Git หรือโค้ดฝั่ง Browser</p>
      </section>
    </main>
  );
}
