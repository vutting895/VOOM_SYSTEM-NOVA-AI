import strategyCatalog from '../data/nova-strategy-catalog.v1.json' with { type: 'json' };

const freezeOptions = (items) => Object.freeze(items.map((item) => Object.freeze({ ...item })));

export const CUSTOMER_MARKETS = freezeOptions(strategyCatalog.markets);
export const CUSTOMER_RISK_PROFILES = freezeOptions(strategyCatalog.riskProfiles);
export const CUSTOMER_ANALYSIS_STYLES = freezeOptions(strategyCatalog.analysisStyles);
export const CUSTOMER_STRATEGY_CATALOG_VERSION = strategyCatalog.catalogVersion;

export const CUSTOMER_STRATEGIES = Object.freeze(strategyCatalog.strategies.map((strategy) => Object.freeze({
  ...strategy,
  supportedMarkets: Object.freeze([...strategy.supportedMarkets]),
  supportedTimeframes: Object.freeze([...strategy.supportedTimeframes]),
  researchOperations: Object.freeze([...strategy.researchOperations]),
  engine: Object.freeze({ ...strategy.engine }),
  evidence: Object.freeze({ ...strategy.evidence }),
  safety: Object.freeze({ ...strategy.safety }),
})));

const RISK_VALUES = new Set(CUSTOMER_RISK_PROFILES.map((profile) => profile.value));
const ANALYSIS_VALUES = new Set(CUSTOMER_ANALYSIS_STYLES.map((style) => style.value));
const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getCustomerStrategy(strategyId) {
  if (typeof strategyId !== 'string') return null;
  return CUSTOMER_STRATEGIES.find((strategy) => strategy.id === strategyId) || null;
}

export function normalizeCustomerWorkspacePreferences(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const strategy = getCustomerStrategy(value.strategyId);
  if (!strategy) return null;

  const requestedMarket = typeof value.market === 'string' ? value.market : '';
  const market = strategy.supportedMarkets.includes(requestedMarket)
    ? requestedMarket
    : strategy.defaultMarket;

  return Object.freeze({
    schemaVersion: 'nova.customer-workspace.v1',
    strategyId: strategy.id,
    market,
    riskProfile: RISK_VALUES.has(value.riskProfile) ? value.riskProfile : 'low',
    analysisStyle: ANALYSIS_VALUES.has(value.analysisStyle) ? value.analysisStyle : 'guided',
  });
}

export function customerWorkspaceStorageKey(userId) {
  if (typeof userId !== 'string' || !USER_ID_PATTERN.test(userId)) return null;
  return 'voom:nova:customer-workspace:v1:' + userId.toLowerCase();
}
