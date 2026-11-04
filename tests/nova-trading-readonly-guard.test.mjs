import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (relativePath) => readFileSync(new URL(relativePath, root), 'utf8');
const server = read('server.ts');
const bridge = read('integrations/mt5-readonly-bridge/bridge.py');
const relay = read('integrations/mt5-readonly-bridge/bridge_relay_client.py');
const envExample = read('.env.example');
const settings = read('src/components/SystemSettingsView.tsx');
const terminal = read('src/components/LiveTradingTerminalView.tsx');
const novaChat = read('src/components/NovaChatOSView.tsx');

function section(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing section: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

test('default environment is Exness Demo read-only and all execution flags are off', () => {
  assert.match(envExample, /^VOOM_LIVE_TRADING_ENABLED=false$/m);
  assert.doesNotMatch(envExample, /(?:EXNESS|BINANCE|BYBIT)_(?:API_KEY|API_SECRET|PASSWORD)=/);
  assert.doesNotMatch(envExample, /^MT5_(?:TENANT_ID|BRIDGE_TOKEN)=/m);
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

test('only the tenant-scoped Exness Demo read-only bridge is retained', () => {
  assert.equal(existsSync(new URL('../backend/mt5_bridge.py', import.meta.url)), false);
  assert.ok(bridge.includes('TENANT_ID = os.environ.get("MT5_TENANT_ID"'));
  assert.ok(bridge.includes('BRIDGE_TOKEN = os.environ.get("MT5_BRIDGE_TOKEN"'));
  assert.ok(bridge.includes('hmac.compare_digest(tenant_id, TENANT_ID)'));
  assert.ok(bridge.includes('trade_mode != demo_mode'));
  assert.ok(bridge.includes('"exness" not in f"{server_name} {company_name}".lower()'));
  assert.ok(bridge.includes('@app.get("/api/account")'));
  assert.ok(bridge.includes('@app.get("/api/quotes")'));
  assert.ok(bridge.includes('request.method not in {"GET", "OPTIONS"}'));
  assert.ok(relay.includes('ALLOWED_PATHS = {"/health", "/api/account", "/api/symbols", "/api/quotes"}'));
  assert.ok(relay.includes('X-VOOM-TENANT-ID'));
  assert.doesNotMatch(bridge + relay, /order_send|TRADE_ACTION|@app\\.post|0\\.0\\.0\\.0/);
});

test('no broker account identifier or fake credential fingerprint is hardcoded in server metadata', () => {
  assert.doesNotMatch(server, /23908764|51092841|68019245|ed25519:[a-f0-9.]+/i);
  assert.match(server, /accountId = 'not_configured'/);
  assert.match(server, /provider: 'not_configured'/);
});


test('settings and trading terminal disclose unverified status and expose no broker credentials or fake positions', () => {
  assert.doesNotMatch(settings, /status: 'connected'/);
  assert.doesNotMatch(settings, /23908764|EXN-ED25519|Exness-MT5Real/i);
  assert.match(settings, /ไม่รับ MT5 password, API token, private key หรือ account ID/);
  assert.match(settings, /Live Trading OFF · Read-only/);
  assert.match(settings, /MT5 Bridge OFF/);
  assert.doesNotMatch(terminal, /Math\.random|setInterval|POS-904|FILLED_LIVE|Live Execution Desk/i);
  assert.match(terminal, /NO VERIFIED BROKER SESSION/i);
  assert.match(terminal, /Order submission disabled \(Read-only\)/);
});

test('server blocks high-impact API mutations before parsing request bodies', () => {
  const jsonParserAt = server.indexOf('app.use(express.json())');
  const guardAt = server.indexOf('const blockedMutation =');
  assert.notEqual(guardAt, -1);
  assert.ok(guardAt < jsonParserAt);
  assert.match(server, /req\.path === '\/api\/agent\/approvals\/decision'/);
  assert.match(server, /req\.path === '\/api\/intent\/interrupt\/resolve'/);
  assert.match(server, /broker_identity_unverified/);
  assert.match(server, /trading_execution_disabled/);
});

test('intent dispatcher refuses all write intents before creating an approval checkpoint', () => {
  const dispatch = section(server, "app.post('/api/intent/dispatch'", '// Approval resolution is research-only');
  assert.match(dispatch, /accessClass === 'WRITE_HIGH_IMPACT_INTERRUPT'/);
  assert.match(dispatch, /WRITE_INTENTS_DISABLED/);
  assert.doesNotMatch(dispatch, /place_trade_order|APPROVED_EXECUTED|EDITED_AND_EXECUTED|PAUSED_WAITING_HUMAN/);
  assert.doesNotMatch(server, /place_trade_order|APPROVED_EXECUTED|EDITED_AND_EXECUTED/);
  assert.doesNotMatch(server, /brokerDirectSlTpEnabled:\s*true/);
  assert.doesNotMatch(server, /brokerSideSlTpGuard:\s*true/);
});

test('customer-facing NOVA Chat is research-only and never suggests broker execution', () => {
  assert.doesNotMatch(novaChat, /23908764|DEMO LIVE|REAL LIVE|EX-MCP-FILLED/);
  assert.doesNotMatch(novaChat, /todayProfit|todayCloses|profitRef|MINI_CALENDAR_DAYS/);
  assert.doesNotMatch(novaChat, /handleResolveInterrupt|EDIT_AND_APPROVE|เปิด BUY|place_trade_order/);
  assert.doesNotMatch(novaChat, /ยืนยันส่งคำสั่ง|Approve &amp; Re-validate Token|Broker-Side Direct SL\/TP Worker: ACTIVE/);
  assert.match(novaChat, /NOT CONFIGURED · NOT VERIFIED/);
  assert.match(novaChat, /NON-EXECUTABLE/);
  assert.match(novaChat, /RESEARCH CALENDAR/);
});
