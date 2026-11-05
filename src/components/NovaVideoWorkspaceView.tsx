import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  Film,
  LockKeyhole,
  Play,
  ShieldCheck,
  Sparkles,
  Video,
} from 'lucide-react';
import { createDirectorPlan } from '../../integrations/nova-video-engine/director-intelligence.mjs';
import { createVideoProductionPlan } from '../../integrations/nova-video-api/video-production-planner.js';

type CreativeGoal = 'product_ad' | 'explainer' | 'story' | 'brand_film';
type AspectRatio = '9:16' | '16:9' | '1:1';

interface CreativeBrief {
  title: string;
  concept: string;
  audience: string;
  platform: string;
  language: string;
  style: string;
  callToAction: string;
  durationSeconds: number;
  aspectRatio: AspectRatio;
  goal: CreativeGoal;
  verifiedFacts: string[];
  mustAvoid: string[];
}

interface DirectorScene {
  sceneId: string;
  order: number;
  beat: string;
  startFrame: number;
  frameCount: number;
  endFrameExclusive: number;
  durationSeconds: number;
  visualPrompt: string;
  negativePrompt: string;
  framing: string;
  cameraMovement: string;
  lighting: string;
  transition: string;
  voiceover: string;
  caption: string;
}

interface DirectorPlan {
  schemaVersion: string;
  engine: string;
  plannerVersion: string;
  generatedBy: string;
  title: string;
  goal: string;
  language: string;
  audience: string;
  platform: string;
  aspectRatio: AspectRatio;
  frameRate: number;
  durationSeconds: number;
  totalFrames: number;
  scenes: DirectorScene[];
  executionEnabled: false;
  estimatedCost: 0;
}

interface ProductionPlan {
  schemaVersion: string;
  generationTasks: Array<{
    taskId: string;
    sceneId: string;
    order: number;
    state: string;
    task: {
      modelCandidate: string;
      mode: string;
      prompt: string;
      negativePrompt: string;
      width: number;
      height: number;
      frameRate: number;
      durationSeconds: number;
      frameCount: number;
      executionEnabled: false;
      estimatedCost: 0;
    };
  }>;
  stages: Array<{ id: string; status: string; dependsOn: string[] }>;
  executionEnabled: false;
  estimatedCost: 0;
  requiresHumanApproval: true;
  status: string;
}

interface StudioDraft {
  brief: CreativeBrief;
  directorPlan: DirectorPlan;
  productionPlan: ProductionPlan;
  generatedAt: string;
}

const initialBrief: CreativeBrief = {
  title: 'NOVA Product Film',
  concept: 'A premium ceramic coffee cup on a quiet morning table, warm sunlight and gentle steam',
  audience: 'Coffee lovers and design-conscious customers',
  platform: 'TikTok / Reels / YouTube Shorts',
  language: 'th',
  style: 'Cinematic product film, warm premium lighting, elegant and minimal',
  callToAction: 'Discover the collection',
  durationSeconds: 15,
  aspectRatio: '9:16',
  goal: 'product_ad',
  verifiedFacts: [],
  mustAvoid: ['Unverified claims', 'Watermarks', 'Unapproved logos'],
};

function splitLines(value: string, maxItems: number, maxLength: number): string[] {
  return value.split('\n').map((item) => item.trim()).filter(Boolean).slice(0, maxItems).map((item) => item.slice(0, maxLength));
}

function formatTime(frame: number): string {
  return (frame / 24).toFixed(2) + 's';
}

function safeFileName(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9ก-๙]+/g, '-').replace(/^-+|-+$/g, '');
  return (normalized || 'nova-video-storyboard').slice(0, 64);
}

