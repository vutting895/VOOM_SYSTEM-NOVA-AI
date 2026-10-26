import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const timeoutMs = 5000;
const result = (broker, status, detail, extra = {}) => ({
  broker,
  status,
  connected: status === 'connected',
  detail,
  checkedAt: new Date().toISOString(),
  tradingEnabled: false,
  ...extra,
});

// Public market endpoints only. A healthy public endpoint does NOT mean a customer
// account is connected. Private account checks stay blocked until user auth,
// tenant isolation and per-customer credential storage are implemented.
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

async function accountAuthRequired(broker, detail) {
  return result(broker, 'auth_required', detail, {
    connected: false,
    accountConnected: false,
    checkType: 'private_account_blocked',
  });
}

export async function GET(request) {
  const broker = new URL(request.url).searchParams.get('broker');
  const supported = [
    'mt5', 'oanda',
    'binance', 'bybit', 'okx', 'coinbase', 'kraken', 'bitget',
    'alpaca', 'ibkr', 'schwab', 'settrade',
  ];
  if (!broker || !supported.includes(broker)) {
    return NextResponse.json({
      error: 'Unsupported broker. Choose a provider from the Broker Hub catalog.',
      tradingEnabled: false,
    }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }

  if (Object.hasOwn(publicMarkets, broker)) {
    return NextResponse.json(await checkPublicMarket(broker), {
      headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  }

  const detail = broker === 'mt5'
    ? 'MT5 bridge checks are not enabled until a secured Windows/VPS bridge, authenticated user session and per-user bridge authorization are implemented.'
    : broker === 'oanda'
      ? 'OANDA private account status is not checked here. Implement and verify the provider-approved API authorization, user session and per-user credential isolation first.'
      : broker === 'alpaca'
        ? 'Alpaca account status is not checked here. Use the existing OAuth integration only after verifying its callback, token encryption, user session and Paper Trading-only constraints.'
        : 'Private account checks are disabled until provider authorization, authenticated user sessions, tenant isolation and per-user credential storage are implemented. No credentials were read and no orders were sent.';
  return NextResponse.json(await accountAuthRequired(broker, detail), {
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}
