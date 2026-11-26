/**
 * Safety invariants. These are compile-time constants and are frozen at runtime.
 * There is intentionally NO code path in this frontend that flips them.
 * Enabling live trading requires a reviewed backend change, never a UI toggle.
 */
export const SAFETY = Object.freeze({
  LIVE_TRADING_ENABLED: false,
  BROKER_WRITES_ENABLED: false,
  ORDER_PLACEMENT_ENABLED: false,
  FUNDS_MOVEMENT_ENABLED: false,
  ACCOUNT_MUTATIONS_ENABLED: false,
} as const);

export type SafetyFlags = typeof SAFETY;

/** API paths the client is allowed to call. All read-only except local-intent endpoints. */
export const ALLOWED_API_PATHS = Object.freeze([
  "/v1/health",
  "/v1/services",
  "/v1/bridge/status",
  "/v1/bridge/account",
  "/v1/risk/policy",
  "/v1/approvals",
  "/v1/audit",
  "/v1/me",
  "/v1/assistant/status",
] as const);

const ALLOWED_API_PATH_SET: ReadonlySet<string> = new Set(ALLOWED_API_PATHS);

const FORBIDDEN_PATTERNS = [
  /order/i,
  /withdraw/i,
  /transfer/i,
  /deposit/i,
  /trade\/execute/i,
  /position\/close/i,
];

export function isForbiddenPath(path: string): boolean {
  return FORBIDDEN_PATTERNS.some((re) => re.test(path));
}

/**
 * Accept only same-origin relative API paths whose normalized pathname is explicitly
 * allow-listed. Query parameters are permitted; fragments, absolute URLs, path traversal,
 * backslashes, and encoded path separators are rejected.
 */
export function isAllowedApiPath(path: string): boolean {
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("\\") ||
    path.includes("#") ||
    /%(?:2f|5c)/i.test(path)
  ) {
    return false;
  }

  const queryIndex = path.indexOf("?");
  const rawPath = queryIndex === -1 ? path : path.slice(0, queryIndex);

  try {
    const parsed = new URL(path, "https://nova.invalid");
    return (
      parsed.origin === "https://nova.invalid" &&
      parsed.pathname === rawPath &&
      ALLOWED_API_PATH_SET.has(parsed.pathname)
    );
  } catch {
    return false;
  }
}

export function assertReadOnlyRequest(method: string, path: string): void {
  if (method.toUpperCase() !== "GET") {
    throw new Error(`Blocked by safety policy: ${method} ${path} (client is read-only)`);
  }
  if (isForbiddenPath(path)) {
    throw new Error(`Blocked by safety policy: ${path} is a trading/funds endpoint`);
  }
  if (!isAllowedApiPath(path)) {
    throw new Error(`Blocked by safety policy: ${path} is not an allow-listed API path`);
  }
}
