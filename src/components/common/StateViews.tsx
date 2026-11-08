import React from 'react';
import { Loader2, AlertCircle, Inbox, ShieldAlert, RefreshCw } from 'lucide-react';

export function LoadingSpinner({ label = 'กำลังโหลดข้อมูลจาก Exness Demo Read-Only Feed...' }: { label?: string }) {
  return (
    <div className="w-full min-h-[220px] flex flex-col items-center justify-center p-8 text-center bg-slate-900/40 rounded-2xl border border-slate-800/80">
      <Loader2 className="w-8 h-8 text-cyan-400 animate-spin mb-3" />
      <p className="text-sm text-slate-300 font-medium">{label}</p>
      <span className="text-xs text-slate-500 font-mono mt-1">Connecting to REST & MCP Data Pipeline...</span>
    </div>
  );
}

export function ErrorView({
  error,
  onRetry,
}: {
  error: string | Error;
  onRetry?: () => void;
}) {
  const message = typeof error === 'string' ? error : error?.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อ';
  return (
    <div className="w-full min-h-[200px] flex flex-col items-center justify-center p-8 text-center bg-rose-950/20 rounded-2xl border border-rose-500/20">
      <AlertCircle className="w-9 h-9 text-rose-400 mb-3" />
      <h4 className="text-sm font-semibold text-rose-200">ไม่สามารถเชื่อมต่อข้อมูลได้</h4>
      <p className="text-xs text-rose-300/80 max-w-md mt-1 font-mono break-all">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors border border-slate-700"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          ลองใหม่อีกครั้ง (Retry)
        </button>
      )}
    </div>
  );
}

export function EmptyStateView({
  title = 'ไม่พบข้อมูลในระบบ',
  message = 'ยังไม่มีบันทึกข้อมูลในหมวดหมู่นี้ หรือกำลังรอรอบการอัปเดตถัดไป',
  actionLabel,
  onAction,
}: {
  title?: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="w-full min-h-[200px] flex flex-col items-center justify-center p-8 text-center bg-slate-900/30 rounded-2xl border border-dashed border-slate-800">
      <Inbox className="w-9 h-9 text-slate-500 mb-3" />
      <h4 className="text-sm font-semibold text-slate-300">{title}</h4>
      <p className="text-xs text-slate-500 max-w-sm mt-1">{message}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function UnauthorizedView({
  message = 'ต้องเชื่อมต่อผ่าน Exness Demo Read-Only Token ที่ได้รับการยืนยันระดับ Tenant',
}: {
  message?: string;
}) {
  return (
    <div className="w-full min-h-[200px] flex flex-col items-center justify-center p-8 text-center bg-amber-950/20 rounded-2xl border border-amber-500/20">
      <ShieldAlert className="w-9 h-9 text-amber-400 mb-3" />
      <h4 className="text-sm font-semibold text-amber-200">จำกัดการเข้าถึงเฉพาะโหมด Read-Only</h4>
      <p className="text-xs text-amber-300/80 max-w-md mt-1 font-mono">{message}</p>
      <div className="mt-3 px-3 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-[11px] font-mono text-amber-300">
        STATUS: READ-ONLY ONLY · LIVE MUTATIONS DISABLED
      </div>
    </div>
  );
}
