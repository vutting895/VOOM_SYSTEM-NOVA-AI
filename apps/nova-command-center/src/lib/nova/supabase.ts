import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config";

let client: SupabaseClient | null = null;

/** Returns null when not configured (fail-closed: no auth => no access). Browser only. */
export function getSupabase(): SupabaseClient | null {
  if (typeof window === "undefined") return null;
  if (!config.supabaseUrl || !config.supabaseAnonKey) return null;
  if (!client) {
    client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        flowType: "pkce",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: "nova-auth",
      },
    });
  }
  return client;
}