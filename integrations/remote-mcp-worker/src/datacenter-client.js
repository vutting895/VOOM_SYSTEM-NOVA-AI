"""Bounded client for the NOVA Learning Service MCP endpoint."""
const marketCalendarSchema = {
  type: "object",
  properties: {
    closed_intervals: {
      type: "array",
      maxItems: 5000,
      items: {
        type: "object",
        properties: {start: {type: "string"}, end: {type: "string"}},
        required: ["start", "end"],
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
};

const definitions = [
  ["dataset_list", "List the signed-in user's Datacenter datasets.", {limit:{type:"integer",minimum:1,maximum:200},status:{type:"string",enum:["PENDING","PASSED","FAILED","QUARANTINED","REJECTED","SUPERSEDED"]}}],
  ["dataset_get", "Read one immutable dataset version and quality receipt.", {dataset_id:{type:"string"},version:{type:"integer",minimum:1}}],
  ["dataset_validate", "Validate dataset provenance or inspect its persisted quality receipt.", {manifest:{type:"object"},dataset_id:{type:"string"},version:{type:"integer",minimum:1}}],
  ["dataset_register", "Register a metadata-only dataset version; it is not approved for training.", {manifest:{type:"object"}}],
  ["dataset_ingest", "Validate and persist OHLCV rows in Parquet/Zstandard. Only 100% passing datasets can be approved.", {manifest:{type:"object"},rows:{type:"array",minItems:1,maxItems:100000,items:{type:"object"}}}],
  ["dataset_validate_ohlcv", "Run strict UTC/OHLCV validation with explicit cadence and market closures.", {rows:{type:"array",minItems:1,maxItems:100000,items:{type:"object"}},expected_interval_seconds:{type:"integer",minimum:1},reject_gaps:{type:"boolean"},market_calendar:marketCalendarSchema}],
  ["dataset_approve", "Approve a dataset only after its complete quality status is PASSED.", {dataset_id:{type:"string"},version:{type:"integer",minimum:1}}],
  ["dataset_consolidate", "Consolidate compatible approved datasets into an immutable monthly or annual version.", {name:{type:"string"},source_dataset_refs:{type:"array",minItems:2,items:{type:"object"}},period:{type:"string",enum:["monthly","annual"]},expected_interval_seconds:{type:"integer",minimum:1},market_calendar:marketCalendarSchema}],
  ["universe_validate", "Validate an immutable learning-universe definition and its pinned approved datasets.", {definition:{type:"object"}}],
  ["universe_register", "Register a versioned learning universe with exact dataset and feature dependencies.", {definition:{type:"object"}}],
  ["universe_list", "List learning universes owned by the signed-in user.", {limit:{type:"integer",minimum:1,maximum:200}}],
  ["universe_get", "Retrieve a pinned learning-universe version.", {universe_id:{type:"string"},version:{type:"integer",minimum:1}}],
  ["analysis_run", "Run deterministic quality, leakage-screening, or distribution-drift analysis.", {dataset_id:{type:"string"},dataset_version:{type:"integer",minimum:1},analysis_type:{type:"string",enum:["quality","leakage","drift"]},parameters:{type:"object"}}],
  ["analysis_get", "Retrieve an analysis job and persisted result.", {analysis_id:{type:"string"}}],
  ["analysis_report", "Retrieve a reproducible analysis report and evidence.", {analysis_id:{type:"string"}}],
  ["learning_submit", "Submit real chronological model training using an approved dataset and pinned universe.", {manifest:{type:"object"}}],
  ["learning_status", "Read persistent training job state and evaluation result.", {job_id:{type:"string"}}],
  ["learning_cancel", "Cancel a training job only before its worker starts.", {job_id:{type:"string"}}],
  ["learning_logs", "Read bounded logs for a training job.", {job_id:{type:"string"},limit:{type:"integer",minimum:1,maximum:500}}],
  ["model_list", "List registered models, artifact hashes, evaluation gates and approval states.", {limit:{type:"integer",minimum:1,maximum:200}}],
  ["model_get", "Retrieve model metadata and training lineage.", {model_id:{type:"string"}}],
  ["model_register", "Retrieve the model automatically registered by a completed real training job.", {job_id:{type:"string"}}],
  ["model_evaluate", "Re-check model evaluation gates; evaluation never auto-approves.", {model_id:{type:"string"}}],
  ["model_approve", "Explicitly approve a model after evaluation gates pass; this does not enable trading.", {model_id:{type:"string"}}],
  ["backtest_run", "Run a deterministic no-broker signal replay on one exact approved Datacenter dataset version. Signal at bar i executes no earlier than bar i+1 open; fixed exposure, explicit transaction costs, one position.", {
    config:{type:"object",properties:{
      dataset_id:{type:"string"},dataset_version:{type:"integer",minimum:1},
      signal_column:{type:"string"},initial_balance:{type:"number",minimum:1,maximum:1000000000000},
      exposure_fraction:{type:"number",minimum:0.001,maximum:1},
      commission_bps:{type:"number",minimum:0,maximum:500},
      spread_bps:{type:"number",minimum:0,maximum:500},
      slippage_bps:{type:"number",minimum:0,maximum:500},
      max_holding_bars:{type:"integer",minimum:1,maximum:100000},
      allow_short:{type:"boolean"}
    },required:["dataset_id","dataset_version","signal_column"],additionalProperties:false}
  }],
  ["research_run_get", "Retrieve one owner-scoped immutable Datacenter research run.", {run_id:{type:"string"}}],
  ["research_run_list", "List owner-scoped immutable Datacenter research runs.", {limit:{type:"integer",minimum:1,maximum:200},run_type:{type:"string",enum:["backtest","walk_forward"]}}],

  ["audit_log_list", "Read the signed-in user's append-only Datacenter operation log.", {limit:{type:"integer",minimum:1,maximum:500}}],
];

const requiredArguments = {
  dataset_get: ["dataset_id"],
  dataset_register: ["manifest"],
  dataset_ingest: ["manifest", "rows"],
  dataset_validate_ohlcv: ["rows", "expected_interval_seconds"],
  dataset_approve: ["dataset_id", "version"],
  dataset_consolidate: ["name", "source_dataset_refs", "period", "expected_interval_seconds"],
  universe_validate: ["definition"],
  universe_register: ["definition"],
  universe_get: ["universe_id"],
  analysis_run: ["dataset_id", "dataset_version", "analysis_type"],
  analysis_get: ["analysis_id"],
  analysis_report: ["analysis_id"],
  learning_submit: ["manifest"],
  learning_status: ["job_id"],
  learning_cancel: ["job_id"],
  learning_logs: ["job_id"],
  model_get: ["model_id"],
  model_register: ["job_id"],
  model_evaluate: ["model_id"],
  model_approve: ["model_id"],
  backtest_run: ["config"],
  research_run_get: ["run_id"],

};

export const datacenterTools = definitions.map(([name, description, properties]) => ({
  name,
  description,
  inputSchema: {
    type: "object",
    properties,
    required: requiredArguments[name] || [],
    additionalProperties: false,
  },
}));

const names = new Set(datacenterTools.map((tool) => tool.name));
export function isDatacenterTool(name) {
  return names.has(name);
}

function endpoint(env) {
  const configured = String(env?.DATACENTER_MCP_URL || "").trim();
  if (!configured) throw new Error("datacenter_service_not_configured");
  let url;
  try {
    url = new URL(configured);
  } catch {
    throw new Error("datacenter_service_configuration_invalid");
  }
  if (url.protocol !== "https:" || url.username || url.password ||
      url.search || url.hash || !url.pathname.endsWith("/mcp")) {
    throw new Error("datacenter_service_configuration_invalid");
  }
  return url.toString();
}

async function rpc(url, authorization, body, protocolVersion = "") {
  const headers = {
    Authorization: authorization,
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (protocolVersion) headers["MCP-Protocol-Version"] = protocolVersion;
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw new Error("datacenter_service_unavailable");
  }
  if (!response.ok) throw new Error("datacenter_service_unavailable");
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error("datacenter_service_invalid_response");
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("datacenter_service_invalid_response");
  }
  if (!payload || payload.jsonrpc !== "2.0" || payload.error) {
    throw new Error("datacenter_service_protocol_error");
  }
  return payload.result;
}

async function notifyInitialized(url, authorization) {
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": "2025-03-26",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
        params: {},
      }),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw new Error("datacenter_service_unavailable");
  }
  if (!response.ok && response.status !== 202) {
    throw new Error("datacenter_service_protocol_error");
  }
}

