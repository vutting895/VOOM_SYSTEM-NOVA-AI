const SIGN_VERSION = 1;
const EMPTY_BODY_HASH = "47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU";
const ACCOUNT_ID = /^[0-9]{1,20}$/;
const INSTRUMENT = /^[A-Za-z0-9._-]{1,11}$/;

const utf8 = new TextEncoder();

function fail(code, status = 503) {
  return Object.assign(new Error(code), { code, status });
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function decodePrivateKey(value) {
  if (typeof value !== "string" || !value.trim()) throw fail("exness_signing_key_unavailable");
  const text = value.trim();
  if (/^[0-9a-fA-F]{128}$/.test(text)) {
    // Exness-generated keys are 64 bytes: the Ed25519 seed followed by the public key.
    return Uint8Array.from(text.slice(0, 64).match(/../g), (byte) => parseInt(byte, 16));
  }
  const pem = text.match(/^-----BEGIN PRIVATE KEY-----\s+([A-Za-z0-9+/=\s]+)\s+-----END PRIVATE KEY-----$/);
  if (!pem) throw fail("exness_signing_key_format_invalid", 503);
  const der = base64ToBytes(pem[1].replace(/\s+/g, ""));
  // PKCS#8 Ed25519 private key: 302e020100300506032b657004220420 || 32-byte seed.
  const prefix = Uint8Array.from([0x30,0x2e,0x02,0x01,0x00,0x30,0x05,0x06,0x03,0x2b,0x65,0x70,0x04,0x22,0x04,0x20]);
  if (der.length !== 48 || prefix.some((byte, index) => der[index] !== byte)) {
    throw fail("exness_signing_key_format_invalid", 503);
  }
  return der;
}

async function importSigningKey(privateKey) {
  const material = decodePrivateKey(privateKey);
  let pkcs8;
  if (material.length === 32) {
    const prefix = Uint8Array.from([0x30,0x2e,0x02,0x01,0x00,0x30,0x05,0x06,0x03,0x2b,0x65,0x70,0x04,0x22,0x04,0x20]);
    pkcs8 = new Uint8Array(prefix.length + material.length);
    pkcs8.set(prefix);
    pkcs8.set(material, prefix.length);
  } else {
    pkcs8 = material;
  }
  try {
    return await crypto.subtle.importKey("pkcs8", pkcs8, { name: "Ed25519" }, false, ["sign"]);
  } catch {
    throw fail("exness_signing_unavailable", 503);
  }
}

export async function createExnessGetHeaders({ apiKey, privateKey, path, timestamp = Date.now() }) {
  if (typeof apiKey !== "string" || !apiKey.trim() || apiKey.length > 256) {
    throw fail("exness_api_key_unavailable");
  }
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//") || path.includes("#")) {
    throw fail("exness_request_path_invalid", 400);
  }
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) throw fail("exness_timestamp_invalid", 400);

  const payload = {
    api_key: apiKey,
    idempotency_key: "",
    timestamp,
    sign_version: SIGN_VERSION,
    method: "GET",
    path,
    body_hash: EMPTY_BODY_HASH
  };
  const payloadBytes = utf8.encode(JSON.stringify(payload));
  const key = await importSigningKey(privateKey);
  let signature;
  try {
    signature = new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, key, payloadBytes));
  } catch {
    throw fail("exness_signing_failed", 503);
  }
  return {
    "Accept": "application/json",
    "EXN-API-KEY": apiKey,
    "EXN-IDEMPOTENCY-KEY": "",
    "EXN-TIMESTAMP": String(timestamp),
    "EXN-SIGN-VERSION": String(SIGN_VERSION),
    "EXN-DATA": bytesToBase64Url(payloadBytes),
    "EXN-SIGN": bytesToBase64Url(signature)
  };
}

function checkedBaseUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw fail("exness_host_not_configured"); }
  const host = url.hostname.toLowerCase();
  const trusted = host === "exness.com" || host.endsWith(".exness.com") ||
    host === "exness-api.com" || host.endsWith(".exness-api.com");
  if (url.protocol !== "https:" || !trusted || url.username || url.password ||
      url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
    throw fail("exness_host_invalid");
  }
  return url.origin;
}

