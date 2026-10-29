'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '../../lib/supabase-browser';

const TURNSTILE_SCRIPT_ID = 'cloudflare-turnstile-api';

export default function LoginPage() {
  const widgetRef = useRef(null);
  const widgetIdRef = useRef(null);
  const [email, setEmail] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaReady, setCaptchaReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  // Fail closed when the deployment has no configured Turnstile site key.
  // Production site keys must be provided by the host environment, not hard-coded here.
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
        callback: (token) => {
          setCaptchaToken(token);
          setError('');
          setCaptchaReady(true);
        },
        'expired-callback': () => {
          setCaptchaToken('');
          setCaptchaReady(false);
        },
        'error-callback': () => {
          setCaptchaToken('');
          setCaptchaReady(false);
          setError('ยืนยัน CAPTCHA ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
        },
      });
    };

    const existingScript = document.getElementById(TURNSTILE_SCRIPT_ID);
    if (window.turnstile) {
      renderWidget();
    } else if (existingScript) {
      existingScript.addEventListener('load', renderWidget, { once: true });
    } else {
      const script = document.createElement('script');
      script.id = TURNSTILE_SCRIPT_ID;
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.onload = renderWidget;
      script.onerror = () => setError('โหลด CAPTCHA ไม่สำเร็จ กรุณาตรวจการเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่');
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

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!siteKey) {
      setError('ยังไม่ได้ตั้งค่า NEXT_PUBLIC_TURNSTILE_SITE_KEY ใน environment ของหน้าเว็บ');
      return;
    }
    if (!captchaToken) {
      setError('กรุณายืนยัน CAPTCHA ให้สำเร็จก่อนส่งคำขอ');
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
        },
      });
      if (authError) throw authError;
      setMessage('ส่งลิงก์เข้าสู่ระบบไปยังอีเมลแล้ว หากไม่พบให้ตรวจสอบโฟลเดอร์ Spam');
      resetCaptcha();
    } catch (err) {
      const text = String(err?.message || 'ไม่สามารถเข้าสู่ระบบได้');
      if (/captcha/i.test(text)) {
        setError('ระบบ CAPTCHA ปฏิเสธคำขอ กรุณายืนยันใหม่ และตรวจว่า Turnstile Site Key ตรงกับค่าที่ตั้งไว้ใน Supabase Auth');
      } else {
        setError(text);
      }
      resetCaptcha();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="nova-login-wrap">
      <section className="nova-login-card">
        <p className="nova-eyebrow">VOOM SYSTEM / NOVA</p>
        <h1>เข้าสู่ระบบ</h1>
        <p>เข้าสู่ระบบด้วยลิงก์ยืนยันทางอีเมล พร้อม CAPTCHA เพื่อป้องกันคำขออัตโนมัติ</p>

        <div className="nova-notice">
          <strong>READ-ONLY · LIVE TRADING OFF</strong>
          <p>หน้านี้ใช้สำหรับยืนยันตัวตนเท่านั้น ไม่ขอรหัสผ่านโบรกเกอร์ ไม่รับ API Secret และไม่ส่งคำสั่งซื้อขาย</p>
        </div>

        <form onSubmit={handleSubmit}>
          <label className="nova-label" htmlFor="login-email">อีเมล</label>
          <input
            className="nova-input"
            id="login-email"
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

          <div className="nova-label">ยืนยัน CAPTCHA</div>
          {siteKey ? (
            <div ref={widgetRef} aria-label="Cloudflare Turnstile CAPTCHA" />
          ) : (
            <div className="nova-empty">
              ยังไม่ได้ตั้งค่า Turnstile Site Key หน้า Login จะไม่ส่งคำขอจนกว่าจะตั้งค่าถูกต้อง
            </div>
          )}

          {error && <p role="alert" style={{ color: '#ffb4a8' }}>{error}</p>}
          {message && <p role="status" style={{ color: '#80f0c0' }}>{message}</p>}

          <button className="nova-button nova-button-primary" type="submit" disabled={busy || !siteKey || !captchaToken}>
            {busy ? 'กำลังส่งลิงก์…' : 'ส่งลิงก์เข้าสู่ระบบ'}
          </button>
        </form>

        <div className="nova-actions">
          <Link className="nova-link-button" href="/broker">ไปหน้า Broker Hub →</Link>
          <Link className="nova-link-button" href="/">กลับ Dashboard</Link>
        </div>
        <p className="nova-small">
          ต้องตั้งค่า `NEXT_PUBLIC_TURNSTILE_SITE_KEY` ในระบบ build/deploy และเปิด CAPTCHA provider ที่ตรงกันใน Supabase Auth ก่อนใช้งานจริง
        </p>
        <p className="nova-small">ห้ามใส่ Turnstile Secret Key หรือข้อมูลลับลงใน Git หรือฟอร์มนี้</p>
      </section>
    </main>
  );
}
