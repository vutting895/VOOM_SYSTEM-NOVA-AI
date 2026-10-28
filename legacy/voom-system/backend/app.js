import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

const telemetrySchema = z.object({
  source: z.literal('mt5-ea'),
  mode: z.literal('paper'),
  timestamp: z.string().datetime({ offset: true }),
  terminalConnected: z.boolean(),
  accountConnected: z.boolean(),
  symbol: z.string().min(1).max(32).optional(),
  timeframe: z.string().min(1).max(16).optional(),
  bid: z.number().finite().nonnegative().optional(),
  ask: z.number().finite().nonnegative().optional(),
  balance: z.number().finite().nonnegative().optional(),
  equity: z.number().finite().nonnegative().optional()
}).strict().refine((v) => v.bid === undefined || v.ask === undefined || v.ask >= v.bid, {
  message: 'ask must be greater than or equal to bid'
});

let latestTelemetry = null;

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', false);
  app.use(express.json({ limit: '32kb', strict: true }));

  const allowedOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');

    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Voom-Bridge-Secret');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    if (origin && !allowedOrigins.includes(origin)) {
      return res.status(403).json({ ok: false, error: 'origin_not_allowed' });
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'Voom_system API',
      tradingMode: 'paper',
      liveTradingEnabled: false,
      orderExecution: 'disabled',
      telemetryReceived: Boolean(latestTelemetry),
      telemetryTimestamp: latestTelemetry?.timestamp ?? null
    });
  });

  app.get('/api/mt5/status', (_req, res) => {
    // This route is publicly readable, so return only dashboard-safe fields.
    const telemetry = latestTelemetry ? {
      source: latestTelemetry.source,
      mode: latestTelemetry.mode,
      timestamp: latestTelemetry.timestamp,
      receivedAt: latestTelemetry.receivedAt,
      terminalConnected: latestTelemetry.terminalConnected,
      accountConnected: latestTelemetry.accountConnected,
      symbol: latestTelemetry.symbol ?? null,
      timeframe: latestTelemetry.timeframe ?? null,
      bid: latestTelemetry.bid ?? null,
      ask: latestTelemetry.ask ?? null
    } : null;
    res.json({
      ok: true,
      tradingMode: 'paper',
      liveTradingEnabled: false,
      orderExecution: 'disabled',
      telemetry
    });
  });

  // Public, read-only, sanitized payload for the hosted Base44 dashboard.
  // Never expose account balance/equity, secrets, or trading controls here.
  app.get('/api/dashboard/status', (_req, res) => {
    const now = Date.now();
    const timestampMs = latestTelemetry ? Date.parse(latestTelemetry.timestamp) : NaN;
    const receivedAtMs = latestTelemetry ? Date.parse(latestTelemetry.receivedAt) : NaN;
    const ageSeconds = Number.isFinite(timestampMs)
      ? Math.max(0, Math.floor((now - timestampMs) / 1000))
      : null;
    const fresh = Number.isFinite(receivedAtMs) && now - receivedAtMs <= 90_000;
    const connected = Boolean(
      latestTelemetry &&
      fresh &&
      latestTelemetry.terminalConnected &&
      latestTelemetry.accountConnected
    );

    res.json({
      ok: true,
      service: 'Voom_system API',
      connected,
      stale: Boolean(latestTelemetry) && !fresh,
      tradingMode: 'paper',
      liveTradingEnabled: false,
      orderExecution: 'disabled',
      telemetry: latestTelemetry ? {
        source: latestTelemetry.source,
        mode: latestTelemetry.mode,
        timestamp: latestTelemetry.timestamp,
        receivedAt: latestTelemetry.receivedAt,
        terminalConnected: latestTelemetry.terminalConnected,
        accountConnected: latestTelemetry.accountConnected,
        symbol: latestTelemetry.symbol ?? null,
        timeframe: latestTelemetry.timeframe ?? null,
        ageSeconds
      } : null
    });
  });

  app.post('/api/mt5/telemetry', (req, res) => {
    const configuredSecret = process.env.VOOM_BRIDGE_SHARED_SECRET;
    if (!configuredSecret || configuredSecret.length < 32) {
      return res.status(503).json({ ok: false, error: 'bridge_secret_not_configured' });
    }
    const suppliedSecret = req.get('X-Voom-Bridge-Secret') || '';
    if (!safeEqual(suppliedSecret, configuredSecret)) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }

    const parsed = telemetrySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'invalid_telemetry',
        issues: parsed.error.issues.map(({ path, message }) => ({ path, message }))
      });
    }

    const receivedAt = new Date().toISOString();
    const ageMs = Date.now() - Date.parse(parsed.data.timestamp);
    if (ageMs < -60_000 || ageMs > 5 * 60_000) {
      return res.status(400).json({ ok: false, error: 'stale_or_future_telemetry' });
    }

    latestTelemetry = { ...parsed.data, receivedAt };
    return res.status(202).json({
      ok: true,
      accepted: true,
      tradingMode: 'paper',
      liveTradingEnabled: false,
      orderExecution: 'disabled',
      receivedAt
    });
  });

  app.use((_req, res) => res.status(404).json({ ok: false, error: 'not_found' }));

  app.use((err, _req, res, _next) => {
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({ ok: false, error: 'payload_too_large' });
    }
    if (err instanceof SyntaxError && 'body' in err) {
      return res.status(400).json({ ok: false, error: 'invalid_json' });
    }
    return res.status(500).json({ ok: false, error: 'internal_error' });
  });

  return app;
}

export const app = createApp();
