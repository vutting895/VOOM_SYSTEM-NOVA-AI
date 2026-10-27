import { createHmac } from 'node:crypto';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const timeoutMs = 5000;
const result = (broker, status, detail, extra = {}) => ({
  broker,
  status,
  connected: status === 'account_verified',
  detail,
  checkedAt: new Date().toISOString(),
  tradingEnabled: false,
  ordersSubmitted: false,
  ...extra,
});

// Public market endpoints do not verify a customer account.
const publicMarkets = {
  okx: {
    url: 'https://www.okx.com/api/v5/public/time',
    valid: d => d?.code === '0' && Boolean(d?.data?.[0]?.ts),
  },
  coinbase: {
    url: 'https://api.exchange.coinbase.com/time',
    valid: d => Boolean(d?.iso || d?.epoch),
  },
  kraken: {
    url: 'https://api.kraken.com/0/public/Time',
    valid: d => Array.isArray(d?.result?.unixtime) || typeof d?.result?.unixtime === 'number' || Boolean(d?.result?.rfc1123),
  },
  bitget: {
    url: 'https://api.bitget.com/api/v2/public/time',
    valid: d => d?.code === '00000' && Boolean(d?.data?.serverTime),
  },
};

async function checkPublicMarket(broker) {
  const config = publicMarkets[broker];
  try {
    const response = await fetch(config.url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      return result(broker, 'market_unavailable', 'Public market endpoint returned HTTP ' + response.status + '.', {
        accountConnected: false,
        checkType: 'public_market_only',
      });
    }
    const data = await response.json();
    if (!config.valid(data)) {
      return result(broker, 'market_unavailable', 'Public endpoint responded but its payload did not pass validation.', {
        accountConnected: false,
        checkType: 'public_market_only',
      });
    }
    return result(broker, 'market_data_available', 'Public market endpoint responded. This does not connect or verify a customer account.', {
      connected: false,
      accountConnected: false,
      checkType: 'public_market_only',
    });
  } catch {
    return result(broker, 'market_unavailable', 'Public market endpoint could not be verified within 5 seconds.', {
      accountConnected: false,
      checkType: 'public_market_only',
    });
  }
}

// Private account checks are restricted to the configured, email-confirmed Supabase admin.
// Until per-customer encrypted credentials are implemented, no customer can use the shared key.
async function verifyAdminSession(request) {
  const authUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  const adminEmail = process.env.VOOM_BROKER_ADMIN_EMAIL?.trim().toLowerCase();
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!authUrl || !anonKey || !adminEmail || !token) return false;

  try {
    const response = await fetch(new URL('/auth/v1/user', authUrl), {
      method: 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { apikey: anonKey, Authorization: 'Bearer ' + token, Accept: 'application/json' },
    });
    if (!response.ok) return false;
    const user = await response.json();
    return typeof user?.email === 'string'
      && user.email.toLowerCase() === adminEmail
      && Boolean(user.email_confirmed_at);
  } catch {
    return false;
  }
}

