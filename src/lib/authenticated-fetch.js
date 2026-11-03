export async function fetchWithBearer(
  input,
  getAccessToken,
  init = {},
  fetchImpl = globalThis.fetch
) {
  if (typeof getAccessToken !== "function") {
    throw new TypeError("getAccessToken must be a function");
  }
  if (typeof fetchImpl !== "function") {
    throw new TypeError("fetch implementation is unavailable");
  }

  const accessToken = await getAccessToken();
  if (typeof accessToken !== "string" || accessToken.length === 0) {
    throw new Error("authentication_required");
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");

  return fetchImpl(input, {
    ...init,
    headers,
    cache: "no-store",
    redirect: "error"
  });
}
