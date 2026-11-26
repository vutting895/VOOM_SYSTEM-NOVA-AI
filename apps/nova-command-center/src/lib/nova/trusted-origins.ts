export const NOVA_SERVICE_ORIGINS = {
  supabase: "https://tlyyxufuiimrbaksoitf.supabase.co",
  systemHub: "https://voom-system-hub.suwapat787.workers.dev",
  chat: "https://voom-system-nova-ai.suwapat787.workers.dev",
} as const;

export type NovaService = keyof typeof NOVA_SERVICE_ORIGINS;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);
const LOCAL_PORTS: Record<NovaService, ReadonlySet<string>> = {
  supabase: new Set(["54321"]),
  systemHub: new Set(["8787", "8788"]),
  chat: new Set(["8787", "8788"]),
};

/**
 * Resolve only an exact trusted service origin. A configured but invalid value
 * fails closed; fallback is used only when the value is absent or blank.
 */
export function resolveTrustedBaseUrl(
  value: unknown,
  service: NovaService,
  fallback?: string,
): string | null {
  const configured = typeof value === "string" ? value.trim() : "";
  const candidate = configured || fallback?.trim() || "";
  if (!candidate) return null;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    return null;
  }

  const trustedProduction =
    url.protocol === "https:" &&
    url.origin === NOVA_SERVICE_ORIGINS[service];
  const trustedLocal =
    url.protocol === "http:" &&
    LOCAL_HOSTS.has(url.hostname) &&
    LOCAL_PORTS[service].has(url.port);

  return trustedProduction || trustedLocal ? url.origin : null;
}
