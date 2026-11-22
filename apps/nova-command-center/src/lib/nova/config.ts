export interface NovaConfig {
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
  apiBaseUrl: string | null;
}

function clean(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim().replace(/\/+$/, "") : null;
}

export function readConfig(env: Record<string, unknown> = import.meta.env): NovaConfig {
  return {
    supabaseUrl: clean(env["VITE_SUPABASE_URL"]),
    supabaseAnonKey: clean(env["VITE_SUPABASE_ANON_KEY"]),
    apiBaseUrl: clean(env["VITE_NOVA_API_BASE_URL"]),
  };
}

export const config = readConfig();
export const isSupabaseConfigured = Boolean(config.supabaseUrl && config.supabaseAnonKey);
export const isApiConfigured = Boolean(config.apiBaseUrl);