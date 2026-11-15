import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  BookmarkCheck,
  BrainCircuit,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Lightbulb,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react';

type Answers = {
  positionSize: string;
  stopLoss: string;
  takeProfit: string;
  rationale: string;
};

const initialAnswers: Answers = {
  positionSize: '',
  stopLoss: '',
  takeProfit: '',
  rationale: '',
};

const draftKey = 'nova-learning-worksheet-risk-planning';

export default function LearningWorksheetView() {
  const [answers, setAnswers] = useState<Answers>(initialAnswers);
  const [saved, setSaved] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    try {
      const storedDraft = window.localStorage.getItem(draftKey);
      if (storedDraft) setAnswers({ ...initialAnswers, ...JSON.parse(storedDraft) });
    } catch {
      // Ignore unavailable storage or invalid draft data; the worksheet remains usable.
    }
  }, []);

  const updateAnswer = (field: keyof Answers, value: string) => {
    setAnswers((current) => ({ ...current, [field]: value }));
    setSaved(false);
    setSubmitted(false);
  };

  const saveDraft = () => {
    try {
      window.localStorage.setItem(draftKey, JSON.stringify(answers));
      setSaved(true);
    } catch {
      setSaved(false);
    }
  };

  const submitAnswers = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
  };

  const fieldClassName =
    'mt-2 w-full rounded-xl border border-white/[0.09] bg-[#080d16] px-3.5 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/10';

  return (
    <main className="min-h-screen bg-[#080b12] text-slate-100">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -right-40 -top-40 h-96 w-96 rounded-full bg-cyan-500/[0.07] blur-3xl" />
        <div className="absolute -left-40 top-[45%] h-96 w-96 rounded-full bg-violet-500/[0.05] blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              to="/learning"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.09] bg-white/[0.03] text-slate-300 transition hover:border-white/20 hover:text-white"
              aria-label="กลับไป Learning Universe"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/[0.08] text-cyan-300">
              <BrainCircuit className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-300">NOVA · Learning Universe</p>
              <p className="mt-0.5 text-xs text-slate-500">ห้องเรียนจำลอง · Risk Management</p>
            </div>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-1.5 text-xs text-emerald-300">
            <ShieldCheck className="h-3.5 w-3.5" />
            โหมดเรียนรู้ · ไม่มีการส่งคำสั่งซื้อขาย
          </div>
        </header>

        <section className="mb-6 overflow-hidden rounded-3xl border border-white/[0.08] bg-[#101722] shadow-2xl shadow-black/20">
          <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[1fr_auto] lg:items-end lg:p-8">
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                <span>Learning path</span><span className="text-slate-700">/</span><span>Module 04</span><span className="text-slate-700">/</span><span className="text-cyan-300">Worksheet</span>
              </div>
              <h1 className="max-w-3xl text-2xl font-bold tracking-tight text-white sm:text-3xl">วางแผนความเสี่ยงก่อนเข้าเทรด</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">ฝึกประเมินขนาดสถานะและกำหนดจุดตัดขาดทุนจากสถานการณ์จำลอง โดยยึดเงินทุนที่ยอมรับความเสี่ยงได้เป็นหลัก</p>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-black/20 px-4 py-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400/10 text-amber-300"><Clock3 className="h-5 w-5" /></div>
              <div><p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">เวลาที่ใช้</p><p className="mt-1 text-sm font-semibold text-slate-200">ประมาณ 15 นาที</p></div>
            </div>
          </div>
          <div className="border-t border-white/[0.06] px-5 py-4 sm:px-7 lg:px-8">
            <div className="mb-2 flex items-center justify-between text-xs"><span className="text-slate-400">ความคืบหน้าบทเรียน</span><span className="font-mono text-cyan-300">3 จาก 5 ขั้นตอน · 60%</span></div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]"><div className="h-full w-3/5 rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400" /></div>
          </div>
        </section>

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <section className="rounded-2xl border border-white/[0.08] bg-[#101722] p-5 sm:p-6">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-400/10 text-violet-300"><Target className="h-4 w-4" /></div><div><h2 className="text-sm font-semibold text-white">สถานการณ์จำลอง</h2><p className="mt-0.5 text-xs text-slate-500">อ่านข้อมูลแล้ววางแผนการจัดการความเสี่ยง</p></div></div>
                <span className="rounded-full border border-violet-400/20 bg-violet-400/[0.07] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-violet-300">Case study 01</span>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-[#0b111b] p-4 sm:p-5">
                <p className="text-sm leading-7 text-slate-300">ETH/USD กำลังเคลื่อนไหวในช่วงที่มีความผันผวนสูง หลังราคาปรับขึ้นต่อเนื่อง แต่ทิศทางระยะสั้นยังไม่ยืนยัน คุณมีเงินทุนจำลอง <strong className="font-semibold text-white">$10,000</strong> และต้องจำกัดความเสี่ยงของแนวคิดนี้ไว้ไม่เกิน <strong className="font-semibold text-amber-300">1% ของพอร์ต</strong></p>
                <p className="mt-3 text-sm leading-7 text-slate-400">ระบุขนาดสถานะและระดับหยุดขาดทุนที่คุณคิดว่าเหมาะสม พร้อมอธิบายเงื่อนไขที่จะทำให้คุณยกเลิกแนวคิดนี้</p>
              </div>
              <button type="button" onClick={() => setShowHint((visible) => !visible)} className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-cyan-300 transition hover:text-cyan-200">
                <Lightbulb className="h-4 w-4" /> ดูคำใบ้ <ChevronDown className={`h-3.5 w-3.5 transition ${showHint ? 'rotate-180' : ''}`} />
              </button>
              {showHint && <div className="mt-3 rounded-xl border border-cyan-400/15 bg-cyan-400/[0.05] p-4 text-xs leading-6 text-slate-300">เริ่มจากคำนวณจำนวนเงินที่ยอมเสียได้สูงสุดจากเงินทุน จากนั้นพิจารณาระยะ Stop Loss และขนาดสถานะร่วมกัน อย่าลืมว่าอัตราส่วนผลตอบแทนต่อความเสี่ยงไม่ได้รับประกันผลลัพธ์จริง</div>}
            </section>

            <form onSubmit={submitAnswers} className="rounded-2xl border border-white/[0.08] bg-[#101722] p-5 sm:p-6">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div><h2 className="text-sm font-semibold text-white">คำตอบของคุณ</h2><p className="mt-1 text-xs text-slate-500">กรอกคำตอบเพื่อรับข้อเสนอแนะสำหรับการเรียนรู้</p></div>
                <span className="hidden items-center gap-1.5 text-[11px] text-slate-500 sm:inline-flex"><BookmarkCheck className="h-3.5 w-3.5" />บันทึกในอุปกรณ์นี้</span>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-medium text-slate-300">ขนาดสถานะ (จำลอง)
                  <div className="relative"><input required inputMode="decimal" value={answers.positionSize} onChange={(event) => updateAnswer('positionSize', event.target.value)} className={`${fieldClassName} pr-16`} placeholder="เช่น 0.10" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">หน่วย</span></div>
                </label>
                <label className="text-xs font-medium text-slate-300">Stop Loss
                  <div className="relative"><input required value={answers.stopLoss} onChange={(event) => updateAnswer('stopLoss', event.target.value)} className={`${fieldClassName} pr-12`} placeholder="เช่น 1.8%" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">%</span></div>
                </label>
                <label className="text-xs font-medium text-slate-300">เป้าหมาย (ไม่บังคับ)
                  <div className="relative"><input value={answers.takeProfit} onChange={(event) => updateAnswer('takeProfit', event.target.value)} className={`${fieldClassName} pr-12`} placeholder="เช่น 3.6%" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">%</span></div>
                </label>
                <div className="rounded-xl border border-amber-400/15 bg-amber-400/[0.04] p-3.5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-amber-200"><ShieldCheck className="h-4 w-4" />กรอบความเสี่ยงของโจทย์</div>
                  <p className="mt-2 text-xs leading-5 text-slate-400">เงินทุน $10,000 · ความเสี่ยงสูงสุดตามโจทย์ $100</p>
                  <p className="mt-1 text-[10px] text-slate-500">ตัวเลขเป็นข้อมูลจำลองเพื่อการศึกษา</p>
                </div>
              </div>

              <label className="mt-4 block text-xs font-medium text-slate-300">เหตุผลและเงื่อนไขยกเลิกแผน
                <textarea required minLength={10} rows={5} value={answers.rationale} onChange={(event) => updateAnswer('rationale', event.target.value)} className={`${fieldClassName} resize-y leading-6`} placeholder="อธิบายวิธีคิด ความเสี่ยงที่เห็น และเงื่อนไขที่จะทำให้คุณไม่เข้าแผนนี้..." />
              </label>

              <div className="mt-5 flex flex-col-reverse gap-3 border-t border-white/[0.06] pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p aria-live="polite" className="text-xs text-emerald-300">{saved ? <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5" />บันทึกฉบับร่างแล้ว</span> : 'คำตอบจะถูกเก็บไว้ในอุปกรณ์นี้เมื่อกดบันทึก'}</p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button type="button" onClick={saveDraft} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.03] px-4 py-2.5 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.07]"><BookmarkCheck className="h-4 w-4" />บันทึกฉบับร่าง</button>
                  <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-xs font-bold text-slate-950 transition hover:bg-cyan-300"><Sparkles className="h-4 w-4" />ส่งเพื่อดู feedback <ArrowRight className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            </form>

            {submitted && <section aria-live="polite" className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.05] p-5 sm:p-6">
              <div className="flex items-start gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300"><CheckCircle2 className="h-5 w-5" /></div><div><h2 className="text-sm font-semibold text-white">ส่งคำตอบเพื่อทบทวนแล้ว</h2><p className="mt-1 text-xs leading-5 text-slate-400">นี่เป็นตัวอย่าง feedback ฝั่งหน้าจอเพื่อการเรียนรู้ ยังไม่ได้ส่งคำตอบไปยังบริการ AI</p></div></div>
              <div className="mt-4 rounded-xl border border-white/[0.06] bg-[#0b111b] p-4 text-sm leading-6 text-slate-300"><div className="mb-2 flex items-center gap-2 text-xs font-semibold text-emerald-300"><MessageSquareText className="h-4 w-4" />แนวทางทบทวนจาก NOVA</div>ลองตรวจสอบว่าขนาดสถานะและระยะ Stop Loss สอดคล้องกับวงเงินความเสี่ยง $100 หรือไม่ หากยังไม่สามารถอธิบายจุดที่ทำให้สมมติฐานผิดได้ ให้กลับไปทบทวนความเสี่ยงก่อนกำหนดเป้าหมายผลตอบแทน</div>
            </section>}
          </div>

          <aside className="space-y-5 xl:sticky xl:top-6">
            <section className="rounded-2xl border border-white/[0.08] bg-[#101722] p-5">
              <div className="mb-4 flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300"><TrendingUp className="h-4 w-4" /></div><div><h2 className="text-sm font-semibold text-white">ข้อมูลตลาดจำลอง</h2><p className="mt-0.5 text-[11px] text-slate-500">Scenario data · ไม่ใช่ข้อมูลเรียลไทม์</p></div></div>
              <div className="rounded-xl border border-white/[0.07] bg-[#0b111b] p-4"><div className="flex items-center justify-between"><div><p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">สินทรัพย์</p><p className="mt-1 text-lg font-bold text-white">ETH / USD</p></div><span className="rounded-full border border-amber-400/20 bg-amber-400/[0.06] px-2.5 py-1 text-[10px] text-amber-300">ผันผวนสูง</span></div></div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-white/[0.07] bg-[#0b111b] p-3.5"><p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">ราคาอ้างอิง</p><p className="mt-1.5 font-mono text-base font-semibold text-white">$3,420</p></div>
                <div className="rounded-xl border border-white/[0.07] bg-[#0b111b] p-3.5"><p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">เงินทุนจำลอง</p><p className="mt-1.5 font-mono text-base font-semibold text-white">$10,000</p></div>
                <div className="rounded-xl border border-white/[0.07] bg-[#0b111b] p-3.5"><p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Risk cap</p><p className="mt-1.5 font-mono text-base font-semibold text-amber-300">1.00%</p></div>
                <div className="rounded-xl border border-white/[0.07] bg-[#0b111b] p-3.5"><p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">ขาดทุนสูงสุด</p><p className="mt-1.5 font-mono text-base font-semibold text-white">$100</p></div>
              </div>
              <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-cyan-400/10 bg-cyan-400/[0.04] p-3.5"><Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" /><p className="text-[11px] leading-5 text-slate-400">ข้อมูลทั้งหมดเป็นสถานการณ์จำลองสำหรับบทเรียน ไม่ควรใช้เป็นคำแนะนำหรือสัญญาณการลงทุน</p></div>
            </section>

            <section className="rounded-2xl border border-white/[0.08] bg-[#101722] p-5">
              <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">สิ่งที่ได้ฝึก</h2>
              <ul className="mt-4 space-y-3 text-xs text-slate-400">
                <li className="flex gap-2.5"><CheckCircle2 className="h-4 w-4 shrink-0 text-cyan-300" />กำหนดวงเงินความเสี่ยงจากเงินทุน</li>
                <li className="flex gap-2.5"><CheckCircle2 className="h-4 w-4 shrink-0 text-cyan-300" />อธิบายความสัมพันธ์ของขนาดสถานะกับ Stop Loss</li>
                <li className="flex gap-2.5"><CheckCircle2 className="h-4 w-4 shrink-0 text-cyan-300" />วางเงื่อนไขยกเลิกแผนเมื่อสมมติฐานไม่เป็นจริง</li>
              </ul>
              <Link to="/learning" className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-cyan-300 transition hover:text-cyan-200">กลับไป Learning Universe <ArrowRight className="h-3.5 w-3.5" /></Link>
            </section>
          </aside>
        </div>

        <footer className="mt-8 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-t border-white/[0.06] pt-5 text-center text-[10px] text-slate-600"><ShieldCheck className="h-3.5 w-3.5" />การเรียนรู้นี้เป็นแบบจำลองเพื่อการศึกษาเท่านั้น · ไม่มีการเชื่อมต่อโบรกเกอร์หรือส่งคำสั่งเทรด</footer>
      </div>
    </main>
  );
}
