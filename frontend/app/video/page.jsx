"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "../../lib/supabase-browser";

const panel = { background: "rgba(17, 22, 38, 0.88)", border: "1px solid rgba(148,163,184,.2)", borderRadius: 16, padding: 20 };
const muted = { color: "#9ba4ba", fontSize: 13 };

export default function VideoWorkspacePage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [authState, setAuthState] = useState("checking");
  const [projects, setProjects] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [taskType, setTaskType] = useState("video_generation");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadWorkspace = useCallback(async (accessToken) => {
    const headers = { Authorization: "Bearer " + accessToken };
    const [projectResponse, jobResponse] = await Promise.all([
      fetch("/api/video/projects", { headers, cache: "no-store" }),
      fetch("/api/video/jobs", { headers, cache: "no-store" }),
    ]);
    if (projectResponse.status === 401 || jobResponse.status === 401) {
      setAuthState("signed-out");
      router.replace("/login");
      return;
    }
    if (!projectResponse.ok || !jobResponse.ok) throw new Error("โหลดข้อมูล Video Workspace ไม่สำเร็จ");
    const projectPayload = await projectResponse.json();
    const jobPayload = await jobResponse.json();
    const nextProjects = Array.isArray(projectPayload.projects) ? projectPayload.projects : [];
    setProjects(nextProjects);
    setJobs(Array.isArray(jobPayload.jobs) ? jobPayload.jobs : []);
    setSelectedProject((current) => current && nextProjects.some((item) => item.id === current)
      ? current : nextProjects[0]?.id || "");
    setAuthState("ready");
  }, [router]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setAuthState("misconfigured");
      return undefined;
    }
    let active = true;
    const applySession = async (session) => {
      if (!active) return;
      if (!session?.access_token) {
        setToken("");
        setAuthState("signed-out");
        router.replace("/login");
        return;
      }
      setToken(session.access_token);
      try {
        await loadWorkspace(session.access_token);
      } catch (err) {
        if (active) {
          setError(err.message || "ไม่สามารถโหลด Workspace ได้");
          setAuthState("error");
        }
      }
    };
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      void applySession(session);
    });
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) {
        if (active) {
          setError("ตรวจสอบเซสชันไม่สำเร็จ กรุณาเข้าสู่ระบบใหม่");
          setAuthState("error");
        }
        return;
      }
      void applySession(data.session);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [loadWorkspace, router]);

  async function createProject(event) {
    event.preventDefault();
    if (!token || !title.trim()) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/video/projects", {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "สร้างโปรเจกต์ไม่สำเร็จ");
      setTitle("");
      await loadWorkspace(token);
      setSelectedProject(payload.project.id);
      setNotice("สร้างโปรเจกต์แล้ว");
    } catch (err) { setError(err.message || "สร้างโปรเจกต์ไม่สำเร็จ"); }
    finally { setBusy(false); }
  }

  async function createJob(event) {
    event.preventDefault();
    if (!token || !selectedProject) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/video/jobs", {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: selectedProject,
          task_type: taskType,
          prompt: prompt.trim(),
          idempotency_key: crypto.randomUUID().replaceAll("-", ""),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "บันทึกงานไม่สำเร็จ");
      setPrompt("");
      await loadWorkspace(token);
      setNotice(payload.explanation || "บันทึกคำขอแล้ว");
    } catch (err) { setError(err.message || "บันทึกงานไม่สำเร็จ"); }
    finally { setBusy(false); }
  }

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "36px 20px 72px", color: "#eef2ff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
        <div>
          <p style={{ ...muted, letterSpacing: 2, textTransform: "uppercase" }}>NOVA / CREATIVE INTELLIGENCE</p>
          <h1 style={{ fontSize: "clamp(28px, 5vw, 42px)", margin: "8px 0" }}>AI Video Workspace</h1>
          <p style={muted}>พื้นที่สร้างและจัดการโปรเจกต์วิดีโอแบบ Free-first</p>
        </div>
        <div style={{ ...panel, padding: "12px 16px" }}>
          <strong style={{ color: "#86efac" }}>FREE-ONLY MODE</strong>
          <div style={muted}>No paid API · No paid GPU · No auto billing</div>
        </div>
      </div>

      {authState === "checking" && <p role="status">กำลังตรวจสอบการเข้าสู่ระบบ…</p>}
      {authState === "misconfigured" && <div style={panel} role="alert">ยังไม่ได้ตั้งค่า Supabase Auth กรุณาตรวจสอบการตั้งค่าระบบ</div>}
      {authState === "error" && <div style={panel} role="alert">{error}</div>}
      {authState === "ready" && (
        <>
          <div style={{ ...panel, marginBottom: 20, borderColor: "rgba(251,191,36,.45)" }}>
            <strong style={{ color: "#fcd34d" }}>GPU Generation ยังไม่เปิดใช้งาน</strong>
            <p style={{ ...muted, marginBottom: 0 }}>ยังไม่พบ Cloud GPU ฟรีที่รับประกันโควตาและความต่อเนื่อง ระบบจะบันทึกคำขอไว้เท่านั้น ไม่มีการส่งงานไปประมวลผลและไม่มีค่าใช้จ่าย</p>
          </div>
          {(error || notice) && <p role={error ? "alert" : "status"} style={{ color: error ? "#fca5a5" : "#86efac" }}>{error || notice}</p>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 18 }}>
            <section style={panel}>
              <h2 style={{ marginTop: 0 }}>สร้างโปรเจกต์</h2>
              <form onSubmit={createProject} style={{ display: "grid", gap: 12 }}>
                <label htmlFor="video-project-title" style={muted}>ชื่อโปรเจกต์</label>
                <input id="video-project-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required placeholder="เช่น Product Launch Video" style={fieldStyle} />
                <button disabled={busy || !title.trim()} style={buttonStyle}>สร้างโปรเจกต์</button>
              </form>
              <p style={muted}>{projects.length} โปรเจกต์ · แสดงเฉพาะข้อมูลของบัญชีที่เข้าสู่ระบบ</p>
              <div style={{ display: "grid", gap: 8 }}>
                {projects.map((project) => (
                  <button key={project.id} type="button" onClick={() => setSelectedProject(project.id)} style={{ ...projectButton, borderColor: selectedProject === project.id ? "#60a5fa" : "rgba(148,163,184,.2)" }}>
                    <strong>{project.title}</strong><small style={muted}>{new Date(project.created_at).toLocaleDateString("th-TH")}</small>
                  </button>
                ))}
                {!projects.length && <p style={muted}>ยังไม่มีโปรเจกต์ เริ่มสร้างโปรเจกต์แรกได้เลย</p>}
              </div>
            </section>

            <section style={panel}>
              <h2 style={{ marginTop: 0 }}>สร้างคำขอวิดีโอ</h2>
              <form onSubmit={createJob} style={{ display: "grid", gap: 12 }}>
                <label htmlFor="video-task" style={muted}>ประเภทงาน</label>
                <select id="video-task" value={taskType} onChange={(event) => setTaskType(event.target.value)} style={fieldStyle}>
                  <option value="video_generation">สร้างวิดีโอจากข้อความ / ภาพ</option>
                  <option value="video_analysis">วิเคราะห์วิดีโอ</option>
                  <option value="video_edit_export">ตัดต่อและส่งออก</option>
                </select>
                <label htmlFor="video-prompt" style={muted}>รายละเอียดงาน</label>
                <textarea id="video-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={4000} rows={5} placeholder="อธิบายวิดีโอหรือผลลัพธ์ที่ต้องการ…" style={{ ...fieldStyle, resize: "vertical" }} />
                <button disabled={busy || !selectedProject} style={buttonStyle}>บันทึกคำขอ (ไม่เริ่มประมวลผล)</button>
              </form>
              {!selectedProject && <p style={muted}>สร้างหรือเลือกโปรเจกต์ก่อนส่งคำขอ</p>}
            </section>
          </div>

          <section style={{ ...panel, marginTop: 20 }}>
            <h2 style={{ marginTop: 0 }}>ประวัติงาน</h2>
            {!jobs.length && <p style={muted}>ยังไม่มีคำขอวิดีโอ</p>}
            <div style={{ display: "grid", gap: 10 }}>
              {jobs.map((job) => (
                <article key={job.id} style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", borderTop: "1px solid rgba(148,163,184,.16)", paddingTop: 12 }}>
                  <div><strong>{job.task_type}</strong><div style={muted}>{job.prompt || "ไม่มีรายละเอียด"}</div></div>
                  <div style={{ textAlign: "right" }}><strong style={{ color: "#fcd34d" }}>{job.status}</strong><div style={muted}>Estimated cost: 0</div></div>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
      <p style={{ ...muted, marginTop: 20 }}>สถานะ: Metadata workspace เท่านั้น · ยังไม่มี media upload, GPU worker, AI generation หรือ production activation</p>
      <Link href="/command-center" style={{ color: "#93c5fd" }}>กลับ NOVA Command Center</Link>
    </main>
  );
}

const fieldStyle = { width: "100%", background: "#0b1020", border: "1px solid #39435d", borderRadius: 10, padding: "12px 14px", color: "#eef2ff", font: "inherit" };
const buttonStyle = { background: "#2563eb", color: "white", border: 0, borderRadius: 10, padding: "12px 16px", fontWeight: 700, cursor: "pointer" };
const projectButton = { display: "grid", textAlign: "left", gap: 4, background: "rgba(15,23,42,.55)", border: "1px solid", borderRadius: 10, padding: 12, color: "#eef2ff", cursor: "pointer" };
