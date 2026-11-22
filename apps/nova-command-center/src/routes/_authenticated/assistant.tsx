import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Panel, PageHeader, NotConnected } from "@/components/nova/primitives";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useNovaQuery } from "@/components/nova/useApi";
import { isApiConfigured } from "@/lib/nova/config";
import { pageHead } from "@/lib/nova/head";

export const Route = createFileRoute("/_authenticated/assistant")({
  head: pageHead("AI Assistant", "Operations assistant."),
  component: Assistant,
});

interface Msg {
  role: "user" | "system";
  text: string;
}

function Assistant() {
  const status = useNovaQuery<{ provider: string; model: string; ready: boolean }>(
    "/v1/assistant/status",
  );
  const ready = Boolean(status.data?.ready);
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      role: "system",
      text: "No model is connected. Messages are not sent anywhere until the NOVA API exposes an assistant endpoint.",
    },
  ]);
  const [text, setText] = useState("");

  return (
    <>
      <PageHeader
        title="AI Assistant"
        subtitle="Chat about system state. The assistant can never place trades."
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <Panel
          title="Conversation"
          right={ready ? undefined : <NotConnected label="No model connected" />}
        >
          <div className="flex h-[55vh] flex-col">
            <div className="flex-1 space-y-3 overflow-y-auto pr-1">
              {msgs.map((m, i) => (
                <div
                  key={i}
                  className={
                    m.role === "user"
                      ? "ml-auto max-w-[80%] rounded-lg bg-primary/15 p-3 text-sm"
                      : "max-w-[85%] rounded-lg border border-border bg-background/60 p-3 font-mono text-xs text-muted-foreground"
                  }
                >
                  {m.text}
                </div>
              ))}
            </div>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!text.trim()) return;
                setMsgs((p) => [
                  ...p,
                  { role: "user", text },
                  { role: "system", text: "Not sent — no model connected." },
                ]);
                setText("");
              }}
            >
              <Textarea
                rows={2}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Ask about services, risk policy…"
                className="resize-none"
              />
              <Button type="submit" disabled={!text.trim()}>
                Send
              </Button>
            </form>
          </div>
        </Panel>
        <Panel title="Provider">
          <dl className="space-y-2 font-mono text-sm">
            <div>
              <dt className="terminal-label">Provider</dt>
              <dd>{status.data?.provider ?? "Not connected"}</dd>
            </div>
            <div>
              <dt className="terminal-label">Model</dt>
              <dd>{status.data?.model ?? "Not connected"}</dd>
            </div>
            <div>
              <dt className="terminal-label">API</dt>
              <dd>{isApiConfigured ? "Configured" : "Not connected"}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            Model provider keys live only in the Cloudflare Worker's secrets. They are never entered
            here.
          </p>
        </Panel>
      </div>
    </>
  );
}