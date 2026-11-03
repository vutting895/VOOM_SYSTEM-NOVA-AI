const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const PAIRING_PATH_PATTERN = /^\/v1\/secrets\/pairings(?:\/claim|\/[0-9a-f-]{36})?$/i;

export function extractPairingToken(fragment) {
  if (typeof fragment !== "string" || !fragment) return null;
  const params = new URLSearchParams(fragment.startsWith("#") ? fragment.slice(1) : fragment);
  const values = params.getAll("pair");
  if (values.length !== 1 || !TOKEN_PATTERN.test(values[0])) return null;
  return values[0];
}

export function resolveSystemHubOrigin(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value.trim());
    const isLocalDevelopment = url.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname);
    const isCloudflareWorker = url.protocol === "https:" &&
      (url.hostname.endsWith(".workers.dev") || url.hostname.endsWith(".cloudflareaccess.com"));
    if ((!isLocalDevelopment && !isCloudflareWorker) ||
      url.username || url.password || url.pathname !== "/" || url.search || url.hash) return "";
    return url.origin;
  } catch {
    return "";
  }
}

export async function requestPairingApi({
  origin,
  accessToken,
  path,
  method = "GET",
  body,
  signal,
  fetchImpl = fetch,
}) {
  const safeOrigin = resolveSystemHubOrigin(origin);
  if (!safeOrigin) throw new Error("system_hub_not_configured");
  if (typeof accessToken !== "string" || !accessToken.trim()) {
    throw new Error("authentication_required");
  }
  if (typeof path !== "string" || !PAIRING_PATH_PATTERN.test(path)) {
    throw new Error("pairing_endpoint_not_allowed");
  }
  if (!["GET", "POST"].includes(method)) throw new Error("pairing_method_not_allowed");

  const url = new URL(path, safeOrigin + "/");
  if (url.origin !== safeOrigin) throw new Error("pairing_endpoint_not_allowed");
  const headers = {
    Authorization: "Bearer " + accessToken,
    Accept: "application/json",
  };
  const init = {
    method,
    headers,
    cache: "no-store",
    credentials: "omit",
    redirect: "error",
    referrerPolicy: "no-referrer",
    ...(signal ? { signal } : {}),
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetchImpl(url, init);
  } catch {
    throw new Error("system_hub_unavailable");
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = typeof payload?.error === "string" && /^[a-z0-9_]{1,80}$/.test(payload.error)
      ? payload.error
      : "pairing_request_failed";
    throw new Error(code);
  }
  return payload;
}
