import React, { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import QRCode from "qrcode";
import { Link } from "react-router-dom";
import { extractPairingToken, requestPairingApi, resolveSystemHubOrigin } from "../lib/pairing-utils.mjs";
import { supabaseBrowser, supabaseBrowserConfigured } from "../lib/supabase-browser";

const HUB_ORIGIN = resolveSystemHubOrigin(
  (import.meta as ImportMeta & { env?: { VITE_SYSTEM_HUB_URL?: string } }).env?.VITE_SYSTEM_HUB_URL ?? "https://voom-system-hub.suwapat787.workers.dev"
);
const PENDING_TOKEN_KEY = "nova.secure-pairing.pending-token";
const TOKEN_TTL_MS = 110 * 1000;

type PairingSnapshot = {
  pairingId: string;
  status: "pending" | "scanned" | "approved" | "expired";
  expiresAt?: string;
};

function readPendingToken(): string | null {
  try {
    const raw = sessionStorage.getItem(PENDING_TOKEN_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { token?: string; expiresAt?: number };
    if (!saved.token || !saved.expiresAt || saved.expiresAt <= Date.now()) {
      sessionStorage.removeItem(PENDING_TOKEN_KEY);
      return null;
    }
    return saved.token;
  } catch {
    return null;
  }
}

function takeInitialPairingToken(): string | null {
  const fromHash = extractPairingToken(window.location.hash);
  if (fromHash) {
    try {
      sessionStorage.setItem(PENDING_TOKEN_KEY, JSON.stringify({
        token: fromHash,
        expiresAt: Date.now() + TOKEN_TTL_MS,
      }));
    } catch {
      // Keep the token in memory when session storage is unavailable.
    }
    // The fragment is not sent in HTTP requests; remove it from the address bar immediately.
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    return fromHash;
  }
  return readPendingToken();
}

function safeMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  const messages: Record<string, string> = {
    authentication_required: "กรุณาเข้าสู่ระบบด้วยบัญชี NOVA เดียวกับอุปกรณ์ที่สร้าง QR",
    invalid_or_expired_session: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่",
    pairing_invalid_expired_used_or_not_owned: "QR หมดอายุ ถูกใช้ไปแล้ว หรือเป็นของบัญชีอื่น",
    pairing_creation_unavailable: "สร้าง QR ไม่สำเร็จ กรุณาลองใหม่",
    pairing_claim_unavailable: "ยืนยัน QR ไม่สำเร็จ กรุณาลองใหม่",
    pairing_approval_unavailable: "อนุมัติอุปกรณ์ไม่สำเร็จ กรุณาลองใหม่",
    pairing_lookup_unavailable: "ตรวจสอบสถานะการจับคู่ไม่สำเร็จ",
    system_hub_not_configured: "ยังไม่ได้ตั้งค่า URL ของ NOVA System Hub",
    system_hub_unavailable: "เชื่อมต่อ NOVA System Hub ไม่สำเร็จ",
  };
  return messages[code] ?? "ดำเนินการไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อและลองอีกครั้ง";
}

export default function ConnectPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [claimToken, setClaimToken] = useState<string | null>(() => takeInitialPairingToken());
  const [creator, setCreator] = useState<PairingSnapshot | null>(null);
  const [creatorToken, setCreatorToken] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [receiver, setReceiver] = useState<PairingSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    if (!supabaseBrowser) {
      setAuthReady(true);
      return () => { active = false; };
    }
    supabaseBrowser.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) setAuthMessage("อ่านสถานะเซสชันไม่สำเร็จ กรุณาเข้าสู่ระบบใหม่");
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: { subscription } } = supabaseBrowser.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!creator || !session?.access_token || !HUB_ORIGIN ||
      creator.status === "approved" || creator.status === "expired") return;
    let active = true;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const data = await requestPairingApi({
          origin: HUB_ORIGIN,
          accessToken: session.access_token,
          path: "/v1/secrets/pairings/" + creator.pairingId,
        });
        if (!active) return;
        const nextStatus = data?.pairing?.status;
        if (["pending", "scanned", "approved", "expired"].includes(nextStatus)) {
          setCreator((current) => current ? { ...current, status: nextStatus } : current);
        }
        if (nextStatus !== "approved" && nextStatus !== "expired") {
          timer = window.setTimeout(poll, 2500);
        }
      } catch {
        if (active) timer = window.setTimeout(poll, 5000);
      }
    };
    void poll();
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [creator?.pairingId, creator?.status === "approved", creator?.status === "expired", session?.access_token]);

  useEffect(() => {
    if (!receiver || !session?.access_token ||
      receiver.status === "approved" || receiver.status === "expired") return;
    let active = true;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const data = await requestPairingApi({
          origin: HUB_ORIGIN,
          accessToken: session.access_token,
          path: "/v1/secrets/pairings/" + receiver.pairingId,
        });
        if (!active) return;
        const nextStatus = data?.pairing?.status;
        if (["pending", "scanned", "approved", "expired"].includes(nextStatus)) {
          setReceiver((current) => current ? { ...current, status: nextStatus } : current);
        }
        if (nextStatus !== "approved" && nextStatus !== "expired") {
          timer = window.setTimeout(poll, 2500);
        }
      } catch {
        if (active) timer = window.setTimeout(poll, 5000);
      }
    };
    void poll();
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [receiver?.pairingId, receiver?.status === "approved", receiver?.status === "expired", session?.access_token]);

  async function sendSignInLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabaseBrowser || !email.trim() || authBusy) return;
    setAuthBusy(true);
    setAuthMessage("");
    setError("");
    try {
      const { error: signInError } = await supabaseBrowser.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: false,
          emailRedirectTo: window.location.origin + "/connect",
        },
      });
      if (signInError) throw signInError;
      setEmailSent(true);
      setAuthMessage("ส่งลิงก์เข้าสู่ระบบแล้ว กรุณาเปิดอีเมลในเบราว์เซอร์เดียวกันและกลับมาที่หน้านี้ หาก QR หมดอายุให้สแกนใหม่");
    } catch {
      setError("ส่งลิงก์เข้าสู่ระบบไม่สำเร็จ ตรวจสอบอีเมลและการตั้งค่า Supabase Auth");
    } finally {
      setAuthBusy(false);
    }
  }

  async function createPairing() {
    if (!session?.access_token || !HUB_ORIGIN || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await requestPairingApi({
        origin: HUB_ORIGIN,
        accessToken: session.access_token,
        path: "/v1/secrets/pairings",
        method: "POST",
        body: {},
      });
      if (!data?.pairing?.pairingId || typeof data.pairingUrl !== "string") {
        throw new Error("pairing_creation_unavailable");
      }
      const target = new URL(data.pairingUrl);
      if (target.protocol !== "https:" || target.pathname !== "/connect" ||
        target.origin !== window.location.origin) {
        throw new Error("pairing_creation_unavailable");
      }
      const token = extractPairingToken(target.hash);
      if (!token) throw new Error("pairing_creation_unavailable");
      const image = await QRCode.toDataURL(data.pairingUrl, {
        width: 280,
        margin: 2,
        errorCorrectionLevel: "M",
        color: { dark: "#07131d", light: "#ffffff" },
      });
      setCreator({
        pairingId: data.pairing.pairingId,
        status: data.pairing.status === "pending" ? "pending" : "pending",
        expiresAt: data.pairing.expiresAt,
      });
      setCreatorToken(token);
      setQrDataUrl(image);
      setReceiver(null);
      setClaimToken(null);
    } catch (err) {
      setError(safeMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function claimPairing() {
    if (!session?.access_token || !claimToken || busy) return;
    setBusy(true);
    setError("");
    try {
      const data = await requestPairingApi({
        origin: HUB_ORIGIN,
        accessToken: session.access_token,
        path: "/v1/secrets/pairings/claim",
        method: "POST",
        body: { token: claimToken },
      });
      if (!data?.pairing?.pairingId) throw new Error("pairing_claim_unavailable");
      setReceiver({
        pairingId: data.pairing.pairingId,
        status: data.pairing.status,
        expiresAt: data.pairing.expiresAt,
      });
      setClaimToken(null);
      try { sessionStorage.removeItem(PENDING_TOKEN_KEY); } catch { /* optional storage */ }
      setNotice("อุปกรณ์นี้ยืนยันการสแกนแล้ว กรุณาอนุมัติจากอุปกรณ์ที่สร้าง QR");
    } catch (err) {
      setError(safeMessage(err));
      if (err instanceof Error && err.message === "pairing_invalid_expired_used_or_not_owned") {
        setClaimToken(null);
        try { sessionStorage.removeItem(PENDING_TOKEN_KEY); } catch { /* optional storage */ }
      }
    } finally {
      setBusy(false);
    }
  }

  async function approvePairing() {
    if (!session?.access_token || !creator || !creatorToken || busy) return;
    setBusy(true);
    setError("");
    try {
      const data = await requestPairingApi({
        origin: HUB_ORIGIN,
        accessToken: session.access_token,
        path: "/v1/secrets/pairings/" + creator.pairingId,
        method: "POST",
        body: { token: creatorToken },
      });
      if (data?.approved !== true) throw new Error("pairing_approval_unavailable");
      setCreator((current) => current ? { ...current, status: "approved" } : current);
      setCreatorToken(null);
      setQrDataUrl("");
      setNotice("อนุมัติการจับคู่แล้ว การอนุมัตินี้ยังไม่เปิดใช้ Credential Intake หรือการส่งคำสั่งซื้อขาย");
    } catch (err) {
      setError(safeMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function resetPairing() {
    setCreator(null);
    setCreatorToken(null);
    setQrDataUrl("");
    setReceiver(null);
    setNotice("");
    setError("");
  }

  const configReady = supabaseBrowserConfigured && Boolean(HUB_ORIGIN);
  const activeStatus = creator?.status ?? receiver?.status;

  return (
    <div className="nova-shell pairing-page">
      <header className="nova-header">
        <div>
          <p className="nova-eyebrow">NOVA SECURITY / DEVICE PAIRING</p>
          <h1 className="nova-title">Secure QR Connect</h1>
          <p className="nova-subtitle">จับคู่อุปกรณ์ด้วย QR แบบใช้ครั้งเดียว อายุสั้น และผูกกับบัญชี NOVA เดียวกัน</p>
        </div>
        <Link to="/broker" className="nova-link-button">← Broker Hub</Link>
      </header>

      <section className="pairing-safety-banner">
        <strong>PAIRING ONLY · READ-ONLY</strong>
        <span>QR นี้ไม่เก็บรหัสผ่านหรือ API Secret และไม่เปิดสิทธิ์อ่าน/เขียน Credential หรือส่งคำสั่งซื้อขาย</span>
        <span className="pairing-safety-lock">ORDERS OFF · LIVE TRADING OFF</span>
      </section>

      {!configReady && (
        <div className="nova-notice" role="alert">
          <strong>ยังตั้งค่าการเชื่อมต่อไม่ครบ</strong>
          <p>ต้องกำหนด VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY และ VITE_SYSTEM_HUB_URL ใน environment ของ Netlify ก่อนเปิดใช้หน้านี้</p>
        </div>
      )}

      {authReady && !session && (
        <section className="nova-panel pairing-auth-panel">
          <h2>เข้าสู่ระบบบัญชี NOVA</h2>
          <p>ทั้งสองอุปกรณ์ต้องใช้บัญชี Supabase/NOVA เดียวกัน ก่อนยืนยัน QR</p>
          <form onSubmit={sendSignInLink}>
            <label className="nova-label">อีเมลบัญชี NOVA
              <input className="nova-input" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" disabled={!configReady || authBusy} />
            </label>
            <button className="nova-button nova-button-primary" type="submit" disabled={!configReady || authBusy || !email.trim()}>
              {authBusy ? "กำลังส่ง…" : "ส่งลิงก์เข้าสู่ระบบ"}
            </button>
          </form>
          {emailSent && <p className="pairing-info" role="status">{authMessage}</p>}
        </section>
      )}

      {authReady && session && (
        <div className="pairing-account-row">
          <span>บัญชีที่เข้าสู่ระบบ: <strong>{session.user.email ?? session.user.id}</strong></span>
          <button type="button" className="nova-button" onClick={() => supabaseBrowser?.auth.signOut()}>ออกจากระบบ</button>
        </div>
      )}

      {error && <div className="pairing-error" role="alert">{error}</div>}
      {notice && <div className="pairing-info" role="status">{notice}</div>}

      {session && claimToken && (
        <section className="nova-panel pairing-flow-card">
          <span className="nova-pill">RECEIVING DEVICE</span>
          <h2>ยืนยันอุปกรณ์ที่สแกน QR</h2>
          <p>ตรวจสอบว่าคุณเข้าสู่ระบบด้วยบัญชีเดียวกับอุปกรณ์ที่สร้าง QR แล้วกดยืนยันเพื่อผูกอุปกรณ์นี้</p>
          <button type="button" className="nova-button nova-button-primary" disabled={busy || !HUB_ORIGIN} onClick={claimPairing}>
            {busy ? "กำลังยืนยัน…" : "ยืนยันการสแกน QR"}
          </button>
          <p className="pairing-footnote">Token จะถูกใช้เพียงครั้งเดียวและถูกลบออกจาก URL หลังเปิดหน้านี้</p>
        </section>
      )}

      {session && !claimToken && !creator && !receiver && (
        <section className="pairing-start-grid">
          <div className="nova-panel pairing-flow-card">
            <span className="nova-pill">CREATE PAIRING</span>
            <h2>สร้าง QR สำหรับอุปกรณ์ใหม่</h2>
            <p>สร้างรหัสสุ่มแบบใช้ครั้งเดียว อายุประมาณ 110 วินาที จากนั้นสแกนด้วยกล้องของอุปกรณ์อีกเครื่อง</p>
            <button type="button" className="nova-button nova-button-primary" disabled={busy || !configReady} onClick={createPairing}>
              {busy ? "กำลังสร้าง QR…" : "สร้าง Secure QR"}
            </button>
          </div>
          <div className="nova-panel pairing-flow-card">
            <span className="nova-pill">SAME OWNER ONLY</span>
            <h2>ข้อกำหนดการจับคู่</h2>
            <ul className="nova-list">
              <li>อุปกรณ์ทั้งสองต้องใช้บัญชี NOVA เดียวกัน</li>
              <li>ผู้ใช้ต้องอนุมัติจากอุปกรณ์ที่สร้าง QR</li>
              <li>QR หมดอายุและใช้ซ้ำไม่ได้</li>
              <li>การจับคู่ไม่อนุญาตให้ดึงค่า Secret หรือสั่งซื้อขาย</li>
            </ul>
          </div>
        </section>
      )}

      {creator && (
        <section className="nova-panel pairing-result-grid">
          <div className="pairing-qr-wrap">
            {qrDataUrl ? <img src={qrDataUrl} alt="One-time secure device pairing QR code" /> : <div className="nova-empty">QR นี้ปิดใช้งานแล้ว</div>}
            <span className="pairing-footnote">สแกนด้วยกล้องของอุปกรณ์อีกเครื่องภายในเวลาที่กำหนด</span>
          </div>
          <div className="pairing-result-copy">
            <span className="nova-pill">PAIRING STATUS</span>
            <h2>{creator.status === "pending" ? "รอการสแกน" : creator.status === "scanned" ? "สแกนแล้ว · รออนุมัติ" : creator.status === "approved" ? "จับคู่สำเร็จ" : "หมดอายุ"}</h2>
            <p>{creator.status === "scanned" ? "อุปกรณ์ปลายทางยืนยันการสแกนแล้ว ตรวจสอบบัญชีให้ถูกต้องก่อนอนุมัติ" : creator.status === "approved" ? "อุปกรณ์ได้รับการอนุมัติแล้ว แต่ยังไม่มีสิทธิ์จัดการ Provider Credential" : creator.status === "expired" ? "QR หมดอายุแล้ว สร้าง QR ใหม่เพื่อเริ่มอีกครั้ง" : "QR จะหมดอายุอัตโนมัติภายในประมาณ 110 วินาที"}</p>
            {creator.status === "scanned" && (
              <button type="button" className="nova-button nova-button-primary" onClick={approvePairing} disabled={busy || !creatorToken}>
                {busy ? "กำลังอนุมัติ…" : "อนุมัติอุปกรณ์นี้"}
              </button>
            )}
            <div className="pairing-status-row"><span>สถานะ</span><strong>{creator.status.toUpperCase()}</strong></div>
            <button type="button" className="nova-button" onClick={resetPairing}>ปิด / สร้างรายการใหม่</button>
          </div>
        </section>
      )}

      {receiver && (
        <section className="nova-panel pairing-flow-card">
          <span className="nova-pill">RECEIVING DEVICE</span>
          <h2>{receiver.status === "approved" ? "จับคู่อุปกรณ์สำเร็จ" : receiver.status === "expired" ? "QR หมดอายุ" : "รอการอนุมัติจากอุปกรณ์หลัก"}</h2>
          <p>{receiver.status === "approved" ? "การจับคู่ได้รับการยืนยันแล้ว แต่ไม่ได้เปิดใช้งานการจัดเก็บหรืออ่าน Credential" : receiver.status === "expired" ? "รายการจับคู่หมดอายุ กรุณาสแกน QR ใหม่" : "คำขอถูกผูกกับบัญชีที่เข้าสู่ระบบแล้ว รอผู้ใช้กดยืนยันบนอุปกรณ์ที่สร้าง QR"}</p>
          <div className="pairing-status-row"><span>สถานะ</span><strong>{receiver.status.toUpperCase()}</strong></div>
          <button type="button" className="nova-button" onClick={resetPairing}>กลับไปเริ่มใหม่</button>
        </section>
      )}

      <p className="pairing-footnote">การจับคู่นี้เป็นเพียงการอนุมัติ metadata ของอุปกรณ์ ไม่ใช่การเชื่อมต่อ Exness หรือการนำ API Key/Password เข้าระบบ</p>
    </div>
  );
}
