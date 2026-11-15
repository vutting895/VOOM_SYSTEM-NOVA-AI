import React from "react";
import { createRoot } from "react-dom/client";
import { Puck } from "@puckeditor/core";
import "./style.css";

const config: any = {
  components: {
    MetricCard: {
      fields: {
        label: { type: "text" as const },
        value: { type: "text" as const },
        trend: { type: "text" as const },
      },
      defaultProps: { label: "Active Sessions", value: "1,284", trend: "+8.2%" },
      render: ({ label, value, trend }: { label: string; value: string; trend: string }) => (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">{label}</p>
          <div className="mt-2 flex items-end justify-between">
            <strong className="text-3xl font-semibold text-slate-900">{value}</strong>
            <span className="text-sm font-medium text-emerald-700">{trend}</span>
          </div>
        </section>
      ),
    },
    SectionHeading: {
      fields: {
        title: { type: "text" as const },
        description: { type: "textarea" as const },
      },
      defaultProps: {
        title: "NOVA System Overview",
        description: "No production data or APIs are connected.",
      },
      render: ({ title, description }: { title: string; description: string }) => (
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </header>
      ),
    },
  },
  root: {
    fields: { title: { type: "text" as const } },
    render: ({ children, title }: { children: React.ReactNode; title: string }) => (
      <main className="mx-auto max-w-5xl space-y-6 p-8">
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        {children}
      </main>
    ),
  },
};

const data: any = {
  content: [
    {
      type: "SectionHeading",
      props: {
        id: "heading-1",
        title: "NOVA System Overview",
        description: "Puck trial — isolated from production.",
      },
    },
    {
      type: "MetricCard",
      props: {
        id: "metric-1",
        label: "Demo Status",
        value: "READ ONLY",
        trend: "LIVE OFF",
      },
    },
    {
      type: "MetricCard",
      props: {
        id: "metric-2",
        label: "Editor",
        value: "Puck",
        trend: "Local trial",
      },
    },
  ],
  root: { props: { title: "NOVA Visual Editor Lab" } },
};

function App() {
  return (
    <Puck
      config={config}
      data={data}
      onPublish={(next) => {
        const blob = new Blob([JSON.stringify(next, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "nova-puck-layout.json";
        anchor.click();
        URL.revokeObjectURL(url);
      }}
    />
  );
}

createRoot(document.getElementById("root")!).render(<App />);
