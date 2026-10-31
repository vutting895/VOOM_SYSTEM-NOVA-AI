import { agentApiJson } from "../../../../lib/agent-approval-server.js";
import { getNovaCodeAgents } from "../../../../lib/nova-code-ai-registry.js";
import { novaCodeApiOptions, withNovaCodeCors } from "../../../../lib/nova-code-api-cors.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Agent discovery is public metadata only. No repository data or code is exposed here.
export async function OPTIONS(request) {
  return novaCodeApiOptions(request, ["GET", "OPTIONS"]);
}

export async function GET(request) {
  return withNovaCodeCors(request, agentApiJson(getNovaCodeAgents(), 200));
}
