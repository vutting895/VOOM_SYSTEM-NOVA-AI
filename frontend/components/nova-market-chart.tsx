"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { getSupabaseBrowserClient } from "../lib/supabase-browser";

type HubConnection = {
  connectionId: string;
  provider: string;
  environment: string;
  recordStatus: string;
  readiness: string;
  bridgeAllocated: boolean;
};
type MarketSymbol = {
  name: string;
  description: string | null;
  visible: boolean | null;
  digits: number | null;
};
type Candle = { time: string; open: number; high: number; low: number; close: number };
type ChartCandle = { time: UTCTimestamp; open: number; high: number; low: number; close: number };
type QuotePayload = {
  state?: string;
  dataVerified?: boolean;
  mode?: string;
  order_submission_enabled?: boolean;
  quote?: {
    symbol?: string;
    timeframe?: string;
    bars?: Candle[];
    as_of?: string | null;
    order_submission_enabled?: boolean;
    mode?: string;
  };
  error?: string;
  detail?: string;
};

const HUB_URL = (process.env.NEXT_PUBLIC_SYSTEM_HUB_URL || "https://voom-system-hub.suwapat787.workers.dev").replace(/\/$/, "");
const supabase = getSupabaseBrowserClient();
const TIMEFRAMES = ["M1", "M5", "M15", "M30", "H1", "H4", "D1"];
const TIMEFRAME_SECONDS: Record<string, number> = {
  M1: 60, M5: 300, M15: 900, M30: 1800, H1: 3600, H4: 14400, D1: 86400,
};

function normalizeBars(input: Candle[], timeframe: string): { bars: ChartCandle[]; stale: boolean } {
  if (!Array.isArray(input) || input.length === 0 || input.length > 500) {
    throw new Error("MT5 ไม่ส่งแท่งราคาในช่วงข้อมูลที่อนุญาต");
  }
  const now = Date.now();
  let previous = 0;
  const bars = input.map((bar) => {
    const timestamp = Date.parse(bar.time);
    const values = [bar.open, bar.high, bar.low, bar.close];
    if (!Number.isFinite(timestamp) || timestamp <= previous || timestamp > now + 60_000) {
      throw new Error("ข้อมูลเวลาแท่งราคาไม่ถูกต้องหรือไม่เรียงตาม UTC");
    }
    if (!values.every((value) => typeof value === "number" && Number.isFinite(value) && value > 0)) {
      throw new Error("ข้อมูล OHLC ไม่ใช่ตัวเลขที่เชื่อถือได้");
    }
    if (bar.high < Math.max(bar.open, bar.close, bar.low) || bar.low > Math.min(bar.open, bar.close, bar.high)) {
      throw new Error("ข้อมูล OHLC ไม่ผ่านการตรวจสอบขอบเขตราคา");
    }
    previous = timestamp;
    return {
      time: Math.floor(timestamp / 1000) as UTCTimestamp,
      open: bar.open, high: bar.high, low: bar.low, close: bar.close,
    };
  });
  const latestSeconds = Number(bars[bars.length - 1].time);
  const stale = now / 1000 - latestSeconds > TIMEFRAME_SECONDS[timeframe] * 3;
  return { bars, stale };
}

