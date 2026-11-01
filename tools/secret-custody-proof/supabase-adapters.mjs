const CONNECTION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function supabaseOrigin(value) {
  let url;
  try { url = new URL(String(value || "")); } catch { throw new Error("SUPABASE_NOT_CONFIGURED"); }
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.username || url.password ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))) {
    throw new Error("SUPABASE_NOT_CONFIGURED");
  }
  return url.origin;
}

function requestHeaders(publishableKey, accessToken) {
  return {
    apikey: publishableKey,
    Authorization: "Bearer " + accessToken,
    Accept: "application/json"
  };
}

/**
 * Supabase adapters for the local Option C proof.
 * Uses Auth /user for independent session verification and the user's JWT
 * against PostgREST so the existing broker_connections RLS remains enforced.
 * Never uses a service-role key or accepts caller-supplied owner identity.
 */
export function createSupabaseCustodyAdapters({
  supabaseUrl,
  publishableKey,
  fetchImpl = globalThis.fetch
}) {
  const origin = supabaseOrigin(supabaseUrl);
  if (typeof publishableKey !== "string" || !publishableKey ||
      typeof fetchImpl !== "function") throw new Error("SUPABASE_NOT_CONFIGURED");

  async function safeFetch(url, init) {
    let response;
    try {
      response = await fetchImpl(url, {
        ...init,
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(15000)
      });
    } catch {
      throw new Error("SUPABASE_UNAVAILABLE");
    }
    return response;
  }

  async function verifySession(accessToken) {
    if (typeof accessToken !== "string" || accessToken.length < 16 || accessToken.length > 8192) {
      throw new Error("INVALID_SESSION");
    }
    const response = await safeFetch(new URL("/auth/v1/user", origin), {
      method: "GET",
      headers: requestHeaders(publishableKey, accessToken)
    });
    if (response.status === 401 || response.status === 403) throw new Error("INVALID_SESSION");
    if (!response.ok) throw new Error("SUPABASE_UNAVAILABLE");
    let user;
    try { user = await response.json(); } catch { throw new Error("SUPABASE_UNAVAILABLE"); }
    if (!user || typeof user.id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(user.id)) {
      throw new Error("INVALID_SESSION");
    }
    return { subject: user.id, accessToken };
  }

  async function resolveConnection(subject, connectionId, principal) {
    if (typeof subject !== "string" || !subject ||
        !principal || principal.subject !== subject ||
        typeof principal.accessToken !== "string" ||
        !CONNECTION_ID.test(String(connectionId || ""))) {
      throw new Error("INVALID_CONNECTION_LOOKUP");
    }
    const url = new URL("/rest/v1/broker_connections", origin);
    url.searchParams.set("select", "id,user_id,provider,environment,status");
    url.searchParams.set("id", "eq." + connectionId);
    url.searchParams.set("user_id", "eq." + subject);
    url.searchParams.set("limit", "1");

    const response = await safeFetch(url, {
      method: "GET",
      headers: requestHeaders(publishableKey, principal.accessToken)
    });
    if (!response.ok) throw new Error("SUPABASE_UNAVAILABLE");
    let rows;
    try { rows = await response.json(); } catch { throw new Error("SUPABASE_UNAVAILABLE"); }
    if (!Array.isArray(rows)) throw new Error("SUPABASE_UNAVAILABLE");
    const row = rows[0];
    if (!row || row.user_id !== subject || row.id !== connectionId) return null;
    return {
      ownerId: row.user_id,
      connectionId: row.id,
      provider: row.provider,
      environment: row.environment,
      status: row.status
    };
  }

  return { verifySession, resolveConnection };
}
