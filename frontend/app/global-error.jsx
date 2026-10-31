"use client";

import { useEffect, useState } from "react";
import { createIncidentId, reportClientIncident } from "../lib/nova-diagnostics";

export default function GlobalError({ reset }) {
  const [incident, setIncident] = useState("");

  useEffect(() => {
    const safe = reportClientIncident({
      incidentId: createIncidentId(),
      errorCode: "route_render_failed",
      route: "/",
      component: "root-layout-boundary"
    });
    setIncident(safe.incidentId);
  }, []);

  return (
    <html lang="th">
      <body style={{ margin: 0, minHeight: "100vh", background: "#06111d", color: "#e8f5fa", fontFamily: "Arial,sans-serif" }}>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
          <section style={{ width: "min(620px,100%)", padding: 32, border: "1px solid rgba(98,230,243,.2)", borderRadius: 20, background: "#091c2a" }} role="alert">
            <p style={{ color: "#75b9c9", fontSize: 10, fontWeight: 800, letterSpacing: ".16em" }}>NOVA / SYSTEM RECOVERY</p>
            <h1 style={{ fontSize: 34 }}>NOVA needs to restart this view.</h1>
            <p style={{ color: "#91aebc", lineHeight: 1.8 }}>A root application error was isolated. Retry the view; if it persists, share the support reference with your administrator.</p>
            {incident ? <p style={{ color: "#8ce8d6", fontSize: 12 }}>Support reference: {incident}</p> : null}
            <button type="button" onClick={() => reset()} style={{ minHeight: 42, padding: "0 16px", borderRadius: 10, border: "1px solid rgba(98,230,243,.3)", background: "rgba(24,150,166,.2)", color: "#eaffff", cursor: "pointer" }}>Try again</button>
          </section>
        </main>
      </body>
    </html>
  );
}
