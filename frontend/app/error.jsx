"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createIncidentId, classifyClientError, reportClientIncident } from "../lib/nova-diagnostics";

export default function RouteError({ error, reset }) {
  const [incident, setIncident] = useState("");

  useEffect(() => {
    const id = createIncidentId();
    const classified = classifyClientError(error);
    const safe = reportClientIncident({
      incidentId: id,
      errorCode: classified === "unknown_client_error" ? "route_render_failed" : classified,
      route: window.location.pathname,
      component: "app-route-boundary"
    });
    setIncident(safe.incidentId);
  }, [error]);

  return (
    <main className="nova-error-screen" role="alert">
      <section className="nova-error-card">
        <span className="nova-error-kicker">NOVA / RECOVERY</span>
        <h1>This workspace needs a refresh.</h1>
        <p>We isolated a page error. Your other NOVA workspaces remain available. Try recovering this page or return to the main dashboard.</p>
        {incident ? <p className="nova-error-reference">Support reference: <code>{incident}</code></p> : null}
        <div className="nova-error-actions">
          <button type="button" onClick={() => reset()}>Try again</button>
          <Link href="/">Back to Dashboard</Link>
        </div>
      </section>
      <style jsx>{`
        .nova-error-screen{min-height:65vh;display:grid;place-items:center;padding:28px;color:#e8f5fa}
        .nova-error-card{width:min(620px,100%);padding:clamp(22px,4vw,38px);border:1px solid rgba(98,230,243,.2);border-radius:20px;background:linear-gradient(145deg,rgba(9,28,42,.96),rgba(6,17,29,.98));box-shadow:0 24px 70px rgba(0,0,0,.2)}
        .nova-error-kicker{color:#75b9c9;font-size:10px;font-weight:850;letter-spacing:.16em}
        h1{margin:16px 0 10px;font-size:clamp(27px,5vw,42px);letter-spacing:-.04em}
        p{color:#91aebc;font-size:13px;line-height:1.8}
        .nova-error-reference{font-size:11px}.nova-error-reference code{color:#8ce8d6}
        .nova-error-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:22px}
        .nova-error-actions a,.nova-error-actions button{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:0 15px;border:1px solid rgba(98,230,243,.3);border-radius:10px;color:#eaffff;background:rgba(24,150,166,.2);font:inherit;font-size:12px;text-decoration:none;cursor:pointer}
      `}</style>
    </main>
  );
}
