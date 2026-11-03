import { createClient } from "@supabase/supabase-js";

type PublicRuntimeEnv = {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  VITE_SUPABASE_ANON_KEY?: string;
};

const runtimeEnv = (import.meta as ImportMeta & { env?: PublicRuntimeEnv }).env ?? {};
const supabaseUrl = runtimeEnv.VITE_SUPABASE_URL?.trim() ?? "";
const publishableKey = (
  runtimeEnv.VITE_SUPABASE_PUBLISHABLE_KEY ??
  runtimeEnv.VITE_SUPABASE_ANON_KEY ??
  ""
).trim();

export const supabaseBrowserConfigured = Boolean(supabaseUrl && publishableKey);

export const supabaseBrowser = supabaseBrowserConfigured
  ? createClient(supabaseUrl, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
