import { NextResponse } from 'next/server';
import { createBrokerSystemHubClient, readExnessBrokerStatus } from '../../../../lib/broker-system-hub.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SYSTEM_HUB_URL = (
  process.env.SYSTEM_HUB_URL ||
  process.env.NEXT_PUBLIC_SYSTEM_HUB_URL ||
  'https://voom-system-hub.suwapat787.workers.dev'
).replace(/\/$/, '');

const publicMarkets = {
  okx: {
    url: 'https://www.okx.com/api/v5/public/time',
    valid: (data) => data?.code === '0' && Boolean(data?.data?.[0]?.ts),
  },
  coinbase: {
    url: 'https://api.exchange.coinbase.com/time',
    valid: (data) => Boolean(data?.iso || data?.epoch),
  },
  kraken: {
    url: 'https://api.kraken.com/0/public/Time',
    valid: (data) => typeof data?.result?.unixtime === 'number' || Boolean(data?.result?.rfc1123),
  },
  bitget: {
    url: 'https://api.bitget.com/api/v2/public/time',
    valid: (data) => data?.code === '00000' && Boolean(data?.data?.serverTime),
  },
};

function result(broker, status, detail, extra = {}) {
  return {
    broker,
    status,
    connected: status === 'connected',
    accountConnected: status === 'connected',
    detail,
    checkedAt: new Date().toISOString(),
    mode: 'read-only',
    environment: broker === 'mt5' ? 'demo' : undefined,
    tradingEnabled: false,
    ordersEnabled: false,
    executionEnabled: false,
    liveTradingEnabled: false,
    ...extra,
  };
}

function getBearerToken(request) {
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') || '');
  return match?.[1] || null;
}

function response(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

async function publicMarket(broker) {
  const config = publicMarkets[broker];
  try {
    const upstream = await fetch(config.url, {
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
      headers: { Accept: 'application/json' },
    });
    if (!upstream.ok) {
      return result(broker, 'market_unavailable', 'Public market endpoint returned HTTP ' + upstream.status + '.', {
        accountConnected: false,
        checkType: 'public_market_only',
      });
    }
    const data = await upstream.json();
    if (!config.valid(data)) {
      return result(broker, 'market_unavailable', 'Public market response failed validation.', {
        accountConnected: false,
        checkType: 'public_market_only',
      });
    }
    return result(broker, 'market_data_available', 'Public market endpoint responded. This does not verify a customer account.', {
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

async function mt5Status(request, createRequest) {
  const accessToken = getBearerToken(request);
  if (!accessToken) {
    return response(result('mt5', 'auth_required', 'กรุณาเข้าสู่ระบบก่อนตรวจสอบบัญชี Exness MT5 Demo'), 401);
  }

  let client;
  try {
    client = createBrokerSystemHubClient({ hubUrl: SYSTEM_HUB_URL });
  } catch {
    return response(result('mt5', 'unavailable', 'System Hub ยังไม่ได้ตั้งค่าเป็น HTTPS endpoint ที่เชื่อถือได้'), 503);
  }

  const checked = await readExnessBrokerStatus({
    client,
    accessToken,
    createIfMissing: createRequest,
  });
  return response(checked.body, checked.status);
}

export async function GET(request) {
  const broker = new URL(request.url).searchParams.get('broker');
  const supported = ['mt5', 'binance', 'bybit', ...Object.keys(publicMarkets)];
  if (!broker || !supported.includes(broker)) {
    return response({
      error: 'Unsupported broker.',
      tradingEnabled: false,
      ordersEnabled: false,
      executionEnabled: false,
      liveTradingEnabled: false,
    }, 400);
  }

  if (Object.hasOwn(publicMarkets, broker)) {
    return response(await publicMarket(broker));
  }
  if (broker === 'mt5') return mt5Status(request, false);

  return response(result(
    broker,
    'auth_required',
    'การตรวจบัญชีส่วนตัวของโบรกเกอร์นี้ยังไม่เปิดใช้งาน; ไม่มีการอ่าน credentials หรือส่งคำสั่งซื้อขาย',
    { connected: false, accountConnected: false, checkType: 'private_account_blocked' },
  ), 401);
}

export async function POST(request) {
  if (new URL(request.url).searchParams.get('broker') !== 'mt5') {
    return response({
      error: 'Only authenticated MT5 Demo connection requests are supported.',
      tradingEnabled: false,
      ordersEnabled: false,
      executionEnabled: false,
      liveTradingEnabled: false,
    }, 400);
  }
  return mt5Status(request, true);
}
