// Read-only inventory of data sources already consumed by the NOVA System Integration Hub.
// This catalog describes supported paths; it does not claim that a provider is reachable.
export const DATA_SOURCE_CATALOG_VERSION = "1.0.0";

const SOURCES = [
  {
    id: "supabase-auth",
    domain: "identity",
    transport: "supabase-auth-rest",
    resources: ["authenticated_user_identity"],
    access: "user_session",
    tenantBoundary: "authenticated_user",
    verification: "per_request",
    mode: "read-only"
  },
  {
    id: "supabase-postgrest",
    domain: "application-data",
    transport: "supabase-postgrest",
    resources: ["own_broker_connections"],
    access: "forwarded_user_session",
    tenantBoundary: "supabase_rls_and_user_id",
    verification: "per_request",
    mode: "read-only"
  },
  {
    id: "exness-mt5-demo",
    domain: "broker-and-market-data",
    transport: "system-hub-to-mt5-readonly-proxy",
    resources: ["demo_account_snapshot", "quotes", "candles"],
    access: "authenticated_connection",
    tenantBoundary: "connection_owner_and_bridge_route",
    verification: "per_connection_request",
    mode: "read-only",
    capabilities: ["mt5.account.read", "mt5.quotes.read"],
    prohibitedCapabilities: ["order.submit", "position.modify", "withdrawal", "transfer"]
  }
];

export function getDataSourceCatalog() {
  return SOURCES.map((source) => ({
    ...source,
    resources: [...source.resources],
    ...(source.capabilities ? { capabilities: [...source.capabilities] } : {}),
    ...(source.prohibitedCapabilities ? { prohibitedCapabilities: [...source.prohibitedCapabilities] } : {})
  }));
}
