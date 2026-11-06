import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function readPublicSupabaseConfig() {
  const url = import.meta.env?.VITE_SUPABASE_URL?.trim();
  const key = (
    import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env?.VITE_SUPABASE_ANON_KEY ||
    ""
  ).trim();

  if (!url || !key) return null;

  try {
    const parsed = new URL(url);
    if (
      (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") ||
      parsed.username ||
      parsed.password
    ) {
      return null;
    }
    return { url: parsed.origin, key };
  } catch {
    return null;
  }
}

const config = readPublicSupabaseConfig();

/**
 * Shared browser Supabase client. Only a publishable/legacy anon key is accepted.
 * The service-role key must never be supplied to VITE_* variables.
 */
export const supabaseClient: SupabaseClient | null = config
  ? createClient(config.url, config.key, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  : null;