function downloadJson(filename: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function NovaVideoWorkspaceView() {
  const [brief, setBrief] = useState<CreativeBrief>(initialBrief);
  const [factsText, setFactsText] = useState('');
  const [mustAvoidText, setMustAvoidText] = useState(initialBrief.mustAvoid.join('\n'));
  const [draft, setDraft] = useState<StudioDraft | null>(null);
  const [error, setError] = useState<string | null>(null);

  function updateBrief<K extends keyof CreativeBrief>(key: K, value: CreativeBrief[K]) {
    setBrief((current) => ({ ...current, [key]: value }));
  }

  function buildStoryboard(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      const payload: CreativeBrief = {
        ...brief,
        durationSeconds: Number(brief.durationSeconds),
        verifiedFacts: splitLines(factsText, 12, 240),
        mustAvoid: splitLines(mustAvoidText, 20, 160),
      };
      const directorPlan = createDirectorPlan(payload) as DirectorPlan;
      const productionPlan = createVideoProductionPlan(directorPlan) as ProductionPlan;
      setDraft({
        brief: payload,
        directorPlan,
        productionPlan,
        generatedAt: new Date().toISOString(),
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'ไม่สามารถสร้างแผนได้';
      setError(message);
      setDraft(null);
    }
  }

  function exportDraft() {
    if (!draft) return;
    const exportPayload = {
      schemaVersion: 'nova.video-studio-export.v1',
      generatedAt: draft.generatedAt,
      brief: draft.brief,
      directorPlan: draft.directorPlan,
      productionPlan: draft.productionPlan,
      safety: {
        mode: 'local_draft_only',
        executionEnabled: false,
        estimatedCost: 0,
        requiresHumanApproval: true,
        generationStatus: 'blocked_no_free_gpu',
        modelInferencePerformed: false,
        mediaCreated: false,
      },
    };
    downloadJson(safeFileName(draft.brief.title) + '-storyboard.json', exportPayload);
  }

  const sceneCount = draft?.directorPlan.scenes.length ?? 0;
  const totalFrames = draft?.directorPlan.totalFrames ?? 0;

  return (
    <main className="min-h-screen bg-[#080B14] text-slate-100 px-3 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-3xl border border-cyan-500/25 bg-gradient-to-r from-[#0C1426] via-[#10172B] to-[#0B1020] p-5 sm:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 shadow-lg shadow-cyan-500/20">
                <Film className="h-6 w-6 text-white" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-mono uppercase tracking-[0.2em] text-cyan-300">VOOM SYSTEM · NOVA</p>
                  <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[10px] font-bold text-amber-200">LOCAL DRAFT ONLY</span>
                </div>
                <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">NOVA Video Director Studio</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                  สร้าง Creative Brief, Storyboard 24 FPS, scene prompts และ Production Plan ด้วย NOVA Director/Engine ที่อยู่ใน Repository
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs font-mono text-emerald-200">Cost: $0</span>
              <span className="rounded-xl border border-slate-600/60 bg-slate-900/70 px-3 py-2 text-xs font-mono text-slate-300">24 FPS</span>
              <span className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs font-mono text-rose-200">Render: OFF</span>
            </div>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.35fr)]">
          <form onSubmit={buildStoryboard} className="space-y-4 rounded-3xl border border-slate-800 bg-[#0D1322] p-5">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <Sparkles className="h-4 w-4 text-cyan-300" />
              <h2 className="text-base font-bold text-white">Creative Brief</h2>
            </div>

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-300">ชื่อโปรเจกต์</span>
              <input value={brief.title} maxLength={120} onChange={(e) => updateBrief('title', e.target.value)} required className="w-full rounded-xl border border-slate-700 bg-[#080D18] px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400" />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-300">Concept / สิ่งที่ต้องการเล่า</span>
              <textarea value={brief.concept} maxLength={1200} rows={4} required onChange={(e) => updateBrief('concept', e.target.value)} className="w-full resize-y rounded-xl border border-slate-700 bg-[#080D18] px-3 py-2.5 text-sm leading-6 text-white outline-none focus:border-cyan-400" />
            </label>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-slate-300">ประเภทวิดีโอ</span>
                <select value={brief.goal} onChange={(e) => updateBrief('goal', e.target.value as CreativeGoal)} className="w-full rounded-xl border border-slate-700 bg-[#080D18] px-3 py-2.5 text-sm text-white">
                  <option value="product_ad">Product Advertisement</option>
                  <option value="explainer">Explainer</option>
                  <option value="story">Story</option>
                  <option value="brand_film">Brand Film</option>
                </select>
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-slate-300">สัดส่วนภาพ</span>
                <select value={brief.aspectRatio} onChange={(e) => updateBrief('aspectRatio', e.target.value as AspectRatio)} className="w-full rounded-xl border border-slate-700 bg-[#080D18] px-3 py-2.5 text-sm text-white">
                  <option value="9:16">9:16 · Shorts / Reels / TikTok</option>
                  <option value="16:9">16:9 · YouTube</option>
                  <option value="1:1">1:1 · Square</option>
                </select>
              </label>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-slate-300">ความยาว (วินาที)</span>
                <input type="number" min={3} max={60} step={1} value={brief.durationSeconds} onChange={(e) => updateBrief('durationSeconds', Number(e.target.value))} className="w-full rounded-xl border border-slate-700 bg-[#080D18] px-3 py-2.5 text-sm text-white" />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-slate-300">ภาษา</span>
                <select value={brief.language} onChange={(e) => updateBrief('language', e.target.value)} className="w-full rounded-xl border border-slate-700 bg-[#080D18] px-3 py-2.5 text-sm text-white">
                  <option value="th">ไทย</option>
                  <option value="en">English</option>
                </select>
              </label>
            </div>

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-300">Audience</span>
              <input value={brief.audience} maxLength={240} onChange={(e) => updateBrief('audience', e.target.value)} className="w-full rounded-xl border border-slate-700 bg-[#080D18] px-3 py-2.5 text-sm text-white" />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-300">Visual Style</span>
              <input value={brief.style} maxLength={240} onChange={(e) => updateBrief('style', e.target.value)} className="w-full rounded-xl border border-slate-700 bg-[#080D18] px-3 py-2.5 text-sm text-white" />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-300">Platform</span>
              <input value={brief.platform} maxLength={120} onChange={(e) => updateBrief('platform', e.target.value)} className="w-full rounded-xl border border-slate-700 bg-[#080D18] px-3 py-2.5 text-sm text-white" />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-300">Call to Action</span>
              <input value={brief.callToAction} maxLength={240} onChange={(e) => updateBrief('callToAction', e.target.value)} className="w-full rounded-xl border border-slate-700 bg-[#080D18] px-3 py-2.5 text-sm text-white" />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-300">Verified Facts (หนึ่งรายการต่อบรรทัด)</span>
              <textarea value={factsText} maxLength={2400} rows={3} onChange={(e) => setFactsText(e.target.value)} placeholder="วัสดุเซรามิก\nผลิตในประเทศไทย" className="w-full resize-y rounded-xl border border-slate-700 bg-[#080D18] px-3 py-2.5 text-sm text-white" />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-300">Must Avoid (หนึ่งรายการต่อบรรทัด)</span>
              <textarea value={mustAvoidText} maxLength={3200} rows={3} onChange={(e) => setMustAvoidText(e.target.value)} className="w-full resize-y rounded-xl border border-slate-700 bg-[#080D18] px-3 py-2.5 text-sm text-white" />
            </label>

            {error && (
              <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
                {error}
              </div>
            )}

            <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-cyan-500/15 transition hover:brightness-110">
              <Sparkles className="h-4 w-4" />
              สร้าง Storyboard & Production Plan
            </button>
            <p className="text-[11px] leading-5 text-slate-500">
              ทำงานในเบราว์เซอร์ด้วย NOVA Director rules เท่านั้น ไม่มีการส่งข้อมูลไป Backend, LLM หรือ Video Model
            </p>
          </form>

          <div className="space-y-4">
            <div className="rounded-3xl border border-amber-500/25 bg-amber-500/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
                <div className="space-y-1">
                  <h2 className="text-sm font-bold text-amber-100">Generation remains locked</h2>
                  <p className="text-xs leading-5 text-slate-300">
                    นี่คือ Storyboard/Production Plan ไม่ใช่ไฟล์วิดีโอจริง การสร้าง Motion Video ยังปิดอยู่จนกว่าจะยืนยัน GPU แบบไม่มีค่าใช้จ่าย, model/checkpoint, License และผ่าน Security Review
                  </p>
                </div>
              </div>
            </div>

            {!draft ? (
              <div className="flex min-h-[420px] flex-col items-center justify-center rounded-3xl border border-dashed border-slate-700 bg-[#0D1322] p-8 text-center">
                <Video className="h-10 w-10 text-slate-600" />
                <h2 className="mt-4 text-lg font-bold text-white">พร้อมสร้าง Director Draft</h2>
                <p className="mt-2 max-w-md text-sm leading-6 text-slate-400">
                  กรอก Creative Brief แล้วสร้าง scene timeline, camera direction, lighting, continuity และ Engine task contracts
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    { label: 'SCENES', value: String(sceneCount) },
                    { label: 'DURATION', value: draft.directorPlan.durationSeconds + 's' },
                    { label: 'TOTAL FRAMES', value: String(totalFrames) },
                    { label: 'FRAME RATE', value: draft.directorPlan.frameRate + ' FPS' },
                  ].map((item) => (
                    <div key={item.label} className="rounded-2xl border border-slate-800 bg-[#0D1322] p-3">
                      <p className="text-[10px] font-mono tracking-wider text-slate-500">{item.label}</p>
                      <p className="mt-1 text-lg font-bold text-white">{item.value}</p>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-[#0D1322] p-4">
                  <div>
                    <h2 className="text-sm font-bold text-white">Storyboard · {draft.brief.title}</h2>
                    <p className="mt-1 text-[11px] text-slate-500">Generated {new Date(draft.generatedAt).toLocaleString()}</p>
                  </div>
                  <button type="button" onClick={exportDraft} className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-bold text-cyan-200 hover:bg-cyan-500/20">
                    <ArrowDownToLine className="h-4 w-4" />
                    Export JSON
                  </button>
                </div>

                <div className="space-y-3">
                  {draft.directorPlan.scenes.map((scene) => {
                    const task = draft.productionPlan.generationTasks.find((item) => item.sceneId === scene.sceneId);
                    return (
                      <article key={scene.sceneId} className="rounded-2xl border border-slate-800 bg-[#0D1322] p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/10 text-xs font-bold text-cyan-200">{scene.order}</span>
                            <h3 className="text-sm font-bold text-white">{scene.beat.replaceAll('_', ' ').toUpperCase()}</h3>
                          </div>
                          <span className="rounded-lg bg-slate-800 px-2 py-1 text-[10px] font-mono text-slate-300">{formatTime(scene.startFrame)} → {formatTime(scene.endFrameExclusive)} · {scene.frameCount} frames</span>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {[
                            ['Framing', scene.framing],
                            ['Camera', scene.cameraMovement],
                            ['Lighting', scene.lighting],
                            ['Transition', scene.transition],
                          ].map(([label, value]) => (
                            <div key={label} className="rounded-lg bg-[#080D18] p-2">
                              <p className="text-[10px] text-slate-500">{label}</p>
                              <p className="mt-1 break-words text-[11px] font-semibold text-slate-200">{value.replaceAll('_', ' ')}</p>
                            </div>
                          ))}
                        </div>
                        <p className="mt-3 text-xs leading-5 text-slate-300">{scene.visualPrompt}</p>
                        {scene.caption && <p className="mt-2 text-xs text-cyan-200">Caption: {scene.caption}</p>}
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-3 text-[10px]">
                          <span className="text-slate-500">{task?.task.mode.replaceAll('_', ' ')} · {task?.task.width}×{task?.task.height} · {task?.task.frameRate} FPS</span>
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-amber-200">
                            <LockKeyhole className="h-3 w-3" /> BLOCKED · NO FREE GPU
                          </span>
                        </div>
                      </article>
                    );
                  })}
                </div>

                <div className="rounded-2xl border border-slate-800 bg-[#0D1322] p-4">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-300" />
                    <h3 className="text-sm font-bold text-white">Safety & Delivery Gates</h3>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {draft.productionPlan.stages.map((stage) => (
                      <div key={stage.id} className="flex items-center justify-between gap-3 rounded-xl bg-[#080D18] px-3 py-2">
                        <span className="text-xs text-slate-300">{stage.id.replaceAll('_', ' ')}</span>
                        <span className="text-[10px] font-mono text-amber-200">{stage.status.replaceAll('_', ' ')}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button type="button" disabled className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-xs font-bold text-slate-500">
                    <LockKeyhole className="h-4 w-4" /> Save to API · Not connected
                  </button>
                  <button type="button" disabled className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/5 px-4 py-3 text-xs font-bold text-rose-300/60">
                    <Play className="h-4 w-4" /> Generate Video · Locked
                  </button>
                </div>
              </>
            )}
          </div>
        </section>

        <footer className="flex flex-col gap-2 border-t border-slate-800/80 pt-4 text-[11px] leading-5 text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>NOVA Director Intelligence · {draft?.directorPlan.plannerVersion ?? '1.0.0'} · deterministic rules · no foundation model inference</span>
          <span>Execution OFF · Cost $0 · Human approval required · MP4 not generated</span>
        </footer>
      </div>
    </main>
  );
}