function accountPath(accountId, suffix) {
  if (typeof accountId !== "string" || !ACCOUNT_ID.test(accountId)) throw fail("exness_account_reference_invalid", 400);
  return "/v1/configuration/accounts/" + accountId + suffix;
}

function allowedRequest(path) {
  if (/^\/v1\/trading\/access-point\?account_id=[0-9]{1,20}$/.test(path)) return true;
  if (/^\/v1\/configuration\/accounts\/[0-9]{1,20}\/(account|limits|instruments)$/.test(path)) return true;
  if (/^\/v1\/market-data\/accounts\/[0-9]{1,20}\/candles\?instrument=[A-Za-z0-9._-]{1,11}&timeframe=(S1|S5|S15|M1|M3|M5|M10|M15|M30|H1|H2|H4|D1|W1|MN)&from=[0-9A-Fa-fTZ.:%-]+&count=[1-9][0-9]{0,2}&price_type=(bid|ask|both)$/.test(path)) return true;
  return false;
}

async function signedGet({ baseUrl, apiKey, privateKey, path, fetchImpl = fetch, timeoutMs = 10000 }) {
  if (!allowedRequest(path)) throw fail("exness_operation_not_allowed", 403);
  const origin = checkedBaseUrl(baseUrl);
  const headers = await createExnessGetHeaders({ apiKey, privateKey, path });
  let response;
  try {
    response = await fetchImpl(origin + path, {
      method: "GET",
      headers,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch {
    throw fail("exness_upstream_unavailable", 502);
  }
  if (response.status === 429) throw fail("exness_rate_limited", 429);
  if (response.status === 401 || response.status === 403) throw fail("exness_permission_denied", response.status);
  if (!response.ok) throw fail("exness_upstream_rejected", 502);
  try {
    return await response.json();
  } catch {
    throw fail("exness_invalid_upstream_response", 502);
  }
}

function checkedAccessPoint(value) {
  let url;
  try { url = new URL(value.includes("://") ? value : "https://" + value); }
  catch { throw fail("exness_access_point_invalid", 502); }
  const host = url.hostname.toLowerCase();
  const trusted = host.endsWith(".exness.com") || host.endsWith(".exness-api.com");
  if (url.protocol !== "https:" || !trusted || url.username || url.password ||
      url.port || url.pathname !== "/" || url.search || url.hash) {
    throw fail("exness_access_point_invalid", 502);
  }
  return url.origin;
}

/**
 * Internal-only adapter. credentials must come from an approved server-side
 * owner/connection-scoped secret resolver. Never pass request-body values here.
 */
export function createExnessReadOnlyAdapter({ resolveCredentials, fetchImpl = fetch }) {
  if (typeof resolveCredentials !== "function") throw fail("exness_credential_resolver_unavailable");
  async function credentialsFor(context) {
    if (!context || typeof context.ownerId !== "string" || !context.ownerId ||
        typeof context.connectionId !== "string" || !context.connectionId) {
      throw fail("exness_connection_context_invalid", 400);
    }
    const credentials = await resolveCredentials({
      ownerId: context.ownerId,
      connectionId: context.connectionId,
      provider: "exness_trader_api"
    });
    if (!credentials || typeof credentials.apiKey !== "string" ||
        typeof credentials.privateKey !== "string" ||
        typeof credentials.discoveryBaseUrl !== "string" ||
        typeof credentials.accountId !== "string" || !ACCOUNT_ID.test(credentials.accountId)) {
      throw fail("credential_vault_unavailable", 503);
    }
    return credentials;
  }

  async function discover(c) {
    const path = "/v1/trading/access-point?account_id=" + c.accountId;
    const result = await signedGet({
      baseUrl: c.discoveryBaseUrl, apiKey: c.apiKey, privateKey: c.privateKey,
      path, fetchImpl
    });
    if (String(result?.account_id) !== c.accountId || typeof result?.access_point !== "string") {
      throw fail("exness_access_point_response_invalid", 502);
    }
    return checkedAccessPoint(result.access_point);
  }

  async function read(context, path) {
    const c = await credentialsFor(context);
    const accessPoint = await discover(c);
    return signedGet({
      baseUrl: accessPoint, apiKey: c.apiKey, privateKey: c.privateKey,
      path, fetchImpl
    });
  }

  return Object.freeze({
    providerId: "exness_trader_api",
    supportedEnvironments: Object.freeze(["demo", "live"]),
    capabilities: Object.freeze([
      "account.summary.read", "account.limits.read", "market.instruments.read"
    ]),
    async getAccount(context) {
      const c = await credentialsFor(context);
      return read(context, accountPath(c.accountId, "/account"));
    },
    async getLimits(context) {
      const c = await credentialsFor(context);
      return read(context, accountPath(c.accountId, "/limits"));
    },
    async getInstruments(context) {
      const c = await credentialsFor(context);
      const result = await read(context, accountPath(c.accountId, "/instruments"));
      if (!result || !Array.isArray(result.instruments) ||
          !result.instruments.every((name) => typeof name === "string" && INSTRUMENT.test(name))) {
        throw fail("exness_instrument_response_invalid", 502);
      }
      return result.instruments;
    },
    async getCandles(context, query) {
      if (!query || typeof query !== "object") throw fail("exness_candle_query_invalid", 400);
      const instrument = query.instrument;
      const timeframe = query.timeframe;
      const from = query.from;
      const count = query.count;
      const priceType = query.priceType || "bid";
      const timeframes = new Set(["S1","S5","S15","M1","M3","M5","M10","M15","M30","H1","H2","H4","D1","W1","MN"]);
      const fromDate = typeof from === "string" ? Date.parse(from) : NaN;
      if (typeof instrument !== "string" || !INSTRUMENT.test(instrument) ||
          !timeframes.has(timeframe) || !Number.isFinite(fromDate) || fromDate >= Date.now() ||
          !Number.isInteger(count) || count < 1 || count > 500 ||
          !["bid","ask","both"].includes(priceType)) {
        throw fail("exness_candle_query_invalid", 400);
      }
      const instruments = await this.getInstruments(context);
      if (!instruments.includes(instrument)) throw fail("exness_instrument_not_available", 403);
      const c = await credentialsFor(context);
      const path = accountPath(c.accountId, "/candles") +
        "?instrument=" + encodeURIComponent(instrument) +
        "&timeframe=" + encodeURIComponent(timeframe) +
        "&from=" + encodeURIComponent(new Date(fromDate).toISOString()) +
        "&count=" + encodeURIComponent(String(count)) +
        "&price_type=" + encodeURIComponent(priceType);
      const result = await read(context, path);
      if (!result || !Array.isArray(result.candles) || result.candles.length > count) {
        throw fail("exness_candle_response_invalid", 502);
      }
      let previousTime = -Infinity;
      for (const candle of result.candles) {
        const time = Date.parse(candle?.time || "");
        if (!Number.isFinite(time) || time <= previousTime) throw fail("exness_candle_response_invalid", 502);
        previousTime = time;
        const legs = priceType === "both" ? [candle.bid, candle.ask] : [candle];
        for (const leg of legs) {
          if (!leg || ["open","high","low","close"].some((key) =>
            typeof leg[key] !== "number" || !Number.isFinite(leg[key])) ||
            leg.high < Math.max(leg.open, leg.close, leg.low) ||
            leg.low > Math.min(leg.open, leg.close, leg.high)) {
            throw fail("exness_candle_response_invalid", 502);
          }
        }
      }
      return result.candles;
    }
  });
}

export const EXNESS_READ_ONLY_FLAGS = Object.freeze({
  ordersEnabled: false,
  executionEnabled: false,
  order_submission_enabled: false,
  liveTradingEnabled: false
});
