const MT5_TIMEFRAMES = new Set(["M1", "M5", "M15", "M30", "H1", "H4", "D1"]);
const BINANCE_INTERVALS = new Set(["1m", "5m", "15m", "30m", "1h", "4h", "1d"]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function buildTradingToolRequest(input) {
  if (!isRecord(input)) throw new TypeError("Request body must be an object");

  if (input.action === "mt5_connection_status") {
    return { name: "mt5_connection_status", arguments: {} };
  }

  if (input.action !== "market_data") throw new TypeError("Unsupported action");

  const source = input.source;
  const symbol = String(input.symbol ?? "").trim();
  const timeframe = String(input.timeframe ?? "").trim();
  const count = Number(input.count);

  if (!Number.isInteger(count)) throw new TypeError("count must be an integer");

  if (source === "mt5") {
    if (!/^[A-Za-z0-9._-]{1,40}$/.test(symbol)) throw new TypeError("Invalid MT5 symbol");
    const normalizedTimeframe = timeframe.toUpperCase();
    if (!MT5_TIMEFRAMES.has(normalizedTimeframe)) throw new TypeError("Unsupported MT5 timeframe");
    if (count < 1 || count > 500) throw new TypeError("MT5 count must be between 1 and 500");
    return {
      name: "mt5_quotes",
      arguments: { symbol, timeframe: normalizedTimeframe, count }
    };
  }

  if (source === "binance") {
    const normalizedSymbol = symbol.toUpperCase();
    if (!/^[A-Z0-9]{5,20}$/.test(normalizedSymbol)) throw new TypeError("Invalid Binance symbol");
    if (!BINANCE_INTERVALS.has(timeframe)) throw new TypeError("Unsupported Binance interval");
    if (count < 20 || count > 500) throw new TypeError("Binance count must be between 20 and 500");
    return {
      name: "read_market_candles",
      arguments: { symbol: normalizedSymbol, interval: timeframe, limit: count }
    };
  }

  throw new TypeError("Unsupported market-data source");
}

export function decodeMcpToolResponse(envelope) {
  if (!isRecord(envelope)) throw new TypeError("Invalid MCP response");
  if (envelope.error) throw new Error("Remote analysis service returned an RPC error");

  const result = envelope.result;
  if (!isRecord(result)) throw new TypeError("MCP response is missing a result");
  const content = Array.isArray(result.content) ? result.content : [];
  const textBlock = content.find((item) => item?.type === "text" && typeof item.text === "string");
  if (result.isError === true) throw new Error(textBlock?.text || "Remote analysis tool failed");
  if (!textBlock) throw new TypeError("MCP response is missing its text result");

  try {
    return JSON.parse(textBlock.text);
  } catch {
    throw new TypeError("MCP tool returned malformed JSON");
  }
}

function toTimestamp(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeBar(bar) {
  if (!isRecord(bar)) return null;
  const open = Number(bar.open);
  const high = Number(bar.high);
  const low = Number(bar.low);
  const close = Number(bar.close);
  const time = toTimestamp(bar.time);
  const volume = Number(bar.volume ?? bar.tick_volume ?? 0);
  if (![open, high, low, close].every(Number.isFinite) || time === null) return null;
  if (high < low || open < low || open > high || close < low || close > high) return null;
  return { time, open, high, low, close, volume: Number.isFinite(volume) ? volume : 0 };
}

export function normalizeMarketPayload(source, payload) {
  if (!isRecord(payload)) throw new TypeError("Market-data response is invalid");

  if (source === "mt5") {
    if (payload.status !== "ok") {
      return {
        status: String(payload.status || "unavailable"),
        message: String(payload.message || payload.error || "Exness MT5 Demo data is not available"),
        bars: [],
        executionEnabled: false,
        liveTradingEnabled: false,
        ordersEnabled: false
      };
    }
    const quote = isRecord(payload.data) ? payload.data : {};
    const rawBars = Array.isArray(quote.bars) ? quote.bars : [];
    const bars = rawBars.map(normalizeBar).filter(Boolean);
    if (bars.length === 0) {
      return {
        status: "empty",
        message: "MT5 returned no valid OHLC bars for this symbol and timeframe.",
        bars: [],
        executionEnabled: false,
        liveTradingEnabled: false,
        ordersEnabled: false
      };
    }
    return {
      status: "data_verified",
      source: "Exness MT5 Demo",
      symbol: String(quote.symbol || payload.symbol || ""),
      timeframe: String(quote.timeframe || payload.timeframe || ""),
      digits: Number.isInteger(quote.digits) ? quote.digits : null,
      tick: isRecord(quote.tick) ? quote.tick : null,
      providerTimestamp: quote.as_of || null,
      bars,
      executionEnabled: false,
      liveTradingEnabled: false,
      ordersEnabled: false
    };
  }

  if (source === "binance") {
    const rawBars = Array.isArray(payload.candles) ? payload.candles : [];
    const bars = rawBars.map(normalizeBar).filter(Boolean);
    if (bars.length === 0) {
      return {
        status: "empty",
        message: "Binance returned no valid OHLC candles.",
        bars: [],
        executionEnabled: false,
        liveTradingEnabled: false,
        ordersEnabled: false
      };
    }
    return {
      status: "data_verified",
      source: "Binance public market data",
      symbol: String(payload.symbol || ""),
      timeframe: String(payload.interval || ""),
      digits: null,
      tick: null,
      providerTimestamp: null,
      bars,
      executionEnabled: false,
      liveTradingEnabled: false,
      ordersEnabled: false
    };
  }

  throw new TypeError("Unsupported market-data source");
}

function calculateEma(values, period) {
  if (values.length < period) return [];
  const multiplier = 2 / (period + 1);
  let previous = values[0];
  const output = [previous];
  for (let index = 1; index < values.length; index += 1) {
    previous = values[index] * multiplier + previous * (1 - multiplier);
    output.push(previous);
  }
  return output;
}

function calculateRsi(values, period = 14) {
  if (values.length <= period) return null;
  let gains = 0;
  let losses = 0;
  for (let index = values.length - period; index < values.length; index += 1) {
    const change = values[index] - values[index - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }
  const averageGain = gains / period;
  const averageLoss = losses / period;
  if (averageLoss === 0) return averageGain === 0 ? 50 : 100;
  const relativeStrength = averageGain / averageLoss;
  return 100 - (100 / (1 + relativeStrength));
}

/**
 * Descriptive technical analysis only. The most recent bar is excluded because
 * provider feeds may include an unfinished candle. It never creates an order signal.
 */
export function calculatePriceAnalysis(inputBars) {
  if (!Array.isArray(inputBars)) throw new TypeError("Bars must be an array");
  const validBars = inputBars.map(normalizeBar).filter(Boolean);
  const bars = validBars.length > 1 ? validBars.slice(0, -1) : [];
  const closes = bars.map((bar) => bar.close);
  if (closes.length < 27) {
    return {
      ready: false,
      reason: "At least 28 bars are required after excluding the latest potentially unfinished candle.",
      barsUsed: closes.length,
      orderSignal: null
    };
  }

  const ema12Series = calculateEma(closes, 12);
  const ema26Series = calculateEma(closes, 26);
  const ema12 = ema12Series.at(-1);
  const ema26 = ema26Series.at(-1);
  const lastClose = closes.at(-1);
  const recent = bars.slice(-20);
  const rangeLow = Math.min(...recent.map((bar) => bar.low));
  const rangeHigh = Math.max(...recent.map((bar) => bar.high));
  const rsi14 = calculateRsi(closes, 14);
  const trend = lastClose > ema12 && ema12 > ema26
    ? "bullish"
    : lastClose < ema12 && ema12 < ema26
      ? "bearish"
      : "mixed";

  let momentum = "neutral";
  if (rsi14 !== null && rsi14 >= 70) momentum = "high";
  else if (rsi14 !== null && rsi14 <= 30) momentum = "low";

  return {
    ready: true,
    barsUsed: bars.length,
    lastClose,
    ema12,
    ema26,
    rsi14,
    trend,
    momentum,
    rangeLow,
    rangeHigh,
    candles: bars,
    ema12Series,
    ema26Series,
    orderSignal: null,
    interpretation: trend === "bullish"
      ? "ราคาปิดอยู่เหนือ EMA 12 และ EMA 12 อยู่เหนือ EMA 26 — เป็นการเรียงตัวเชิงบวกในข้อมูลย้อนหลังชุดนี้"
      : trend === "bearish"
        ? "ราคาปิดอยู่ใต้ EMA 12 และ EMA 12 อยู่ใต้ EMA 26 — เป็นการเรียงตัวเชิงลบในข้อมูลย้อนหลังชุดนี้"
        : "EMA และราคายังไม่เรียงตัวไปในทิศทางเดียวกัน — ภาพรวมอยู่ในภาวะผสมหรือยังไม่ชัดเจน",
    limitations: [
      "คำอธิบายเชิงเทคนิคจากข้อมูลย้อนหลัง ไม่ใช่การคาดการณ์ผลตอบแทน",
      "ไม่มีการสร้างคำสั่งซื้อขายหรือ Entry/Stop Loss/Take Profit",
      "แท่งล่าสุดถูกตัดออกจากการคำนวณเพื่อลดความเสี่ยงจากแท่งที่ยังไม่ปิด",
      "EMA/RSI baseline ไม่ใช่ Neural Network inference และยังไม่ผ่านการประเมินความสามารถทำกำไร"
    ]
  };
}
