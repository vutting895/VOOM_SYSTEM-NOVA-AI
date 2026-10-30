export const CUSTOMER_MARKETS = Object.freeze([
  Object.freeze({ value: 'XAU/USD', label: 'XAUUSD · Gold' }),
  Object.freeze({ value: 'BTC/USDT', label: 'BTC / USDT' }),
  Object.freeze({ value: 'ETH/USDT', label: 'ETH / USDT' }),
  Object.freeze({ value: 'EUR/USD', label: 'EUR / USD' }),
  Object.freeze({ value: 'US30', label: 'US30 Index' }),
]);

export const CUSTOMER_RISK_PROFILES = Object.freeze([
  Object.freeze({ value: 'low', label: 'Conservative', detail: 'เน้นการคัดกรองและความระมัดระวัง' }),
  Object.freeze({ value: 'medium', label: 'Balanced', detail: 'สมดุลระหว่างโอกาสและความเสี่ยง' }),
  Object.freeze({ value: 'high', label: 'Advanced', detail: 'สำหรับการวิจัยเชิงลึก ไม่ใช่การเพิ่มความเสี่ยงอัตโนมัติ' }),
]);

export const CUSTOMER_ANALYSIS_STYLES = Object.freeze([
  Object.freeze({ value: 'guided', label: 'Guided · อธิบายเป็นขั้นตอน' }),
  Object.freeze({ value: 'technical', label: 'Technical · เน้นข้อมูลเชิงเทคนิค' }),
]);

export const CUSTOMER_STRATEGIES = Object.freeze([
  Object.freeze({
    id: 'smc-precision',
    code: 'STRATEGY 001',
    name: 'SMC Precision',
    description: 'อ่านโครงสร้างตลาดและสภาพคล่อง เพื่อจัดทำแผนวิจัยที่อธิบายเหตุผลได้',
    focus: 'BOS · CHoCH · Order Blocks · FVG',
    markets: 'Forex · Metals · Crypto',
    defaultMarket: 'XAU/USD',
    timeframe: 'H1 · H4',
  }),
  Object.freeze({
    id: 'wave3-confluence',
    code: 'STRATEGY 002',
    name: 'Wave3 Confluence',
    description: 'ผสาน Wave Structure, Fibonacci Retracement และ SMC เพื่อค้นหาจังหวะที่มี confluence',
    focus: 'Wave 1/2 · Fibonacci · SMC',
    markets: 'XAUUSD · BTCUSD',
    defaultMarket: 'XAU/USD',
    timeframe: 'H1 · H4',
  }),
  Object.freeze({
    id: 'ai-market-scout',
    code: 'STRATEGY 003',
    name: 'AI Market Scout',
    description: 'ผู้ช่วยสำรวจบริบทตลาดและจัดลำดับสินทรัพย์ที่ควรศึกษาต่อ โดยไม่สร้างสัญญาณซื้อขายขึ้นเอง',
    focus: 'Market Context · Research · Watchlist',
    markets: 'Cross-market research',
    defaultMarket: 'BTC/USDT',
    timeframe: 'Multi-timeframe',
  }),
]);

const MARKET_VALUES = new Set(CUSTOMER_MARKETS.map((market) => market.value));
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

  return Object.freeze({
    schemaVersion: 'nova.customer-workspace.v1',
    strategyId: strategy.id,
    market: MARKET_VALUES.has(value.market) ? value.market : strategy.defaultMarket,
    riskProfile: RISK_VALUES.has(value.riskProfile) ? value.riskProfile : 'low',
    analysisStyle: ANALYSIS_VALUES.has(value.analysisStyle) ? value.analysisStyle : 'guided',
  });
}

export function customerWorkspaceStorageKey(userId) {
  if (typeof userId !== 'string' || !USER_ID_PATTERN.test(userId)) return null;
  return 'voom:nova:customer-workspace:v1:' + userId.toLowerCase();
}
