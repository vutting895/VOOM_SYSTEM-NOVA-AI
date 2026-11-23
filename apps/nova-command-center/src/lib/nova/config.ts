import {
  NOVA_SERVICE_ORIGINS,
  resolveTrustedBaseUrl,
} from "./trusted-origins";

export interface NovaConfig {
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
  apiBaseUrl: string | null;
  chatApiBaseUrl: string | null;
}

function clean(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0
    ? v.trim()
    : null;
}

export function readConfig(
  env: Record<string, unknown> = import.meta.env,
): NovaConfig {
  return {
    supabaseUrl: resolveTrustedBaseUrl(env["VITE_SUPABASE_URL"], "supabase"),
    supabaseAnonKey: clean(env["VITE_SUPABASE_ANON_KEY"]),
    apiBaseUrl: resolveTrustedBaseUrl(
      env["VITE_NOVA_API_BASE_URL"],
      "systemHub",
      NOVA_SERVICE_ORIGINS.systemHub,
    ),
    chatApiBaseUrl: resolveTrustedBaseUrl(
      env["VITE_NOVA_CHAT_API_BASE_URL"],
      "chat",
      NOVA_SERVICE_ORIGINS.chat,
    ),
  };
}

export const config = readConfig();
export const isSupabaseConfigured = Boolean(
  config.supabaseUrl && config.supabaseAnonKey,
);
export const isApiConfigured = Boolean(config.apiBaseUrl);
export const isChatApiConfigured = Boolean(config.chatApiBaseUrl);
