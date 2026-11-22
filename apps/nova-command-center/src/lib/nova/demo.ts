/** Static DEMO data. Never presented as real. */
export const DEMO_WATCHLIST = [
  { symbol: "EURUSD", bid: 1.0842, ask: 1.0844, chg: 0.12 },
  { symbol: "GBPUSD", bid: 1.2671, ask: 1.2674, chg: -0.08 },
  { symbol: "USDJPY", bid: 151.32, ask: 151.35, chg: 0.31 },
  { symbol: "XAUUSD", bid: 2381.4, ask: 2381.9, chg: 0.54 },
  { symbol: "BTCUSD", bid: 67210, ask: 67240, chg: -1.12 },
];
export const DEMO_POSITIONS = [
  { id: "D-1001", symbol: "EURUSD", side: "BUY", volume: 0.1, open: 1.0821, pnl: 21.0 },
  { id: "D-1002", symbol: "XAUUSD", side: "SELL", volume: 0.05, open: 2390.1, pnl: 43.5 },
];
export const DEMO_ORDERS = [
  { id: "D-2001", symbol: "GBPUSD", type: "BUY LIMIT", volume: 0.1, price: 1.262 },
];
export const DEMO_HISTORY = [
  {
    id: "D-3001",
    symbol: "USDJPY",
    side: "BUY",
    volume: 0.2,
    pnl: -12.4,
    closed: "2026-11-20 14:02",
  },
  {
    id: "D-3002",
    symbol: "EURUSD",
    side: "SELL",
    volume: 0.1,
    pnl: 18.9,
    closed: "2026-11-19 09:41",
  },
];
export const DEMO_SERIES = Array.from(
  { length: 60 },
  (_, i) => 1.08 + Math.sin(i / 6) * 0.003 + (i % 7) * 0.0002,
);