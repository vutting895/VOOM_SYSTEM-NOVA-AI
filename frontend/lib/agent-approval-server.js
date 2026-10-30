import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export function agentApiJson(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export async function authenticateAgentRequest(request) {
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") || "");
  const accessToken = match?.[1];
  if (!accessToken) {
    return { ok: false, response: agentApiJson({ error: "authentication_required" }, 401) };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return { ok: false, response: agentApiJson({ error: "authentication_not_configured" }, 503) };
  }

  try {
    const supabase = createClient(url, key, {
      global: { headers: { Authorization: "Bearer " + accessToken } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (error || !data?.user?.id) {
      const status = [401, 403].includes(error?.status) ? 401 : 503;
      const code = status === 401 ? "invalid_or_expired_session" : "authentication_provider_unavailable";
      return { ok: false, response: agentApiJson({ error: code }, status) };
    }
    return { ok: true, user: data.user, supabase };
  } catch {
    return { ok: false, response: agentApiJson({ error: "authentication_provider_unavailable" }, 503) };
  }
}

export async function readAgentJson(request, maxBytes = 8000) {
  const contentType = (request.headers.get("content-type") || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (contentType !== "application/json") {
    return { ok: false, response: agentApiJson({ error: "content_type_must_be_application_json" }, 415) };
  }
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    return { ok: false, response: agentApiJson({ error: "invalid_request_limit" }, 500) };
  }

  const contentLengthHeader = request.headers.get("content-length");
  if (contentLengthHeader !== null) {
    const normalizedLength = contentLengthHeader.trim();
    const isDecimalLength = normalizedLength.length > 0
      && [...normalizedLength].every((character) => character >= "0" && character <= "9");
    if (!isDecimalLength) {
      return { ok: false, response: agentApiJson({ error: "invalid_content_length" }, 400) };
    }
    const contentLength = Number(normalizedLength);
    if (!Number.isSafeInteger(contentLength) || contentLength > maxBytes) {
      return { ok: false, response: agentApiJson({ error: "request_too_large" }, 413) };
    }
  }

  const reader = request.body?.getReader();
  if (!reader) {
    return { ok: false, response: agentApiJson({ error: "invalid_request_body" }, 400) };
  }

  const chunks = [];
  let totalBytes = 0;
  let tooLarge = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        tooLarge = true;
        try {
          await reader.cancel();
        } catch {
          // The request is already being rejected; cancellation is best-effort.
        }
        break;
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, response: agentApiJson({ error: "invalid_request_body" }, 400) };
  } finally {
    reader.releaseLock();
  }

  if (tooLarge) {
    return { ok: false, response: agentApiJson({ error: "request_too_large" }, 413) };
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let raw;
  try {
    raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { ok: false, response: agentApiJson({ error: "invalid_request_body" }, 400) };
  }

  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, response: agentApiJson({ error: "invalid_json" }, 400) };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, response: agentApiJson({ error: "invalid_json_object" }, 400) };
  }
  return { ok: true, value };
}
export function isUuid(value) {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
