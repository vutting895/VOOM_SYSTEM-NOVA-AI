import React from "react";
import { useNavigate } from "react-router-dom";
import { Lock, ShieldAlert, ShieldCheck, X, ArrowRight } from "lucide-react";

interface BrokerConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function BrokerConnectionModal({ isOpen, onClose }: BrokerConnectionModalProps) {
  const navigate = useNavigate();
  if (!isOpen) return null;

  const handleContinue = () => {
    onClose();
    navigate("/login");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xl">
      <div className="relative w-full max-w-lg rounded-3xl bg-slate-900 border border-slate-700 p-6 sm:p-8 shadow-2xl text-slate-100">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close broker information"
          className="absolute top-5 right-5 p-2 rounded-full bg-slate-800 border border-slate-700 text-slate-400 hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="text-center space-y-2 mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Lock className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-white">Exness MT5 Demo Gateway</h2>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            เชื่อมข้อมูลผ่าน Tenant MT5 Bridge ที่ได้รับการ provision แล้ว โดย NOVA ใช้สิทธิ์ Read-Only เท่านั้น
          </p>
        </div>

        <div className="rounded-2xl bg-slate-950 border border-slate-800 p-4 space-y-3 text-xs">
          <div className="flex justify-between gap-3">
            <span className="text-slate-500">Environment</span>
            <span className="text-slate-200 font-semibold">Exness Demo · MT5</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-slate-500">Connection status</span>
            <span className="text-amber-300 font-semibold">Requires authenticated API verification</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-slate-500">Permissions</span>
            <span className="text-cyan-300">Market / Account / History Read-only</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-slate-500">Execution</span>
            <span className="text-rose-400 font-bold">DISABLED</span>
          </div>
        </div>

        <div className="mt-5 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-200 text-xs leading-relaxed flex gap-2.5">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            ห้ามกรอกรหัสผ่าน MT5, API Secret หรือ Private Key ในหน้าเว็บ ระบบไม่เก็บ Broker Secret ใน Frontend และจะไม่แสดงว่าเชื่อมต่อสำเร็จจนกว่าจะได้รับผลตรวจจาก Bridge จริง
          </span>
        </div>

        <button
          type="button"
          onClick={handleContinue}
          className="mt-6 w-full py-3.5 px-4 rounded-2xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold text-sm transition-colors flex items-center justify-center gap-2"
        >
          <ShieldCheck className="w-4 h-4" />
          เข้าสู่ระบบ NOVA เพื่อยืนยันบัญชี Demo
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
