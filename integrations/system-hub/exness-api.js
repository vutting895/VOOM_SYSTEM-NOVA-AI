const EMPTY_BODY_HASH = "47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU";
const PKCS8_ED25519_PREFIX = "302e020100300506032b657004220420";
const MAX_RESPONSE_BYTES = 64 * 1024;
const ACCOUNT_ID = /^[1-9][0-9]{0,19}$/;

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function fromHex(value) {
  if (!/^[0-9a-fA-F]{128}$/.test(value)) {
    throw new Error("invalid_ed25519_private_key_format");
  }
  const bytes = new Uint8Array(64);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function fromBase64(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function pemToDer(value) {
  const match = /^-----BEGIN PRIVATE KEY-----\s*([A-Za-z0-9+/=\s]+)\s*-----END PRIVATE KEY-----$/.exec(value);
  if (!match) throw new Error("invalid_ed25519_private_key_format");
  return fromBase64(match[1].replace(/\s/g, ""));
}

function concatBytes(left, right) {
  const output = new Uint8Array(left.length + right.length);
  output.set(left, 0);
  output.set(right, left.length);
  return output;
}

export function validateAccountId(value) {
  const accountId = String(value ?? "");
  if (!ACCOUNT_ID.test(accountId) || BigInt(accountId) > 18446744073709551615n) {
    throw new Error("invalid_exness_account_id");
  }
  return accountId;
}

export function normalizeExnessBaseUrl(value) {
  let url;
  try {
    url = new URL(String(value));
  } catch {
    throw new Error("invalid_exness_host");
  }
  const hostname = url.hostname.toLowerCase();
  const trustedHost = hostname === "exness.com" || hostname.endsWith(".exness.com");
  if (url.protocol !== "https:" || !trustedHost || url.username || url.password ||
      (url.port && url.port !== "443") || (url.pathname !== "/" && url.pathname !== "") ||
      url.search || url.hash) {
    throw new Error("invalid_exness_host");
  }
  return url.origin;
}

export async function importExnessEd25519PrivateKey(value, cryptoProvider = globalThis.crypto) {
  if (!cryptoProvider?.subtle) throw new Error("webcrypto_unavailable");
  const text = String(value ?? "").trim();
  let der;
  if (text.startsWith("-----BEGIN PRIVATE KEY-----")) {
    der = pemToDer(text);
  } else {
    const raw = fromHex(text);
    // Exness hex format is seed (32 bytes) followed by the public key (32 bytes).
    // WebCrypto imports the RFC 8410 PKCS#8 seed wrapper; the provider validates the pair.
    const prefix = Uint8Array.from(PKCS8_ED25519_PREFIX.match(/../g), (part) => Number.parseInt(part, 16));
    der = concatBytes(prefix, raw.subarray(0, 32));
  }
  try {
    return await cryptoProvider.subtle.importKey(
      "pkcs8", der, { name: "Ed25519" }, false, ["sign"]
    );
  } catch {
    throw new Error("invalid_ed25519_private_key");
  }
}

export async function signedExnessGetHeaders({
  apiKey,
  privateKey,
  pathWithQuery,
  timestamp = Date.now(),
  cryptoProvider = globalThis.crypto
}) {
  if (typeof apiKey !== "string" || !apiKey || apiKey.length > 256) {
    throw new Error("exness_api_key_unavailable");
  }
  if (typeof pathWithQuery !== "string" || !pathWithQuery.startsWith("/") ||
      pathWithQuery.startsWith("//") || pathWithQuery.includes("#")) {
    throw new Error("invalid_exness_request_path");
  }
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) {
    throw new Error("invalid_exness_timestamp");
  }
  const payload = new TextEncoder().encode(JSON.stringify({
    api_key: apiKey,
    idempotency_key: "",
    timestamp,
    sign_version: 1,
    method: "GET",
    path: pathWithQuery,
    body_hash: EMPTY_BODY_HASH
  }));
  const signature = await cryptoProvider.subtle.sign("Ed25519", privateKey, payload);
  return {
    "EXN-API-KEY": apiKey,
    "EXN-IDEMPOTENCY-KEY": "",
    "EXN-TIMESTAMP": String(timestamp),
    "EXN-SIGN-VERSION": "1",
    "EXN-DATA": base64Url(payload),
    "EXN-SIGN": base64Url(new Uint8Array(signature))
  };
}

async function signedGet({ host, path, apiKey, privateKey, fetchImpl, now, cryptoProvider }) {
  const headers = await signedExnessGetHeaders({
    apiKey, privateKey, path, timestamp: now(), cryptoProvider
  });
  let response;
  try {
    response = await fetchImpl(host + path, {
      method: "GET",
      headers,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(15000)
    });
  } catch {
    throw new Error("exness_upstream_unavailable");
  }
  if (!response.ok) throw new Error("exness_upstream_http_" + response.status);
  const contentLength = Number(response.headers.get("Content-Length") || 0);
  if (contentLength > MAX_RESPONSE_BYTES) throw new Error("exness_response_too_large");
  const body = await response.text();
  if (new TextEncoder().encode(body).byteLength > MAX_RESPONSE_BYTES) {
    throw new Error("exness_response_too_large");
  }
  try {
    const parsed = JSON.parse(body);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("invalid");
    }
    return parsed;
  } catch {
    throw new Error("exness_invalid_response");
  }
}

export function createExnessReadOnlyClient({
  apiKey,
  privateKey,
  gatewayUrl,
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  cryptoProvider = globalThis.crypto
}) {
  if (typeof fetchImpl !== "function") throw new Error("fetch_unavailable");
  const gateway = normalizeExnessBaseUrl(gatewayUrl);

  let resolvedAccessPoint = "";
  let resolvedAccountId = "";

  async function resolveAccessPoint(accountId) {
    const id = validateAccountId(accountId);
    const path = "/v1/trading/access-point?account_id=" + id;
    const result = await signedGet({
      host: gateway, path, apiKey, privateKey, fetchImpl, now, cryptoProvider
    });
    if (String(result.account_id ?? "") !== id || typeof result.access_point !== "string") {
      throw new Error("exness_access_point_mismatch");
    }
    resolvedAccessPoint = normalizeExnessBaseUrl(result.access_point);
    resolvedAccountId = id;
    return resolvedAccessPoint;
  }

  async function readAccount(accountId) {
    const id = validateAccountId(accountId);
    if (!resolvedAccessPoint || resolvedAccountId !== id) {
      throw new Error("exness_access_point_not_resolved");
    }
    const path = "/v1/configuration/accounts/" + id + "/account";
    const result = await signedGet({
      host: resolvedAccessPoint, path, apiKey, privateKey, fetchImpl, now, cryptoProvider
    });
    if (String(result.account_id ?? "") !== id) {
      throw new Error("exness_account_identity_mismatch");
    }
    return result;
  }

  return Object.freeze({
    resolveAccessPoint,
    readAccount,
    capabilities: Object.freeze({
      accountRead: true,
      marketDataRead: false,
      orderSubmission: false,
      tradeMutation: false,
      withdrawal: false,
      transfer: false,
      liveTradingEnabled: false
    })
  });
}
