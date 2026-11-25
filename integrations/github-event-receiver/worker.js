const MAX_BODY_BYTES = 256 * 1024;
const ALLOWED_EVENTS = new Set(["push", "pull_request", "issues", "workflow_run"]);
const encoder = new TextEncoder();

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function equalHex(left, right) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i++) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return mismatch === 0;
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function verifySignature(rawBody, supplied, secret) {
  if (!secret || !/^sha256=[a-f0-9]{64}$/i.test(supplied || "")) return false;
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, rawBody);
  const expected = [...new Uint8Array(signature)].map((value) => value.toString(16).padStart(2, "0")).join("");
  return equalHex(expected, supplied.slice(7).toLowerCase());
}

function extractEnvelope(eventName, payload, deliveryId, payloadHash, receivedAt) {
  const repository = payload?.repository?.full_name;
  if (typeof repository !== "string" || !repository) return null;
  const action = typeof payload.action === "string" ? payload.action.slice(0, 80) : null;
  const pullRequestNumber = Number.isSafeInteger(payload.pull_request?.number)
    ? payload.pull_request.number : null;
  const issueNumber = Number.isSafeInteger(payload.issue?.number)
    ? payload.issue.number : (eventName === "issues" && Number.isSafeInteger(payload.number) ? payload.number : null);
  const workflow = payload.workflow_run || {};
  const commitSha = typeof payload.after === "string" && /^[a-f0-9]{40}$/i.test(payload.after)
    ? payload.after
    : typeof payload.pull_request?.head?.sha === "string" && /^[a-f0-9]{40}$/i.test(payload.pull_request.head.sha)
      ? payload.pull_request.head.sha
      : typeof workflow.head_sha === "string" && /^[a-f0-9]{40}$/i.test(workflow.head_sha)
        ? workflow.head_sha : null;
  const ref = typeof payload.ref === "string" ? payload.ref.slice(0, 255)
    : typeof workflow.head_branch === "string" ? workflow.head_branch.slice(0, 255)
      : typeof payload.pull_request?.head?.ref === "string" ? payload.pull_request.head.ref.slice(0, 255) : null;
  const workflowStatus = typeof workflow.conclusion === "string" ? workflow.conclusion.slice(0, 40)
    : typeof workflow.status === "string" ? workflow.status.slice(0, 40) : null;

  return {
    deliveryId, repository, eventName, action, ref, commitSha,
    pullRequestNumber, issueNumber, workflowStatus, payloadHash, receivedAt,
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "nova-github-event-receiver", mode: "read-only", writesTo: "event-inbox-only" });
    }
    if (url.pathname !== "/github") return json({ error: "not_found" }, 404);
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    if (!env.GITHUB_WEBHOOK_SECRET || !env.ALLOWED_REPOSITORIES || !env.EVENT_DB) {
      return json({ error: "receiver_not_configured" }, 503);
    }
    const contentType = (request.headers.get("Content-Type") || "").toLowerCase();
    if (!contentType.startsWith("application/json")) {
      return json({ error: "content_type_must_be_application_json" }, 415);
    }

    const contentLength = Number(request.headers.get("Content-Length") || 0);
    if (contentLength > MAX_BODY_BYTES) return json({ error: "payload_too_large" }, 413);
    let rawBody;
    try {
      rawBody = await request.arrayBuffer();
    } catch {
      return json({ error: "invalid_request_body" }, 400);
    }
    if (rawBody.byteLength > MAX_BODY_BYTES) return json({ error: "payload_too_large" }, 413);

    const validSignature = await verifySignature(
      rawBody,
      request.headers.get("X-Hub-Signature-256") || "",
      env.GITHUB_WEBHOOK_SECRET,
    );
    if (!validSignature) return json({ error: "invalid_signature" }, 401);

    const deliveryId = request.headers.get("X-GitHub-Delivery") || "";
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(deliveryId)) {
      return json({ error: "invalid_delivery_id" }, 400);
    }
    const eventName = request.headers.get("X-GitHub-Event") || "";
    if (!ALLOWED_EVENTS.has(eventName)) return json({ error: "unsupported_event" }, 400);

    let payload;
    try {
      payload = JSON.parse(new TextDecoder().decode(rawBody));
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return json({ error: "invalid_json_object" }, 400);
    }

    const allowedRepositories = new Set(
      String(env.ALLOWED_REPOSITORIES).split(",").map((name) => name.trim().toLowerCase()).filter(Boolean),
    );
    const repository = payload?.repository?.full_name;
    if (typeof repository !== "string" || !allowedRepositories.has(repository.toLowerCase())) {
      return json({ error: "repository_not_allowed" }, 403);
    }

    const envelope = extractEnvelope(eventName, payload, deliveryId, await sha256Hex(rawBody), new Date().toISOString());
    if (!envelope) return json({ error: "invalid_repository_payload" }, 400);

    try {
      const sql = "INSERT OR IGNORE INTO github_deliveries " +
        "(delivery_id, repository, event_name, action, ref, commit_sha, pull_request_number, " +
        "issue_number, workflow_status, payload_sha256, received_at, processing_status) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'received')";
      const result = await env.EVENT_DB.prepare(sql).bind(
        envelope.deliveryId, envelope.repository, envelope.eventName, envelope.action, envelope.ref,
        envelope.commitSha, envelope.pullRequestNumber, envelope.issueNumber, envelope.workflowStatus,
        envelope.payloadHash, envelope.receivedAt,
      ).run();

      const inserted = Number(result?.meta?.changes || 0) > 0;
      return json({
        ok: true,
        accepted: inserted,
        duplicate: !inserted,
        deliveryId,
        repository,
        eventName,
        processingStatus: inserted ? "received" : "already_received",
        sideEffects: false,
      }, inserted ? 202 : 200);
    } catch {
      return json({ error: "event_persistence_unavailable" }, 503);
    }
  },
};

export { extractEnvelope, verifySignature };
