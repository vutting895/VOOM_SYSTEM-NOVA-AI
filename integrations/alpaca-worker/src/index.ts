interface Env {
  ALPACA_CLIENT_ID: string;
  ALPACA_CLIENT_SECRET: string;
  ALPACA_REDIRECT_URI: string;
  ALPACA_ENV?: string;
  ALPACA_TOKEN_ENCRYPTION_KEY: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  FRONTEND_ORIGIN: string;
}
type User = { id: string; email?: string };

const json = (data: unknown, status = 200, origin = "") =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": origin,
      "access-control-allow-headers": "authorization, content-type",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "vary": "Origin",
    },
  });

function b64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function fromB64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), c => c.charCodeAt(0));
}
async function sha256(value: string): Promise<string> {
  return b64(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}
function randomToken(bytes = 32): string {
  return b64(crypto.getRandomValues(new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
async function encryptionKey(env: Env): Promise<CryptoKey> {
  const raw = fromB64(env.ALPACA_TOKEN_ENCRYPTION_KEY);
  if (raw.length !== 32) throw new Error("ALPACA_TOKEN_ENCRYPTION_KEY must be base64 for exactly 32 bytes");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function encryptToken(env: Env, token: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(env), new TextEncoder().encode(token));
  return `${b64(iv)}.${b64(new Uint8Array(cipher))}`;
}
async function decryptToken(env: Env, value: string): Promise<string> {
  const [iv, cipher] = value.split(".");
  if (!iv || !cipher) throw new Error("Stored token format is invalid");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(iv) }, await encryptionKey(env), fromB64(cipher));
  return new TextDecoder().decode(plain);
}
function configOk(env: Env): boolean {
  return Boolean(env.ALPACA_CLIENT_ID && env.ALPACA_CLIENT_SECRET && env.ALPACA_REDIRECT_URI &&
    env.ALPACA_TOKEN_ENCRYPTION_KEY && env.SUPABASE_URL && env.SUPABASE_ANON_KEY &&
    env.SUPABASE_SERVICE_ROLE_KEY && env.FRONTEND_ORIGIN);
}
async function supabase(env: Env, path: string, init: RequestInit = {}) {
  const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Supabase request failed (${response.status}): ${body.slice(0, 300)}`);
  return body ? JSON.parse(body) : null;
}
async function authenticatedUser(request: Request, env: Env): Promise<User> {
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) throw new Error("Sign in is required");
  const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, authorization: header },
  });
  if (!response.ok) throw new Error("Supabase session is invalid or expired");
  return response.json() as Promise<User>;
}
function redirect(url: string): Response {
  return new Response(null, { status: 302, headers: { location: url, "cache-control": "no-store" } });
}
function safeFrontendUrl(env: Env, status: string): string {
  const target = new URL("/settings/broker", env.FRONTEND_ORIGIN);
  target.searchParams.set("alpaca", status);
  return target.toString();
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("origin") || "";
    if (origin && origin !== env.FRONTEND_ORIGIN) return json({ error: "Origin not allowed" }, 403, env.FRONTEND_ORIGIN);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: {
      "access-control-allow-origin": env.FRONTEND_ORIGIN,
      "access-control-allow-headers": "authorization, content-type",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "vary": "Origin",
    }});
    const url = new URL(request.url);
    try {
      if (!configOk(env)) return json({ error: "Worker configuration is incomplete" }, 503, env.FRONTEND_ORIGIN);

      if (url.pathname === "/api/alpaca/health" && request.method === "GET") {
        return json({ ok: true, provider: "alpaca", environment: "paper" }, 200, env.FRONTEND_ORIGIN);
      }

      if (url.pathname === "/api/alpaca/connect" && request.method === "POST") {
        const user = await authenticatedUser(request, env);
        const state = randomToken();
        const stateHash = await sha256(state);
        await supabase(env, "alpaca_oauth_states", {
          method: "POST",
          headers: { prefer: "return=minimal" },
          body: JSON.stringify({ state_hash: stateHash, user_id: user.id }),
        });
        const authorize = new URL("https://app.alpaca.markets/oauth/authorize");
        authorize.searchParams.set("response_type", "code");
        authorize.searchParams.set("client_id", env.ALPACA_CLIENT_ID.trim());
        authorize.searchParams.set("redirect_uri", env.ALPACA_REDIRECT_URI.trim());
        authorize.searchParams.set("state", state);
        authorize.searchParams.set("scope", "trading data");
        authorize.searchParams.set("env", "paper");
        return json({ authorization_url: authorize.toString(), environment: "paper" }, 200, env.FRONTEND_ORIGIN);
      }

      if (url.pathname === "/api/alpaca/callback" && request.method === "GET") {
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const oauthError = url.searchParams.get("error");
        if (oauthError) return redirect(safeFrontendUrl(env, "denied"));
        if (!code || !state) return redirect(safeFrontendUrl(env, "failed"));
        // Consume the short-lived, one-time state before exchanging the code.
        const rows = await supabase(env, "rpc/consume_alpaca_oauth_state", {
          method: "POST",
          body: JSON.stringify({ p_state_hash: await sha256(state) }),
        }) as Array<{ user_id: string }> | null;
        const owner = rows?.[0]?.user_id;
        if (!owner) return redirect(safeFrontendUrl(env, "invalid_state"));

        const tokenResponse = await fetch("https://api.alpaca.markets/oauth/token", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            code,
            client_id: env.ALPACA_CLIENT_ID.trim(),
            client_secret: env.ALPACA_CLIENT_SECRET.trim(),
            redirect_uri: env.ALPACA_REDIRECT_URI.trim(),
          }),
        });
        if (!tokenResponse.ok) {
          // Return only the HTTP status for safe diagnosis; never expose the response body,
          // authorization code, client secret, or token in the redirect or logs.
          return redirect(safeFrontendUrl(env, `token_exchange_failed_${tokenResponse.status}`));
        }
        const grant = await tokenResponse.json() as { access_token?: string; scope?: string; token_type?: string };
        if (!grant.access_token) return redirect(safeFrontendUrl(env, "token_missing"));
        const ciphertext = await encryptToken(env, grant.access_token);
        await supabase(env, "alpaca_connections?on_conflict=user_id", {
          method: "POST",
          headers: { prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify({
            user_id: owner,
            token_ciphertext: ciphertext,
            scopes: grant.scope ? grant.scope.split(" ") : [],
            environment: "paper",
            connected_at: new Date().toISOString(),
          }),
        });
        return redirect(safeFrontendUrl(env, "connected"));
      }

      if (url.pathname === "/api/alpaca/account" && request.method === "GET") {
        const user = await authenticatedUser(request, env);
        const rows = await supabase(env, `alpaca_connections?select=token_ciphertext,environment,scopes,connected_at&user_id=eq.${encodeURIComponent(user.id)}&limit=1`) as Array<{token_ciphertext:string;environment:string;scopes:string[];connected_at:string}>;
        if (!rows?.length) return json({ connected: false, environment: "paper" }, 200, env.FRONTEND_ORIGIN);
        if (rows[0].environment !== "paper") return json({ error: "Only paper accounts are permitted in this deployment" }, 403, env.FRONTEND_ORIGIN);
        const token = await decryptToken(env, rows[0].token_ciphertext);
        const response = await fetch("https://paper-api.alpaca.markets/v2/account", {
          headers: { authorization: `Bearer ${token}` },
        });
        if (!response.ok) return json({ connected: true, error: "Alpaca account request failed; reconnect may be required" }, 502, env.FRONTEND_ORIGIN);
        const account = await response.json() as Record<string, unknown>;
        // Return only a small, non-secret account summary.
        return json({ connected: true, environment: "paper", account: {
          status: account.status, currency: account.currency, cash: account.cash,
          portfolio_value: account.portfolio_value, buying_power: account.buying_power,
          equity: account.equity, pattern_day_trader: account.pattern_day_trader,
        }, scopes: rows[0].scopes, connected_at: rows[0].connected_at }, 200, env.FRONTEND_ORIGIN);
      }

      if (url.pathname === "/api/alpaca/disconnect" && request.method === "POST") {
        const user = await authenticatedUser(request, env);
        await supabase(env, `alpaca_connections?user_id=eq.${encodeURIComponent(user.id)}`, { method: "DELETE" });
        return json({ disconnected: true }, 200, env.FRONTEND_ORIGIN);
      }

      return json({ error: "Not found" }, 404, env.FRONTEND_ORIGIN);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected error";
      const status = /Sign in|session is invalid/.test(message) ? 401 : 500;
      // Never log request URLs, authorization codes, bearer tokens, or secret values.
      return json({ error: status === 401 ? message : "Request failed; check Worker logs for a redacted diagnostic" }, status, env.FRONTEND_ORIGIN);
    }
  },
};
