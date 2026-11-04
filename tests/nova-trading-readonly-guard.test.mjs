import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (relativePath) => readFileSync(new URL(relativePath, root), 'utf8');
const server = read('server.ts');
const bridge = read('backend/mt5_bridge.py');
const envExample = read('.env.example');

function section(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing section: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

test('default environment is Exness Demo read-only and all execution flags are off', () => {
  assert.match(envExample, /^MT5_BRIDGE_ENABLED=false$/m);
  assert.match(envExample, /^MT5_BRIDGE_MODE=demo-read-only$/m);
  assert.match(envExample, /^VOOM_LIVE_TRADING_ENABLED=false$/m);
  assert.doesNotMatch(envExample, /(?:EXNESS|BINANCE|BYBIT)_(?:API_KEY|API_SECRET|PASSWORD)=/);
  assert.match(server, /const liveTradingEnabled = false as const/);
  assert.match(server, /const mt5BridgeEnabled = false as const/);
});

test('live trading and MT5 bridge cannot be enabled through HTTP toggles', () => {
  const liveToggle = section(server, "app.post('/api/live-trading/toggle'", "app.post('/api/orders/execute'");
  const mt5Toggle = section(server, "app.post('/api/mt5-bridge/toggle'", "app.get('/api/live-trading/status'");
  assert.match(liveToggle, /status\(403\)/);
  assert.match(liveToggle, /LIVE_TRADING_ENABLE_DISABLED/);
  assert.match(mt5Toggle, /status\(403\)/);
  assert.match(mt5Toggle, /MT5_BRIDGE_ENABLE_DISABLED/);
});

test('order endpoint refuses writes and never fabricates a filled ticket', () => {
  const route = section(server, "app.post('/api/orders/execute'", '// Broker status is intentionally unverified');
  assert.match(route, /status\(403\)/);
  assert.match(route, /BROKER_WRITES_DISABLED/);
  assert.doesNotMatch(route, /FILLED_LIVE|EX-LIVE|ticketId|order_send/i);
});

test('approval resolution permits rejection only and cannot claim execution', () => {
  const route = section(server, "app.post('/api/intent/interrupt/resolve'", '// Layer 4: FastMCP Streamable HTTP Metadata Endpoint');
  assert.match(route, /action !== 'REJECT'/);
  assert.match(route, /WRITE_DISABLED/);
  assert.match(route, /BROKER_EXECUTION_DISABLED/);
  assert.doesNotMatch(route, /APPROVED_EXECUTED|EDITED_AND_EXECUTED|executionTicket|order_send/i);
});

test('broker status does not assert account verification or accept configuration payloads', () => {
  const routes = section(server, "app.get('/api/broker/status'", '// Fetch tradable currency/crypto pairs');
  assert.match(routes, /status: 'not_configured'/);
  assert.match(routes, /connected: false/);
  assert.match(routes, /Object\.keys\(body\)\.length > 0/);
  assert.match(routes, /BROKER_CONFIGURATION_INTAKE_DISABLED/);
  assert.doesNotMatch(routes, /accountConnected: true|REAL LIVE|credentials authenticated/);
});

test('MT5 bridge has read-only routes, requires a token, and refuses non-Exness Demo terminals', () => {
  assert.match(bridge, /BRIDGE_ENABLED = os\.getenv\("MT5_BRIDGE_ENABLED", "false"\)/);
  assert.match(bridge, /secrets\.compare_digest/);
  assert.match(bridge, /trade_mode != demo_mode or not exness_terminal/);
  assert.match(bridge, /@app\.get\("\/account"\)/);
  assert.match(bridge, /@app\.get\("\/quotes\/\{symbol\}"\)/);
  assert.match(bridge, /BRIDGE_HOST = "127\.0\.0\.1"/);
  assert.doesNotMatch(bridge, /order_send|TRADE_ACTION|@app\.post|EXNESS_LOGIN|EXNESS_PASSWORD|0\.0\.0\.0/);
});

test('no broker account identifier or fake credential fingerprint is hardcoded in server metadata', () => {
  assert.doesNotMatch(server, /23908764|51092841|68019245|ed25519:[a-f0-9.]+/i);
  assert.match(server, /accountId = 'not_configured'/);
  assert.match(server, /provider: 'not_configured'/);
});
