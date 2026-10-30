const PROVIDERS = Object.freeze([
  Object.freeze({
    id: "exness_mt5",
    name: "Exness MT5",
    status: "supported",
    customerConnectEnabled: true,
    environments: ["demo"],
    connectionMode: "existing_tenant_bridge",
    supportedOperations: ["connection_status", "health_check", "account_snapshot", "market_data"],
    capabilities: Object.freeze({
      accountRead: true,
      marketDataRead: true,
      orderSubmission: false,
      tradeMutation: false,
      withdrawal: false,
      transfer: false
    }),
    restrictions: ["demo_only", "dedicated_tenant_bridge_required", "read_only"]
  }),
  Object.freeze({
    id: "ibkr",
    name: "Interactive Brokers",
    status: "planned",
    customerConnectEnabled: false,
    environments: ["paper"],
    connectionMode: "isolated_gateway_or_customer_connector",
    blockedReason: "isolated_gateway_not_provisioned",
    supportedOperations: [],
    capabilities: Object.freeze({
      accountRead: false,
      marketDataRead: false,
      orderSubmission: false,
      tradeMutation: false,
      withdrawal: false,
      transfer: false
    }),
    restrictions: ["no_customer_host_or_port", "read_only_adapter_review_required"]
  }),
  Object.freeze({
    id: "binance",
    name: "Binance",
    status: "planned",
    customerConnectEnabled: false,
    environments: ["production"],
    connectionMode: "owner_scoped_read_only_api_key",
    blockedReason: "credential_vault_and_key_scope_gate",
    supportedOperations: [],
    capabilities: Object.freeze({
      accountRead: false,
      marketDataRead: false,
      orderSubmission: false,
      tradeMutation: false,
      withdrawal: false,
      transfer: false
    }),
    restrictions: ["vault_gate_required", "trade_and_withdrawal_permissions_must_be_disabled"]
  }),
  Object.freeze({
    id: "bybit",
    name: "Bybit",
    status: "planned",
    customerConnectEnabled: false,
    environments: ["production"],
    connectionMode: "owner_scoped_read_only_api_key",
    blockedReason: "credential_vault_and_key_scope_gate",
    supportedOperations: [],
    capabilities: Object.freeze({
      accountRead: false,
      marketDataRead: false,
      orderSubmission: false,
      tradeMutation: false,
      withdrawal: false,
      transfer: false
    }),
    restrictions: ["vault_gate_required", "trade_and_withdrawal_permissions_must_be_disabled"]
  })
]);

/**
 * Public, non-secret provider capability metadata for authenticated NOVA sessions.
 * This registry never accepts credentials, network destinations, account IDs or tenant IDs.
 * The System Hub remains authoritative for identity, ownership and operation authorization.
 */
export function listBrokerProviders() {
  return PROVIDERS.map((provider) => ({
    ...provider,
    environments: [...provider.environments],
    supportedOperations: [...provider.supportedOperations],
    restrictions: [...provider.restrictions],
    capabilities: { ...provider.capabilities }
  }));
}