const mt5Intervals = {M1:60, M5:300, M15:900, M30:1800, H1:3600, H4:14400, D1:86400};

export function buildMt5DatasetPayload({
  symbol, timeframe, bars, dataset_name, market_calendar, now_ms = Date.now(),
}) {
  const normalizedSymbol = String(symbol || "").trim();
  const normalizedTimeframe = String(timeframe || "").trim().toUpperCase();
  const interval = mt5Intervals[normalizedTimeframe];
  if (!/^[A-Z0-9._-]{1,40}$/.test(normalizedSymbol)) throw new Error("invalid_mt5_dataset_symbol");
  if (!interval) throw new Error("unsupported_mt5_dataset_timeframe");
  if (!Array.isArray(bars) || bars.length < 2 || bars.length > 500) {
    throw new Error("mt5_dataset_requires_2_to_500_source_bars");
  }
  const name = String(dataset_name || (normalizedSymbol + "-" + normalizedTimeframe.toLowerCase() + "-exness-demo")).trim();
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(name)) throw new Error("invalid_dataset_name");

  const rows = [];
  let previous = -Infinity;
  for (const bar of bars) {
    const timestamp = Date.parse(bar?.time);
    if (!Number.isFinite(timestamp) || timestamp <= previous) {
      throw new Error("mt5_source_bars_must_be_valid_and_ascending");
    }
    previous = timestamp;
    // Exclude the still-forming candle. Source order is preserved; no sorting or filling.
    if (timestamp + interval * 1000 > now_ms) continue;
    const values = ["open", "high", "low", "close", "tick_volume", "spread", "real_volume"];
    if (!values.every((key) => typeof bar[key] === "number" && Number.isFinite(bar[key]))) {
      throw new Error("mt5_source_bar_contains_invalid_numeric_field");
    }
    rows.push({
      timestamp: new Date(timestamp).toISOString(),
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.tick_volume,
      tick_volume: bar.tick_volume,
      spread: bar.spread,
      real_volume: bar.real_volume,
    });
  }
  if (rows.length < 2) throw new Error("not_enough_closed_mt5_candles");
  const manifest = {
    name,
    source: "exness-mt5-demo-readonly",
    symbols: [normalizedSymbol],
    timeframe: normalizedTimeframe,
    timezone: "UTC",
    expected_interval_seconds: interval,
    coverage_start: rows[0].timestamp,
    coverage_end: rows[rows.length - 1].timestamp,
    schema: {
      timestamp: "datetime", open: "float", high: "float", low: "float",
      close: "float", volume: "integer", tick_volume: "integer",
      spread: "integer", real_volume: "integer",
    },
  };
  if (market_calendar !== undefined) manifest.market_calendar = market_calendar;
  return {manifest, rows};
}

export async function callDatacenterTool(name, args, request, env) {
  if (!names.has(name)) throw new Error("unknown_datacenter_tool");
  const authorization = request?.headers?.get("Authorization") || "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) throw new Error("authentication_required");
  const url = endpoint(env);
  await rpc(url, authorization, {
    jsonrpc: "2.0",
    id: "nova-datacenter-init",
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: {name:"voom-system-mcp",version:"0.3.0"},
    },
  });
  await notifyInitialized(url, authorization);
  const result = await rpc(url, authorization, {
    jsonrpc: "2.0",
    id: "nova-datacenter-call",
    method: "tools/call",
    params: {name, arguments: args || {}},
  }, "2025-03-26");
  if (!result || result.isError === true) throw new Error("datacenter_tool_execution_failed");
  const textContent = Array.isArray(result.content)
    ? result.content.find((item) => item && item.type === "text" && typeof item.text === "string")
    : null;
  if (!textContent) throw new Error("datacenter_tool_invalid_result");
  try {
    return JSON.parse(textContent.text);
  } catch {
    throw new Error("datacenter_tool_invalid_result");
  }
}
