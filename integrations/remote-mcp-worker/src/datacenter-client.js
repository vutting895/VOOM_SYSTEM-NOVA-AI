"""Bounded client for the NOVA Learning Service MCP endpoint."""
const definitions = [
  ["dataset_list", "List the signed-in user's Datacenter datasets.", {limit:{type:"integer",minimum:1,maximum:200},status:{type:"string",enum:["PENDING","PASSED","FAILED","QUARANTINED","REJECTED","SUPERSEDED"]}}],
  ["dataset_get", "Read one immutable dataset version and quality receipt.", {dataset_id:{type:"string"},version:{type:"integer",minimum:1}}],
  ["dataset_validate", "Validate dataset provenance or inspect its persisted quality receipt.", {manifest:{type:"object"},dataset_id:{type:"string"},version:{type:"integer",minimum:1}}],
  ["dataset_register", "Register a metadata-only dataset version; it is not approved for training.", {manifest:{type:"object"}}],
  ["dataset_ingest", "Validate and persist OHLCV rows in Parquet/Zstandard. Only 100% passing datasets can be approved.", {manifest:{type:"object"},rows:{type:"array",minItems:1,maxItems:100000,items:{type:"object"}}}],
  ["dataset_validate_ohlcv", "Run strict UTC/OHLCV validation with explicit cadence and market closures.", {rows:{type:"array",minItems:1,maxItems:100000,items:{type:"object"}},expected_interval_seconds:{type:"integer",minimum:1},reject_gaps:{type:"boolean"},market_calendar:{type:"object"}}],
  ["dataset_approve", "Approve a dataset only after its complete quality status is PASSED.", {dataset_id:{type:"string"},version:{type:"integer",minimum:1}}],
  ["dataset_consolidate", "Consolidate compatible approved datasets into an immutable monthly or annual version.", {name:{type:"string"},source_dataset_refs:{type:"array",minItems:2,items:{type:"object"}},period:{type:"string",enum:["monthly","annual"]},expected_interval_seconds:{type:"integer",minimum:1},market_calendar:{type:"object"}}],
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
  ["audit_log_list", "Read the signed-in user's append-only Datacenter operation log.", {limit:{type:"integer",minimum:1,maximum:500}}],
];

export const datacenterTools = definitions.map(([name, description, properties]) => ({
  name,
  description,
  inputSchema: {
    type: "object",
    properties,
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
