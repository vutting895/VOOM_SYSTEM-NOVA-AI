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

/**
 * Exact browser API allow-list. This is defense-in-depth only; the Worker must
 * independently authenticate, authorize, and route every request.
 */
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

export function assertReadOnlyRequest(method: string, path: string): void {
  if (method.toUpperCase() !== "GET") {
    throw new Error(\`Blocked by safety policy: \${method} \${path} (client is read-only)\`);
  }
  if (isForbiddenPath(path)) {
    throw new Error(\`Blocked by safety policy: \${path} is a trading/funds endpoint\`);
  }
  if (!(ALLOWED_API_PATHS as readonly string[]).includes(path)) {
    throw new Error(\`Blocked by safety policy: \${path} is not an exact allow-listed API path\`);
  }
}
