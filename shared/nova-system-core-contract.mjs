/**
 * NOVA System Core v1 — dependency-free policy contract.
 *
 * This module is a deterministic contract/reference layer, not an authorization
 * service. Production adapters must supply verified server-side identity and
 * tenant context; never construct that context from model or browser input.
 */
export const NOVA_SYSTEM_CORE_VERSION = "nova-system-core.v1";

export const NOVA_SYSTEM_CORE = Object.freeze({
  version: NOVA_SYSTEM_CORE_VERSION,
  controlPlane: "integrations/system-hub",
  modules: Object.freeze([
    Object.freeze({ id: "identity", owner: "supabase-auth", responsibility: "verified-principal" }),
    Object.freeze({ id: "security", owner: "system-hub", responsibility: "policy-and-tenant-authorization" }),
    Object.freeze({ id: "intelligence", owner: "nova-ai-worker", responsibility: "bounded-analysis" }),
    Object.freeze({ id: "data", owner: "central-data-plane", responsibility: "validated-data-and-provenance" }),
    Object.freeze({ id: "workflow", owner: "approval-lifecycle", responsibility: "durable-human-review" }),
    Object.freeze({ id: "learning", owner: "research-runtime", responsibility: "offline-evaluation-only" }),
    Object.freeze({ id: "integration", owner: "system-hub", responsibility: "allowlisted-adapter-routing" }),
    Object.freeze({ id: "observability", owner: "system-hub", responsibility: "sanitized-audit-and-health" }),
  ]),
  allowedCapabilities: Object.freeze([
    "system.health.read",
    "integration.registry.read",
    "connection.own.read",
    "market.quote.read",
    "market.candles.read",
    "account.summary.read",
    "research.analysis.run",
    "strategy.draft.create",
    "approval.request.create",
    "learning.evaluation.read",
  ]),
  forbiddenCapabilities: Object.freeze([
    "broker.order.submit",
    "broker.order.modify",
    "broker.order.cancel",
    "broker.position.close",
    "broker.funds.transfer",
    "broker.funds.withdraw",
    "broker.credentials.export",
    "secret.value.read",
    "secret.value.write",
    "runtime.arbitrary-url.fetch",
  ]),
  invariants: Object.freeze({
    serverAuthoritativeIdentity: true,
    tenantIsolation: true,
    secretValuesNeverReachBrowserOrModel: true,
    fixedAllowlistedAdaptersOnly: true,
    auditSanitizedEvents: true,
    humanApprovalDoesNotGrantBrokerExecution: true,
    ordersEnabled: false,
    executionEnabled: false,
    liveTradingEnabled: false,
    zeroNewSpend: true,
  }),
});

const ALLOWED = new Set(NOVA_SYSTEM_CORE.allowedCapabilities);
const FORBIDDEN = new Set(NOVA_SYSTEM_CORE.forbiddenCapabilities);

const deny = (reason) => Object.freeze({ allowed: false, reason });

/**
 * Evaluate a capability using trusted context supplied by a server adapter.
 * This is a guardrail helper only; it does not validate JWTs or query RLS.
 */
export function evaluateCoreCapability(request, trustedContext) {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    return deny("request_invalid");
  }
  if (!trustedContext || typeof trustedContext !== "object") {
    return deny("trusted_context_required");
  }
  if (trustedContext.identityVerified !== true) return deny("identity_unverified");
  if (trustedContext.tenantAuthorized !== true) return deny("tenant_not_authorized");

  const capability = request.capability;
  if (typeof capability !== "string" || !capability) return deny("capability_invalid");
  if (FORBIDDEN.has(capability)) return deny("capability_forbidden");
  if (!ALLOWED.has(capability)) return deny("capability_not_allowlisted");

  if (request.upstreamUrl !== undefined) return deny("caller_selected_upstream_forbidden");
  if (request.secret !== undefined || request.credential !== undefined) {
    return deny("secret_material_forbidden");
  }

  return Object.freeze({
    allowed: true,
    capability,
    policyVersion: NOVA_SYSTEM_CORE_VERSION,
    executionEnabled: false,
    liveTradingEnabled: false,
  });
}
