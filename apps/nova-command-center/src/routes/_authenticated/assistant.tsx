import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Panel, PageHeader, NotConnected } from "@/components/nova/primitives";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api, type ChatMessage, type ChatWorkerHealth } from "@/lib/nova/api";
import { isApiConfigured, isChatApiConfigured } from "@/lib/nova/config";
import { pageHead } from "@/lib/nova/head";

export const Route = createFileRoute("/_authenticated/assistant")({
  head: pageHead("NOVA Trading AI Chat", "Authenticated, read-only trading research assistant."),
  component: Assistant,
});

interface Msg {
  role: "user" | "assistant";
  text: string;
}

function Assistant() {
  const [status, setStatus] = useState<ChatWorkerHealth | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let active = true;
    api.chatHealth()
      .then((health) => { if (active) setStatus(health); })
      .catch((error: unknown) => {
        if (active) setStatusError(error instanceof Error ? error.message : "Chat Worker unavailable");
      });
    return () => { active = false; };
  }, []);

  const ready = Boolean(status?.ok && status.aiBinding && status.authConfigured);
  const canSend = ready && !sending && text.trim().length > 0;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const content = text.trim();
    if (!content || !ready || sending) return;
    const next = [...msgs, { role: "user" as const, text: content }];
    setMsgs(next);
    setText("");
    setSending(true);
    const history: ChatMessage[] = next.slice(-8).map((message) => ({
      role: message.role,
      content: message.text,
    }));
    try {
      const result = await api.sendChat(history);
      setMsgs((current) => [...current, { role: "assistant", text: result.message }]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Chat request failed";
      setMsgs((current) => [...current, { role: "assistant", text: `ส่งข้อความไม่สำเร็จ: ${message}` }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <PageHeader
        title="NOVA Trading AI Chat"
        subtitle="Authenticated market research and strategy reasoning. Read-only; cannot place or modify trades."
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <Panel
          title="Research conversation"
          right={ready ? undefined : <NotConnected label={statusError ?? "AI Worker unavailable"} />}
        >
          <div className="flex h-[60vh] min-h-[420px] flex-col">
            <div className="flex-1 space-y-3 overflow-y-auto pr-1" aria-live="polite">
              {msgs.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                  เริ่มถามเกี่ยวกับ SMC, Multi-Timeframe, XAUUSD, กลยุทธ์, Backtest หรือ Risk Management ได้
                  <p className="mt-2 text-xs">ระบบจะไม่อ้างว่ามีราคา/บัญชีสด หากยังไม่มีข้อมูลที่ตรวจสอบแหล่งที่มาได้</p>
                </div>
              ) : msgs.map((m, i) => (
                <div
                  key={i}
                  className={
                    m.role === "user"
                      ? "ml-auto max-w-[85%] rounded-lg bg-primary/15 p-3 text-sm"
                      : "max-w-[90%] whitespace-pre-wrap rounded-lg border border-border bg-background/60 p-3 text-sm"
                  }
                >
                  {m.text}
                </div>
              ))}
              {sending && (
                <div className="max-w-[85%] rounded-lg border border-border bg-background/60 p-3 text-xs text-muted-foreground">
                  NOVA กำลังวิเคราะห์…
                </div>
              )}
            </div>
            <form className="mt-3 flex items-end gap-2" onSubmit={submit}>
              <Textarea
                rows={2}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="ถามเกี่ยวกับตลาด กลยุทธ์ หรือความเสี่ยง…"
                className="resize-none"
                disabled={!ready || sending}
                maxLength={1200}
              />
              <Button type="submit" disabled={!canSend}>
                {sending ? "กำลังส่ง…" : "Send"}
              </Button>
            </form>
            <p className="mt-2 text-xs text-muted-foreground">
              ประวัติแชตเก็บในหน้านี้ชั่วคราวเท่านั้น ยังไม่บันทึกลงฐานข้อมูล
            </p>
          </div>
        </Panel>
        <Panel title="AI Provider">
          <dl className="space-y-2 font-mono text-sm">
            <div>
              <dt className="terminal-label">Provider</dt>
              <dd>{status?.aiBinding ? "Cloudflare Workers AI" : "Unavailable"}</dd>
            </div>
            <div>
              <dt className="terminal-label">Model</dt>
              <dd>{status?.aiBinding ? "@cf/meta/llama-3.2-3b-instruct" : "Not connected"}</dd>
            </div>
            <div>
              <dt className="terminal-label">Authentication</dt>
              <dd>{status?.authConfigured ? "Configured" : "Unavailable"}</dd>
            </div>
            <div>
              <dt className="terminal-label">System API</dt>
              <dd>{isApiConfigured ? "Configured" : "Not connected"}</dd>
            </div>
            <div>
              <dt className="terminal-label">Chat API</dt>
              <dd>{isChatApiConfigured ? "Configured" : "Not connected"}</dd>
            </div>
            <div>
              <dt className="terminal-label">Execution</dt>
              <dd className="text-emerald-500">Disabled</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            ใช้ Supabase access token ของผู้ใช้ที่เข้าสู่ระบบ ตรวจสอบซ้ำที่ AI Worker; ไม่มี API key ของโมเดลใน Browser
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {statusError ?? (status ? "Worker health checked." : "Checking AI Worker…")}
          </p>
        </Panel>
      </div>
    </>
  );
}