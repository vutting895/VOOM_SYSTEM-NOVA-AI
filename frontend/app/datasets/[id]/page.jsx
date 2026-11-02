'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../../lib/supabase-browser';

export default function DatasetResolverPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params?.id === 'string' ? params.id : '';
  const [state, setState] = useState('loading');
  const [dataset, setDataset] = useState(null);
  const [candles, setCandles] = useState([]);
  const [error, setError] = useState('');
  const [revoking, setRevoking] = useState(false);

  const load = useCallback(async () => {
    setState('loading');
    setError('');
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw new Error('authentication_not_configured');
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !data.session?.access_token) {
        router.replace('/login');
        return;
      }
      const response = await fetch('/api/datasets/' + encodeURIComponent(id), {
        headers: { Authorization: 'Bearer ' + data.session.access_token, Accept: 'application/json' },
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'dataset_unavailable');
      setDataset(payload.dataset);
      setCandles(payload.candles || []);
      setState('ready');
    } catch (err) {
      setError(err?.message || 'dataset_unavailable');
      setState('error');
    }
  }, [id, router]);

  useEffect(() => { if (id) void load(); }, [id, load]);

  async function revoke() {
    if (!window.confirm('ยกเลิก QR และลบไฟล์ Dataset นี้หรือไม่?')) return;
    setRevoking(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data } = await supabase.auth.getSession();
      const response = await fetch('/api/datasets/' + encodeURIComponent(id), {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + data.session.access_token },
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'dataset_revoke_failed');
      setState('revoked');
      setDataset(null);
      setCandles([]);
    } catch (err) {
      setError(err?.message || 'dataset_revoke_failed');
    } finally {
      setRevoking(false);
    }
  }

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 20px', color: 'var(--foreground, #111)' }}>
      <p style={{ opacity: 0.65, fontSize: 12, letterSpacing: 2 }}>NOVA / DATASET RESOLVER</p>
      <h1 style={{ fontSize: 30, marginBottom: 8 }}>Market Dataset</h1>
      {state === 'loading' && <p>กำลังตรวจสอบสิทธิ์และตรวจสอบ SHA-256…</p>}
      {state === 'error' && <p role="alert">ไม่สามารถเปิด Dataset ได้: {error}</p>}
      {state === 'revoked' && <p role="status">Dataset ถูกเพิกถอนแล้ว ลิงก์ QR นี้ใช้งานไม่ได้อีกต่อไป</p>}
      {state === 'ready' && dataset && <>
        <p>ตรวจสอบไฟล์สำเร็จ · SHA-256 ผ่าน · Decimal strings ไม่ถูกปัดเศษ</p>
        <section style={{ border: '1px solid #8886', borderRadius: 12, padding: 16, margin: '20px 0' }}>
          <h2>{dataset.symbol} · {dataset.timeframe}</h2>
          <p>Provider: {dataset.provider} · Rows: {dataset.row_count}</p>
          <p>ช่วงเวลา: {dataset.range_start} — {dataset.range_end}</p>
          <p style={{ overflowWrap: 'anywhere', fontSize: 12 }}>SHA-256: {dataset.sha256}</p>
          <p>Encoding: {dataset.numeric_encoding} · Compression: {dataset.compression}</p>
          <button type="button" onClick={() => navigator.clipboard.writeText(window.location.href)}>คัดลอก QR Payload URL</button>{' '}
          <button type="button" disabled={revoking} onClick={revoke}>{revoking ? 'กำลังเพิกถอน…' : 'เพิกถอน QR / Dataset'}</button>
        </section>
        <h2>ตัวอย่างข้อมูล (แสดงไม่เกิน 100 แท่ง)</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr>{['Timestamp','Open','High','Low','Close','Volume'].map((label) => <th key={label} style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #8886' }}>{label}</th>)}</tr></thead>
            <tbody>{candles.slice(0, 100).map((candle) => <tr key={candle.timestamp}>{[candle.timestamp,candle.open,candle.high,candle.low,candle.close,candle.volume].map((value, index) => <td key={index} style={{ padding: 8, borderBottom: '1px solid #8883', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{value}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </>}
    </main>
  );
}
