import { createHash, randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";
import { authenticateAgentRequest, agentApiJson, readAgentJson } from "../../../lib/agent-approval-server.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEFRAMES = new Set(["M1", "M5", "M15", "M30", "H1", "H4", "D1"]);
const DECIMAL = /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
const MAX_RAW_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 10000;

function decimalParts(value, field) {
  if (typeof value !== "string" || value.length > 48 || !DECIMAL.test(value)) {
    throw new Error(field + "_must_be_exact_decimal_string");
  }
  const [whole, fraction = ""] = value.split(".");
  return { integer: BigInt(whole + fraction), scale: fraction.length };
}

function compareDecimal(a, b) {
  const scale = Math.max(a.scale, b.scale);
  const left = a.integer * (10n ** BigInt(scale - a.scale));
  const right = b.integer * (10n ** BigInt(scale - b.scale));
  return left < right ? -1 : left > right ? 1 : 0;
}

function validateCandles(candles) {
  if (!Array.isArray(candles) || candles.length < 3 || candles.length > MAX_ROWS) {
    throw new Error("dataset_row_count_out_of_range");
  }
  let previous = -Infinity;
  const normalized = candles.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("invalid_candle_" + index);
    const stamp = typeof row.timestamp === "string" ? Date.parse(row.timestamp) : NaN;
    if (!Number.isFinite(stamp) || stamp <= previous) throw new Error("timestamps_must_be_valid_and_increasing");
    previous = stamp;
    const prices = Object.fromEntries(["open", "high", "low", "close"].map((key) => [key, decimalParts(row[key], "candle_" + index + "_" + key)]));
    const volume = row.volume === undefined ? "0" : row.volume;
    const volumeParts = decimalParts(volume, "candle_" + index + "_volume");
    if (volumeParts.integer < 0n) throw new Error("volume_must_be_non_negative");
    if (compareDecimal(prices.high, prices.open) < 0
      || compareDecimal(prices.high, prices.close) < 0
      || compareDecimal(prices.high, prices.low) < 0
      || compareDecimal(prices.low, prices.open) > 0
      || compareDecimal(prices.low, prices.close) > 0) {
      throw new Error("invalid_ohlc_relationship_" + index);
    }
    return {
      timestamp: new Date(stamp).toISOString(),
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume,
    };
  });
  return normalized;
}

export async function POST(request) {
  const auth = await authenticateAgentRequest(request);
  if (!auth.ok) return auth.response;

  const parsed = await readAgentJson(request, MAX_RAW_BYTES);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;
  if (Object.keys(body).some((key) => !["symbol", "timeframe", "provider", "candles"].includes(key))) {
    return agentApiJson({ error: "dataset_fields_invalid" }, 400);
  }
  const symbol = typeof body.symbol === "string" ? body.symbol.trim() : "";
  const timeframe = typeof body.timeframe === "string" ? body.timeframe.toUpperCase() : "";
  const provider = body.provider || "exness_mt5_demo";
  if (!/^[A-Za-z0-9._-]{1,40}$/.test(symbol)) return agentApiJson({ error: "dataset_symbol_invalid" }, 400);
  if (!TIMEFRAMES.has(timeframe)) return agentApiJson({ error: "dataset_timeframe_invalid" }, 400);
  if (provider !== "exness_mt5_demo") return agentApiJson({ error: "dataset_provider_not_allowed" }, 400);

  let candles;
  try { candles = validateCandles(body.candles); }
  catch (error) { return agentApiJson({ error: error.message || "dataset_validation_failed" }, 400); }

  const jsonl = candles.map((candle) => JSON.stringify(candle)).join("\n") + "\n";
  const compressed = gzipSync(Buffer.from(jsonl, "utf8"), { level: 9, mtime: 0 });
  const sha256 = createHash("sha256").update(compressed).digest("hex");
  const id = randomUUID();
  const storagePath = auth.user.id + "/" + id + "/dataset.jsonl.gz";
  const { error: uploadError } = await auth.supabase.storage
    .from("nova-datasets")
    .upload(storagePath, compressed, { contentType: "application/gzip", upsert: false });
  if (uploadError) {
    return agentApiJson({ error: "dataset_storage_unavailable", detail: uploadError.message }, 503);
  }

  const { data, error: insertError } = await auth.supabase
    .from("nova_market_datasets")
    .insert({
      id,
      owner_id: auth.user.id,
      symbol,
      timeframe,
      provider,
      range_start: candles[0].timestamp,
      range_end: candles[candles.length - 1].timestamp,
      row_count: candles.length,
      numeric_encoding: "decimal-string",
      compression: "gzip",
      content_sha256: sha256,
      storage_path: storagePath,
    })
    .select("id,symbol,timeframe,provider,range_start,range_end,row_count,numeric_encoding,compression,content_sha256,created_at")
    .single();

  if (insertError || !data) {
    await auth.supabase.storage.from("nova-datasets").remove([storagePath]);
    return agentApiJson({ error: "dataset_registry_unavailable" }, 503);
  }

  return agentApiJson({
    dataset: data,
    resolver_path: "/datasets/" + id,
    qr_payload: "/datasets/" + id,
    compressed_bytes: compressed.byteLength,
    original_bytes: Buffer.byteLength(jsonl, "utf8"),
    sha256,
    executionEnabled: false,
    liveTradingEnabled: false,
  }, 201);
}
