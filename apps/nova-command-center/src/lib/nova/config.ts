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
  // Netlify's existing public Supabase variables use NEXT_PUBLIC_; local Vite
  // development may use VITE_. A non-empty VITE_ value takes precedence.
  const supabaseUrl = clean(env["VITE_SUPABASE_URL"]) ??
    clean(env["NEXT_PUBLIC_SUPABASE_URL"]);
  const supabaseAnonKey = clean(env["VITE_SUPABASE_ANON_KEY"]) ??
    clean(env["NEXT_PUBLIC_SUPABASE_ANON_KEY"]);
  const apiBaseUrl = clean(env["VITE_NOVA_API_BASE_URL"]) ??
    clean(env["NEXT_PUBLIC_NOVA_API_BASE_URL"]);
  const chatApiBaseUrl = clean(env["VITE_NOVA_CHAT_API_BASE_URL"]) ??
    clean(env["NEXT_PUBLIC_NOVA_CHAT_API_BASE_URL"]);

  return {
    supabaseUrl: resolveTrustedBaseUrl(supabaseUrl, "supabase"),
    supabaseAnonKey,
    apiBaseUrl: resolveTrustedBaseUrl(
      apiBaseUrl,
      "systemHub",
      NOVA_SERVICE_ORIGINS.systemHub,
    ),
    chatApiBaseUrl: resolveTrustedBaseUrl(
      chatApiBaseUrl,
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
