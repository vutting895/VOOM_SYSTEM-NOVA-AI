import { buildTradingToolRequest, decodeMcpToolResponse } from "../../../../lib/trading-intelligence.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MCP_ENDPOINT = "https://voom-system-mcp.suwapat787.workers.dev/mcp";
const PROTOCOL_VERSION = "2025-03-26";

export async function POST(request) {
  // Authentication is checked before parsing or validating user-controlled input.
  const authorization = request.headers.get("authorization") || "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) {
    return Response.json({ error: "authentication_required" }, {
      status: 401,
      headers: { "Cache-Control": "no-store" }
    });
  }

  let input;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, {
      status: 400,
      headers: { "Cache-Control": "no-store" }
    });
  }

  let toolRequest;
  try {
    toolRequest = buildTradingToolRequest(input);
  } catch (error) {
    return Response.json({
      error: "invalid_request",
      detail: error instanceof Error ? error.message : "Invalid market-data request"
    }, {
      status: 400,
      headers: { "Cache-Control": "no-store" }
    });
  }

  try {
    const upstream = await fetch(MCP_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json",
        Accept: "application/json",
        "MCP-Protocol-Version": PROTOCOL_VERSION
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "nova-trading-intelligence",
        method: "tools/call",
        params: {
          name: toolRequest.name,
          arguments: toolRequest.arguments
        }
      }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15000)
    });

    if (!upstream.ok) {
      return Response.json({
        error: upstream.status === 401 ? "session_rejected" : "market_data_provider_unavailable",
        upstreamStatus: upstream.status
      }, {
        status: upstream.status === 401 ? 401 : 502,
        headers: { "Cache-Control": "no-store" }
      });
    }

    const envelope = await upstream.json();
    let result;
    try {
      result = decodeMcpToolResponse(envelope);
    } catch (error) {
      return Response.json({
        error: "market_analysis_unavailable",
        detail: error instanceof Error ? error.message.slice(0, 180) : "Remote tool failed"
      }, {
        status: 502,
        headers: { "Cache-Control": "no-store" }
      });
    }

    return Response.json({ result }, {
      status: 200,
      headers: { "Cache-Control": "no-store" }
    });
  } catch {
    return Response.json({ error: "market_data_service_unreachable" }, {
      status: 502,
      headers: { "Cache-Control": "no-store" }
    });
  }
}
