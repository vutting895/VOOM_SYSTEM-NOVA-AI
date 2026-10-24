import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

type Props = {
  supabase: SupabaseClient;
  apiBaseUrl: string; // e.g. https://voom-alpaca-oauth.<account>.workers.dev
};

type AccountResult = {
  connected: boolean;
  environment?: string;
  account?: {
    status?: string;
    currency?: string;
    cash?: string;
    portfolio_value?: string;
    buying_power?: string;
    equity?: string;
  };
  error?: string;
};

export function AlpacaConnect({ supabase, apiBaseUrl }: Props) {
  const [account, setAccount] = useState<AccountResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function getAccessToken() {
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (!data.session?.access_token) throw new Error("กรุณาเข้าสู่ระบบก่อนเชื่อม Alpaca");
    return data.session.access_token;
  }

  async function loadAccount() {
    setError("");
    try {
      const token = await getAccessToken();
      const response = await fetch(`${apiBaseUrl}/api/alpaca/account`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "โหลดข้อมูลบัญชีไม่สำเร็จ");
      setAccount(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    }
  }

  async function connect() {
    setBusy(true);
    setError("");
    try {
      const token = await getAccessToken();
      const response = await fetch(`${apiBaseUrl}/api/alpaca/connect`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok || !data.authorization_url) throw new Error(data.error || "เริ่มเชื่อมต่อไม่สำเร็จ");
      window.location.assign(data.authorization_url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError("");
    try {
      const token = await getAccessToken();
      const response = await fetch(`${apiBaseUrl}/api/alpaca/disconnect`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "ยกเลิกการเชื่อมต่อไม่สำเร็จ");
      setAccount({ connected: false, environment: "paper" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get("alpaca");
    if (status === "connected") void loadAccount();
    else if (status && status !== "connected") setError(`การเชื่อมต่อ Alpaca ไม่สำเร็จ: ${status}`);
    else void loadAccount();
    // The component expects supabase and apiBaseUrl to remain stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section aria-labelledby="alpaca-heading" className="rounded-xl border p-5 space-y-4">
      <div>
        <h2 id="alpaca-heading" className="text-lg font-semibold">เชื่อมต่อ Alpaca</h2>
        <p className="text-sm text-gray-500">Paper Trading เท่านั้น — ใช้เงินจำลอง ไม่ใช่บัญชีเงินจริง</p>
      </div>
      {account?.connected ? (
        <div className="space-y-2 text-sm">
          <p>สถานะ: เชื่อมต่อแล้ว ({account.environment || "paper"})</p>
          {account.account && <>
            <p>สถานะบัญชี: {account.account.status ?? "—"}</p>
            <p>มูลค่าพอร์ต: {account.account.portfolio_value ?? "—"} {account.account.currency ?? ""}</p>
            <p>เงินสด: {account.account.cash ?? "—"} {account.account.currency ?? ""}</p>
            <p>Buying power: {account.account.buying_power ?? "—"} {account.account.currency ?? ""}</p>
          </>}
          <button type="button" disabled={busy} onClick={loadAccount} className="rounded-lg border px-4 py-2">
            รีเฟรชข้อมูล
          </button>
          <button type="button" disabled={busy} onClick={disconnect} className="rounded-lg border px-4 py-2">
            ยกเลิกการเชื่อมต่อ
          </button>
        </div>
      ) : (
        <button type="button" disabled={busy} onClick={connect} className="rounded-lg bg-black text-white px-4 py-2 disabled:opacity-50">
          {busy ? "กำลังดำเนินการ…" : "เชื่อมบัญชี Alpaca (Paper)"}
        </button>
      )}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </section>
  );
}
