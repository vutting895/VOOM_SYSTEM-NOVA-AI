import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;
let clientPromise: Promise<SupabaseClient> | null = null;

export async function getSupabaseClient(): Promise<SupabaseClient> {
  if (client) return client;
  if (!clientPromise) {
    clientPromise = (async () => {
      const response = await fetch("/api/auth/config", {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store"
      });
      if (!response.ok) throw new Error("Supabase Auth configuration is unavailable.");
      const config = await response.json();
      const projectUrl = new URL(String(config.supabaseUrl || ""));
      if (projectUrl.protocol !== "https:" || !projectUrl.hostname.endsWith(".supabase.co") ||
          typeof config.publishableKey !== "string" || config.publishableKey.length < 20 ||
          config.keyType !== "publishable") {
        throw new Error("Supabase Auth configuration is invalid.");
      }
      client = createClient(projectUrl.origin, config.publishableKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });
      client.auth.onAuthStateChange((_event, session) => {
        try {
          if (session?.access_token) localStorage.setItem("nova_auth_token", session.access_token);
          else localStorage.removeItem("nova_auth_token");
        } catch {
          // Ignore restricted storage contexts; API clients can read the Supabase session directly.
        }
      });
      return client;
    })();
  }
  try {
    return await clientPromise;
  } catch (error) {
    clientPromise = null;
    throw error;
  }
}
