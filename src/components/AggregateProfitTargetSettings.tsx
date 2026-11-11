import React, { useEffect, useState } from 'react';
import { apiClient } from '../services/apiClient';

type DemoConnection = {
  id: string;
  label: string;
  status: string;
  provider: string;
  environment: string;
};

type ConnectionResponse = {
  connections: DemoConnection[];
};

type TargetSettings = {
  targetUsd: string;
  pendingTargetUsd: string | null;
  configVersion: number;
  pendingConfigVersion: number | null;
  enabled: boolean;
  persisted: boolean;
  appliedImmediately?: boolean;
};

type TargetResponse = { settings: TargetSettings };

export default function AggregateProfitTargetSettings() {
  const [connections, setConnections] = useState<DemoConnection[]>([]);
  const [connectionId, setConnectionId] = useState('');
  const [targetUsd, setTargetUsd] = useState('100.00');
  const [pendingTargetUsd, setPendingTargetUsd] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiClient.getAggregateProfitConnections<ConnectionResponse>()
      .then((data) => {
        if (!active) return;
        const rows = Array.isArray(data?.connections) ? data.connections : [];
        setConnections(rows);
        if (rows.length) setConnectionId(rows[0].id);
      })
      .catch(() => {
        if (active) setError('โหลดรายการบัญชี Demo ไม่สำเร็จ กรุณาตรวจสอบการเข้าสู่ระบบ');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!connectionId) {
      setTargetUsd('100.00');
      setPendingTargetUsd(null);
      setEnabled(false);
      return;
    }
    let active = true;
    setError(null);
    apiClient.getAggregateProfitTarget<TargetResponse>(connectionId)
      .then((data) => {
        if (!active) return;
        const settings = data.settings;
        setTargetUsd(String(settings?.targetUsd ?? '100.00'));
        setPendingTargetUsd(settings?.pendingTargetUsd ?? null);
        setEnabled(settings?.enabled === true);
      })
      .catch(() => {
        if (active) setError('โหลดค่าเป้าหมายไม่สำเร็จ ตรวจสอบว่า Migration ถูกติดตั้งและบัญชีเป็นของผู้ใช้');
      });
    return () => { active = false; };
  }, [connectionId]);

  async function saveTarget(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!connectionId) return;
    const normalized = targetUsd.trim();
    if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(normalized)
      || !Number.isFinite(Number(normalized))
      || Number(normalized) <= 0
      || Number(normalized) > 1000000) {
      setError('กรอกเป้าหมายเป็นจำนวน USD มากกว่า 0 และไม่เกิน 1,000,000 (ทศนิยมไม่เกิน 2 ตำแหน่ง)');
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const result = await apiClient.setAggregateProfitTarget<TargetResponse>({
        brokerConnectionId: connectionId,
        targetUsd: normalized,
      });
      setTargetUsd(String(result.settings.targetUsd));
      setPendingTargetUsd(result.settings.pendingTargetUsd ?? null);
      setNotice(result.settings.appliedImmediately === false
        ? 'บันทึกเป้าหมายใหม่แล้ว จะเริ่มใช้หลังรอบปัจจุบันเสร็จสมบูรณ์'
        : 'บันทึกเป้าหมายกำไรรวมแล้ว');
    } catch {
      setError('บันทึกไม่สำเร็จ ตรวจสอบบัญชี Demo และสถานะ Migration');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="lg:col-span-2 p-6 rounded-3xl bg-[#0A101F] border border-cyan-500/30 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <span className="text-[11px] font-mono text-cyan-400 uppercase">NOVA · Basket Profit Target</span>
          <h2 className="text-base font-bold text-white mt-1">ตั้งค่าเป้าหมายกำไรรวม</h2>
          <p className="text-xs text-slate-400 mt-1">คำนวณเฉพาะ Position ของ NOVA ในบัญชี Exness Demo ที่เลือก ไม่รวมออเดอร์ Manual หรือ EA อื่น</p>
        </div>
        <span className="px-3 py-1.5 rounded-lg text-[11px] font-mono font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30">
          MONITOR / EXECUTION OFF
        </span>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">กำลังโหลดบัญชี Demo…</p>
      ) : connections.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-[#060A14] p-4 text-sm text-slate-300">
          ยังไม่พบบัญชี Exness MT5 Demo ที่เชื่อมกับผู้ใช้ จึงยังไม่สามารถบันทึกค่าเป้าหมายลงบัญชีได้
        </div>
      ) : (
        <form onSubmit={saveTarget} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <label htmlFor="nova-aggregate-demo-account" className="block text-xs text-slate-300 font-semibold">บัญชี Demo</label>
            <select
              id="nova-aggregate-demo-account"
              value={connectionId}
              onChange={(event) => setConnectionId(event.target.value)}
              className="w-full rounded-xl bg-[#060A14] border border-slate-700 text-white px-3 py-3 text-sm"
            >
              {connections.map((connection) => (
                <option key={connection.id} value={connection.id}>
                  {connection.label} · {connection.status}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label htmlFor="nova-aggregate-profit-target" className="block text-xs text-slate-300 font-semibold">เป้าหมายกำไรรวม (USD)</label>
            <input
              id="nova-aggregate-profit-target"
              type="number"
              min="0.01"
              max="1000000"
              step="0.01"
              value={targetUsd}
              onChange={(event) => setTargetUsd(event.target.value)}
              className="w-full rounded-xl bg-[#060A14] border border-slate-700 text-white px-3 py-3 text-lg font-mono"
              required
            />
            <p className="text-[11px] text-slate-500">ค่าเริ่มต้น 100.00 USD · ปรับได้สูงสุด 1,000,000 USD</p>
          </div>
          <div className="flex flex-col justify-end gap-2">
            <button
              type="submit"
              disabled={saving || !connectionId}
              className="w-full rounded-xl px-4 py-3 text-sm font-bold bg-cyan-500 text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
            >
              {saving ? 'กำลังบันทึก…' : 'บันทึกเป้าหมาย'}
            </button>
            <p className="text-[11px] text-slate-400">
              การบันทึกค่าไม่สั่งปิด Position และไม่เปิดใช้งานการส่งคำสั่ง
            </p>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div className="rounded-xl bg-[#060A14] border border-slate-800 p-3">
          <div className="text-slate-500">เป้าหมายปัจจุบัน</div>
          <div className="text-lg text-white font-mono mt-1">{targetUsd} USD</div>
        </div>
        <div className="rounded-xl bg-[#060A14] border border-slate-800 p-3">
          <div className="text-slate-500">เป้าหมายรอบถัดไป</div>
          <div className="text-lg text-white font-mono mt-1">{pendingTargetUsd ? `${pendingTargetUsd} USD` : '—'}</div>
        </div>
        <div className="rounded-xl bg-[#060A14] border border-slate-800 p-3">
          <div className="text-slate-500">สถานะการทำงาน</div>
          <div className="text-sm text-amber-300 font-bold mt-2">{enabled ? 'MONITOR ENABLED' : 'DISABLED'}</div>
        </div>
      </div>

      {error && <p role="alert" className="rounded-lg bg-rose-500/10 border border-rose-500/30 p-3 text-xs text-rose-200">{error}</p>}
      {notice && <p role="status" className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3 text-xs text-emerald-200">{notice}</p>}
      <p className="text-[11px] leading-relaxed text-slate-500">
        หมายเหตุ: หน้านี้บันทึกเฉพาะค่ากำหนดเป้าหมาย ระบบปิดกำไรอัตโนมัติยังไม่เปิดใช้งานจนกว่าจะผ่านการทดสอบ PostgreSQL, Backend Reconciliation และ Exness Demo Execution Safety Review
      </p>
    </section>
  );
}