async function checkMt5CloudStatus() {
  const base = (process.env.VOOM_API_WORKER_URL || 'https://voom-system-api.suwapat787.workers.dev').replace(/\/$/, '');
  try {
    const response = await fetch(base + '/api/mt5/status', {
      method: 'GET', cache: 'no-store', signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return result('mt5', 'cloud_api_unavailable', 'Cloudflare MT5 status endpoint returned HTTP ' + response.status + '.', { accountConnected: false, checkType: 'cloud_mt5_telemetry', tradingEnabled: false, ordersSubmitted: false });
    const data = await response.json();
    const fresh = Boolean(data?.connected && !data?.stale && data?.telemetry);
    return result('mt5', fresh ? 'account_verified' : 'bridge_not_connected', fresh
      ? 'Cloudflare received fresh MT5 telemetry. This confirms telemetry only; it does not enable trading.'
      : 'Cloudflare API is reachable, but fresh MT5 terminal/account telemetry has not been confirmed.', {
      connected: fresh, accountConnected: fresh, checkType: 'cloud_mt5_telemetry',
      telemetryStale: Boolean(data?.stale), telemetryReceived: Boolean(data?.telemetry),
      tradingEnabled: false, ordersSubmitted: false,
    });
  } catch {
    return result('mt5', 'cloud_api_unavailable', 'Could not verify MT5 status through Cloudflare. No orders were sent.', { accountConnected: false, checkType: 'cloud_mt5_telemetry', tradingEnabled: false, ordersSubmitted: false });
  }
}
async function checkBinanceAccount() {
  const apiKey = process.env.BINANCE_API_KEY?.trim();
  const apiSecret = process.env.BINANCE_API_SECRET?.trim();

  if (!apiKey || !apiSecret) {
    return result('binance', 'credentials_not_configured',
      'Binance API credentials are not configured on the server. Add a dedicated read-only API key and secret to server environment variables.', {
        connected: false,
        accountConnected: false,
        checkType: 'signed_account_api',
      });
  }

  const timestamp = Date.now().toString();
  const query = new URLSearchParams({ timestamp, recvWindow: '5000' }).toString();
  const signature = createHmac('sha256', apiSecret).update(query).digest('hex');

  try {
    const response = await fetch('https://api.binance.com/api/v3/account?' + query + '&signature=' + signature, {
      method: 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'X-MBX-APIKEY': apiKey, Accept: 'application/json' },
    });

    if (response.ok) {
      const data = await response.json();
      if (data && typeof data.canTrade === 'boolean' && Array.isArray(data.balances)) {
        return result('binance', 'account_verified',
          'Binance accepted the signed account verification request. Account details were not returned. Confirm the API key is read-only and withdrawals are disabled.', {
            connected: true,
            accountConnected: true,
            checkType: 'signed_account_api',
            permissionReviewRequired: true,
          });
      }
      return result('binance', 'invalid_response', 'Binance returned an unexpected account payload.', {
        connected: false, accountConnected: false, checkType: 'signed_account_api',
      });
    }

    if (response.status === 401 || response.status === 403) {
      return result('binance', 'account_verification_failed',
        'Binance rejected the signed account request. Verify server-side credentials, permissions, IP restrictions, and system clock.', {
          connected: false, accountConnected: false, checkType: 'signed_account_api', upstreamStatus: response.status,
        });
    }
    return result('binance', 'broker_api_error',
      'Binance account verification did not succeed (HTTP ' + response.status + '). No account data was returned.', {
        connected: false, accountConnected: false, checkType: 'signed_account_api', upstreamStatus: response.status,
      });
  } catch {
    return result('binance', 'broker_unreachable',
      'Binance account verification timed out or could not reach the API. No account data was returned.', {
        connected: false, accountConnected: false, checkType: 'signed_account_api',
      });
  }
}

async function accountAuthRequired(broker) {
  return result(broker, 'auth_required',
    'Private account checks are not implemented for this broker yet. No credentials were read and no orders were sent.', {
      connected: false, accountConnected: false, checkType: 'private_account_blocked',
    });
}

export async function GET(request) {
  const broker = new URL(request.url).searchParams.get('broker');
  const supported = ['mt5', 'binance', 'bybit', 'okx', 'coinbase', 'kraken', 'bitget', 'exness'];

  if (!broker || !supported.includes(broker)) {
    return NextResponse.json({
      error: 'Unsupported broker. Use exness, binance, bybit, okx, coinbase, kraken, or bitget.',
      tradingEnabled: false,
      ordersSubmitted: false,
    }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }

  let data;
  if (broker === 'mt5') {
    data = await checkMt5CloudStatus();
  } else if (broker === 'exness') {
    // Safe onboarding stage only: no API credentials are read and no private Exness request is sent.
    // Signed account verification must wait until API access is confirmed and per-user credential isolation is ready.
    data = result('exness', 'api_access_unverified',
      'Exness API access has not been checked in Personal Area yet. No credentials were read, no private account data was requested, and no orders were sent.', {
        connected: false,
        accountConnected: false,
        checkType: 'eligibility_check_required',
        nextStep: 'Open Exness Personal Area and check whether API / Key Management is available for the selected trading account. Do not enter MT5 login credentials here.',
      });
  } else if (broker === 'binance') {
    if (!(await verifyAdminSession(request))) {
      data = result('binance', 'auth_required',
        'Sign in with the configured, email-confirmed administrator account before checking private account connectivity. Public requests cannot probe server-side broker credentials.', {
          connected: false, accountConnected: false, checkType: 'admin_auth_required',
        });
      return NextResponse.json(data, {
        status: 401,
        headers: { 'Cache-Control': 'no-store, max-age=0', 'Pragma': 'no-cache', 'X-Content-Type-Options': 'nosniff' },
      });
    }
    data = await checkBinanceAccount();
  } else if (Object.hasOwn(publicMarkets, broker)) {
    data = await checkPublicMarket(broker);
  } else {
    data = await accountAuthRequired(broker);
  }

  return NextResponse.json(data, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'Pragma': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
