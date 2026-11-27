import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Panel, PageHeader, NotConnected } from "@/components/nova/primitives";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  getNovaAiStatus,
  sendNovaAiChat,
  type NovaAiMessage,
  type NovaAiStatus,
} from "@/lib/nova/ai-client";
import { config } from "@/lib/nova/config";
import { pageHead } from "@/lib/nova/head";

export const Route = createFileRoute("/_authenticated/assistant")({
  head: pageHead("AI Assistant", "Operations assistant."),
  component: Assistant,
});

function Assistant() {
  const [status, setStatus] = useState<NovaAiStatus | null>(null);
  const [statusError, setStatusError] = useState("");
  const [msgs, setMsgs] = useState<NovaAiMessage[]>([
    {
      role: "assistant",
      content:
        "NOVA Research Assistant. Messages are sent only to the authenticated NOVA AI Worker.",
    },
  ]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let active = true;
    getNovaAiStatus()
      .then((value) => {
        if (active) setStatus(value);
      })
      .catch((error) => {
        if (active) setStatusError((error as Error).message);
      });
    return () => {
      active = false;
    };
  }, []);

  const ready = Boolean(
    config.aiWorkerUrl &&
      status &&
      Object.values(status.providers.enabled).some(Boolean),
  );
  const providerLabel = status
    ? Object.entries(status.providers.enabled)
        .filter(([, enabled]) => enabled)
        .map(([name]) => name)
        .join(" → ") || "No free-tier provider enabled"
    : statusError || "Checking provider status";

  return (
    <>
      <PageHeader
        title="AI Assistant"
        subtitle="Authenticated research assistant. Trading and broker execution are disabled."
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <Panel
          title="Conversation"
          right={
            ready ? undefined : <NotConnected label="AI Worker not ready" />
          }
        >
          <div className="flex h-[55vh] flex-col">
            <div className="flex-1 space-y-3 overflow-y-auto pr-1">
              {msgs.map((m, i) => (
                <div
                  key={i}
                  className={
                    m.role === "user"
                      ? "ml-auto max-w-[80%] rounded-lg bg-primary/15 p-3 text-sm"
                      : "max-w-[85%] rounded-lg border border-border bg-background/60 p-3 text-sm"
                  }
                >
                  {m.content}
                </div>
              ))}
            </div>
            <form
              className="mt-3 flex gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const prompt = text.trim();
                if (!prompt || sending) return;
                const nextMessages = [
                  ...msgs.filter(
                    (m) =>
                      m.role !== "assistant" ||
                      !m.content.startsWith("NOVA Research Assistant."),
                  ),
                  { role: "user" as const, content: prompt },
                ];
                setMsgs(nextMessages);
                setText("");
                setSending(true);
                try {
                  const result = await sendNovaAiChat(nextMessages.slice(-8));
                  setMsgs((previous) => [
                    ...previous,
                    {
                      role: "assistant",
                      content:
                        result.message +
                        "\n\nProvider: " +
                        result.provider +
                        " / " +
                        result.model +
                        (result.fallbackUsed ? " (fallback)" : ""),
                    },
                  ]);
                } catch (error) {
                  setMsgs((previous) => [
                    ...previous,
                    {
                      role: "assistant",
                      content:
                        "Request failed: " +
                        (error as Error).message +
                        ". No trading action was performed.",
                    },
                  ]);
                } finally {
                  setSending(false);
                }
              }}
            >
              <Textarea
                rows={2}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Ask about services, risk policy, research…"
                className="resize-none"
                disabled={sending}
              />
              <Button type="submit" disabled={!text.trim() || sending}>
                {sending ? "Sending…" : "Send"}
              </Button>
            </form>
          </div>
        </Panel>
        <Panel title="Provider">
          <dl className="space-y-2 font-mono text-sm">
            <div>
              <dt className="terminal-label">Provider order</dt>
              <dd className="break-words">{providerLabel}</dd>
            </div>
            <div>
              <dt className="terminal-label">AI Worker</dt>
              <dd>
                {config.aiWorkerUrl
                  ? "Configured"
                  : "VITE_NOVA_AI_WORKER_URL missing"}
              </dd>
            </div>
            <div>
              <dt className="terminal-label">Gemini</dt>
              <dd>{status?.providers.enabled.gemini ? "Enabled" : "Disabled"}</dd>
            </div>
            <div>
              <dt className="terminal-label">Cloudflare AI</dt>
              <dd>
                {status?.providers.enabled.cloudflare ? "Enabled" : "Disabled"}
              </dd>
            </div>
            <div>
              <dt className="terminal-label">Groq</dt>
              <dd>{status?.providers.enabled.groq ? "Enabled" : "Disabled"}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            Provider secrets remain in Worker secrets. Free-tier confirmation is
            required before any provider is enabled. Live trading and order
            submission remain disabled.
          </p>
        </Panel>
      </div>
    </>
  );
}
