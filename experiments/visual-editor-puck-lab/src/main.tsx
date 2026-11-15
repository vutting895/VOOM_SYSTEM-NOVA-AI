import React from "react";
import { createRoot } from "react-dom/client";
import { Puck } from "@puckeditor/core";
import type { Config } from "@puckeditor/core";
import "./style.css";

type Components = {
  SectionHeading: { title: string; description: string };
  StatusCard: { label: string; value: string; detail: string; tone: string };
  SystemNotice: { title: string; body: string };
  ActivityRow: { time: string; event: string; source: string; status: string };
};

type RootProps = { title: string; subtitle: string };

const config: Config<Components, RootProps> = {
  categories: {
    overview: { title: "Overview", components: ["SectionHeading", "SystemNotice", "StatusCard"] },
    operations: { title: "Operations", components: ["ActivityRow"] },
  },
  components: {
    SectionHeading: {
      label: "Section heading",
      fields: {
        title: { type: "text" },
        description: { type: "textarea" },
      },
      defaultProps: {
        title: "System Overview",
        description: "Synthetic dashboard data for the isolated visual editor trial.",
      },
      render: ({ title, description }) => (
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-700">NOVA / SYSTEM CORE</p>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">{title}</h2>
          <p className="text-sm text-slate-500">{description}</p>
        </header>
      ),
    },
    StatusCard: {
      label: "Status card",
      fields: {
        label: { type: "text" },
        value: { type: "text" },
        detail: { type: "text" },
        tone: { type: "text" },
      },
      defaultProps: {
        label: "Runtime",
        value: "HEALTHY",
        detail: "Synthetic status only",
        tone: "positive",
      },
      render: ({ label, value, detail, tone }) => {
        const toneClass =
          tone === "warning"
            ? "border-amber-200 bg-amber-50 text-amber-800"
            : tone === "positive"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-slate-200 bg-slate-50 text-slate-800";
        return (
          <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">{label}</p>
            <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
            <span className={`mt-3 inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${toneClass}`}>
              {detail}
            </span>
          </article>
        );
      },
    },
    SystemNotice: {
      label: "Safety notice",
      fields: {
        title: { type: "text" },
        body: { type: "textarea" },
      },
      defaultProps: {
        title: "READ-ONLY MODE",
        body: "Live trading is OFF. This prototype has no broker connection, order controls, or production API access.",
      },
      render: ({ title, body }) => (
        <aside className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">{title}</p>
          <p className="mt-1 text-sm leading-6 text-amber-800">{body}</p>
        </aside>
      ),
    },
    ActivityRow: {
      label: "Activity row",
      fields: {
        time: { type: "text" },
        event: { type: "text" },
        source: { type: "text" },
        status: { type: "text" },
      },
      defaultProps: {
        time: "09:42:18",
        event: "Local preview rendered",
        source: "Puck Sandbox",
        status: "PASS",
      },
      render: ({ time, event, source, status }) => (
        <div className="grid grid-cols-[92px_1fr_120px_72px] items-center gap-3 border-b border-slate-100 py-3 text-sm last:border-0">
          <span className="font-mono text-xs text-slate-400">{time}</span>
          <span className="font-medium text-slate-800">{event}</span>
          <span className="text-slate-500">{source}</span>
          <span className="text-xs font-semibold text-emerald-700">{status}</span>
        </div>
      ),
    },
  },
  root: {
    fields: {
      title: { type: "text" },
      subtitle: { type: "text" },
    },
    defaultProps: {
      title: "NOVA Visual Editor Lab",
      subtitle: "A local-only prototype. No production services are connected.",
    },
    render: ({ children, title, subtitle }) => (
      <main className="mx-auto min-h-screen max-w-6xl space-y-6 bg-slate-50 px-6 py-8 md:px-10">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-950">{title}</h1>
            <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
          </div>
          <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-semibold tracking-wide text-cyan-800">
            LOCAL SANDBOX / NO PRODUCTION
          </span>
        </div>
        <div className="space-y-6">{children}</div>
        <footer className="border-t border-slate-200 pt-4 text-xs text-slate-400">
          NOVA Visual Editor Evaluation • Synthetic data • Live trading disabled
        </footer>
      </main>
    ),
  },
};

const initialData = {
  content: [
    {
      type: "SectionHeading",
      props: {
        id: "section-heading",
        title: "System Overview",
        description: "Prototype layout for evaluating Puck with NOVA-style dashboard components.",
      },
    },
    {
      type: "SystemNotice",
      props: {
        id: "safety-notice",
        title: "READ-ONLY / LIVE TRADING OFF",
        body: "This is a visual-editor test. No broker, database, production API, or order execution is connected.",
      },
    },
    {
      type: "StatusCard",
      props: { id: "runtime-card", label: "Runtime", value: "SANDBOX", detail: "Local only", tone: "positive" },
    },
    {
      type: "StatusCard",
      props: { id: "trading-card", label: "Trading", value: "READ ONLY", detail: "Execution disabled", tone: "warning" },
    },
    {
      type: "StatusCard",
      props: { id: "api-card", label: "Production API", value: "NOT CONNECTED", detail: "No network integration", tone: "neutral" },
    },
    {
      type: "ActivityRow",
      props: { id: "activity-1", time: "09:42:18", event: "Puck editor initialized", source: "Local sandbox", status: "PASS" },
    },
    {
      type: "ActivityRow",
      props: { id: "activity-2", time: "09:43:02", event: "Synthetic dashboard loaded", source: "Fixture data", status: "PASS" },
    },
  ],
  root: { props: { title: "NOVA Visual Editor Lab", subtitle: "Local-only prototype • Synthetic data • No production connection" } },
};

function exportLocalJson(data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "nova-puck-layout.json";
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function App() {
  return (
    <div className="min-h-screen">
      <div className="border-b border-cyan-900 bg-slate-950 px-4 py-2 text-center text-xs font-medium tracking-wide text-cyan-100">
        ISOLATED EXPERIMENT BRANCH • LOCAL EXPORT ONLY • PRODUCTION UNCHANGED
      </div>
      <Puck
        config={config}
        data={initialData}
        headerTitle="NOVA Dashboard Prototype"
        headerPath="Experiment / Puck"
        dictionary={{ "header-publish": "Export local JSON" }}
        onPublish={exportLocalJson}
      />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
