import { json, methodNotAllowed, publicHubRequest } from "../lib/system-hub.js";

export const handler = async (event) => {
  if (event.httpMethod !== "GET") return methodNotAllowed(["GET"]);
  const result = await publicHubRequest("/v1/public/auth-config");
  if (!result.ok) return result.response;
  const { supabaseUrl, publishableKey, keyType } = result.data || {};
  let parsed;
  try { parsed = new URL(String(supabaseUrl || "")); } catch { parsed = null; }
  if (!parsed || parsed.protocol !== "https:" || !parsed.hostname.endsWith(".supabase.co") ||
      typeof publishableKey !== "string" || publishableKey.length < 20 || keyType !== "publishable") {
    return json(502, { error: "public_auth_config_invalid" });
  }
  return json(200, { supabaseUrl: parsed.origin, publishableKey, keyType: "publishable" });
};