export default function NovaMarketChart() {
  const chartHost = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [accessToken, setAccessToken] = useState("");
  const [connection, setConnection] = useState<HubConnection | null>(null);
  const [symbols, setSymbols] = useState<MarketSymbol[]>([]);
  const [symbol, setSymbol] = useState("");
  const [timeframe, setTimeframe] = useState("M5");
  const [bars, setBars] = useState<ChartCandle[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("กรุณาเข้าสู่ระบบเพื่ออ่านข้อมูลตลาดจาก Exness Demo");
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const [asOf, setAsOf] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => setAccessToken(data.session?.access_token || ""));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setAccessToken(session?.access_token || "");
      if (!session?.access_token) {
        setConnection(null); setSymbols([]); setSymbol(""); setBars([]);
        setStatus("ออกจากระบบแล้ว กรุณาเข้าสู่ระบบก่อนอ่านข้อมูลตลาด");
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    const controller = new AbortController();
    let active = true;
    async function discover() {
      setBusy(true); setError(""); setBars([]); setSymbols([]);
      setStatus("กำลังตรวจสอบสิทธิ์และค้นหารายชื่อสัญลักษณ์ MT5…");
      try {
        const headers = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };
        const connectionResponse = await fetch(`${HUB_URL}/v1/connections`, { headers, cache: "no-store", signal: controller.signal });
        const connectionPayload = await connectionResponse.json().catch(() => ({}));
        if (!connectionResponse.ok) throw new Error(connectionPayload.error || `อ่าน Connection ไม่สำเร็จ (HTTP ${connectionResponse.status})`);
        const ownConnection = (connectionPayload.connections || []).find((item: HubConnection) =>
          item.provider === "exness_mt5" && item.environment === "demo");
        if (!ownConnection) {
          if (active) setStatus("ยังไม่มีคำขอเชื่อมต่อ Exness Demo — ไปที่ Broker Hub เพื่อเริ่มเชื่อมต่อ");
          return;
        }
        if (ownConnection.recordStatus !== "connected" || !ownConnection.bridgeAllocated) {
          if (active) {
            setConnection(ownConnection);
            setStatus("รอการจัดสรร Bridge และ Tenant route เฉพาะบัญชี — ยังไม่มีข้อมูลตลาดที่ยืนยันแล้ว");
          }
          return;
        }
        const symbolResponse = await fetch(
          `${HUB_URL}/v1/connections/${encodeURIComponent(ownConnection.connectionId)}/symbols?limit=300`,
          { headers, cache: "no-store", signal: controller.signal }
        );
        const symbolPayload = await symbolResponse.json().catch(() => ({}));
        if (!symbolResponse.ok || symbolPayload.dataVerified !== true || !Array.isArray(symbolPayload.symbols)) {
          throw new Error(symbolPayload.state || symbolPayload.error || `ค้นหา Symbol ไม่สำเร็จ (HTTP ${symbolResponse.status})`);
        }
        if (active) {
          setConnection(ownConnection);
          setSymbols(symbolPayload.symbols);
          const first = symbolPayload.symbols.find((item: MarketSymbol) => item.visible) || symbolPayload.symbols[0];
          setSymbol(first?.name || "");
          setStatus(symbolPayload.symbols.length ? `ค้นพบ ${symbolPayload.symbols.length} สัญลักษณ์จาก Exness Demo` : "ไม่พบสัญลักษณ์ในบัญชี MT5");
        }
      } catch (cause) {
        if (active && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : "โหลด Symbol ไม่สำเร็จ");
      } finally {
        if (active) setBusy(false);
      }
    }
    void discover();
    return () => { active = false; controller.abort(); };
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken || !connection?.connectionId || !symbol) return;
    const connectionId = connection.connectionId;
    const controller = new AbortController();
    let active = true;
    async function loadCandles() {
      setBusy(true); setError(""); setBars([]); setStale(false); setAsOf(null);
      setStatus(`กำลังอ่าน ${symbol} ${timeframe} จาก Exness MT5 Demo…`);
      try {
        const query = new URLSearchParams({ symbol, timeframe, count: "300" });
        const response = await fetch(
          `${HUB_URL}/v1/connections/${encodeURIComponent(connectionId)}/quotes?${query.toString()}`,
          { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }, cache: "no-store", signal: controller.signal }
        );
        const payload = await response.json().catch(() => ({})) as QuotePayload;
        if (!response.ok || payload.dataVerified !== true || !payload.quote) {
          throw new Error(payload.state || payload.error || payload.detail || `อ่านแท่งราคาไม่สำเร็จ (HTTP ${response.status})`);
        }
        if (payload.quote.mode !== "read-only" || payload.quote.order_submission_enabled !== false) {
          throw new Error("ข้อมูลจาก Provider ไม่ผ่านข้อกำหนด Read-only");
        }
        const normalized = normalizeBars(payload.quote.bars || [], timeframe);
        if (active) {
          setBars(normalized.bars);
          setStale(normalized.stale);
          setAsOf(payload.quote.as_of || null);
          setStatus(normalized.stale ? "ได้รับแท่งราคาแล้ว แต่ข้อมูลล่าสุดเก่าเกินเกณฑ์ความสด" : "ได้รับแท่งราคาจริงและผ่านการตรวจสอบแล้ว");
        }
      } catch (cause) {
        if (active && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : "อ่านข้อมูลราคาไม่สำเร็จ");
      } finally {
        if (active) setBusy(false);
      }
    }
    void loadCandles();
    return () => { active = false; controller.abort(); };
  }, [accessToken, connection?.connectionId, symbol, timeframe]);

  useEffect(() => {
    if (!chartHost.current || bars.length === 0) {
      chartRef.current?.remove();
      chartRef.current = null;
      return;
    }
    chartRef.current?.remove();
    const chart = createChart(chartHost.current, {
      autoSize: true,
      height: 440,
      layout: {
        background: { type: ColorType.Solid, color: "#07131d" },
        textColor: "#9bb7c4",
        attributionLogo: true,
      },
      grid: {
        vertLines: { color: "rgba(105, 160, 180, 0.10)" },
        horzLines: { color: "rgba(105, 160, 180, 0.10)" },
      },
      rightPriceScale: { borderColor: "rgba(105, 160, 180, 0.22)" },
      timeScale: { borderColor: "rgba(105, 160, 180, 0.22)", timeVisible: true, secondsVisible: false },
      crosshair: { vertLine: { color: "rgba(98, 230, 243, 0.35)" }, horzLine: { color: "rgba(98, 230, 243, 0.35)" } },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#29c9a5", downColor: "#ef6b78",
      borderUpColor: "#29c9a5", borderDownColor: "#ef6b78",
      wickUpColor: "#29c9a5", wickDownColor: "#ef6b78",
    });
    series.setData(bars);
    chart.timeScale().fitContent();
    chartRef.current = chart;
    return () => { chart.remove(); if (chartRef.current === chart) chartRef.current = null; };
  }, [bars]);

  const selected = useMemo(() => symbols.find((item) => item.name === symbol), [symbols, symbol]);

  return (
    <section className="nova-market-chart">
      <style>{`
        .nova-market-chart{border:1px solid rgba(80,209,231,.2);background:linear-gradient(145deg,rgba(9,31,43,.9),rgba(5,17,27,.96));padding:18px;min-width:0}
        .nmc-toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px}
        .nmc-select{background:#091521;color:#dff8fc;border:1px solid #285064;border-radius:8px;padding:10px 12px;font-size:12px;min-width:120px}
        .nmc-status{color:#87a8b6;font-size:11px;line-height:1.7;margin:8px 0 12px}
        .nmc-status.error{color:#ffb8bd}.nmc-status.warn{color:#e9cb83}
        .nmc-chart{height:440px;width:100%;min-width:0}
        .nmc-empty{height:440px;display:grid;place-items:center;border:1px dashed rgba(105,160,180,.24);color:#7896a6;text-align:center;padding:24px;font-size:12px;line-height:1.8}
        .nmc-meta{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;color:#6f91a0;font-size:10px;margin-top:12px}
        .nmc-lock{color:#ffbd9f;font-size:10px;font-weight:800;letter-spacing:.08em}
        @media(max-width:600px){.nova-market-chart{padding:12px}.nmc-chart,.nmc-empty{height:340px}}
      `}</style>
      <div className="nmc-toolbar">
        <label className="nmc-lock">EXNESS DEMO · READ ONLY</label>
        <select className="nmc-select" aria-label="Market symbol" value={symbol} onChange={(event) => setSymbol(event.target.value)} disabled={!symbols.length || busy}>
          {!symbols.length && <option value="">รอ Symbol</option>}
          {symbols.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
        </select>
        <select className="nmc-select" aria-label="Timeframe" value={timeframe} onChange={(event) => setTimeframe(event.target.value)} disabled={busy}>
          {TIMEFRAMES.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <span className="nmc-meta">{selected?.description || "เลือกสัญลักษณ์จากรายการที่ค้นพบจริง"}</span>
      </div>
      {error ? <div className="nmc-status error" role="alert">{error}</div> : <div className={stale ? "nmc-status warn" : "nmc-status"} role="status">{status}{stale ? " · STALE DATA" : ""}</div>}
      {bars.length ? <div ref={chartHost} className="nmc-chart" aria-label={`Exness Demo ${symbol} ${timeframe} candlestick chart`} /> :
        <div className="nmc-empty">{busy ? "กำลังโหลดข้อมูลที่ยืนยันจาก MT5…" : error ? "ไม่มีการแสดงแท่งราคาจนกว่าจะได้รับข้อมูลที่ผ่านการตรวจสอบ" : status}</div>}
      <div className="nmc-meta">
        <span>{bars.length ? `${bars.length} candles · UTC` : "NO VERIFIED CANDLES"}</span>
        <span>{asOf ? `Provider as-of: ${asOf}` : "Provider timestamp not yet received"}</span>
        <span>SMC overlays: NEXT VALIDATION PHASE · Wave3: BLOCKED</span>
      </div>
      <p className="nmc-meta">Chart engine: TradingView Lightweight Charts · <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">TradingView</a> · <a href="/THIRD_PARTY_NOTICES.txt">Third-party notices</a></p>
    </section>
  );
}
