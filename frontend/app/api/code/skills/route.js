import { agentApiJson } from "../../../../lib/agent-approval-server.js";
import { getNovaCodeSkillRegistry } from "../../../../lib/nova-code-ai-registry.js";
import { novaCodeApiOptions, withNovaCodeCors } from "../../../../lib/nova-code-api-cors.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Skill discovery is public metadata only. Every skill remains disabled until its runtime is verified.
export async function OPTIONS(request) {
  return novaCodeApiOptions(request, ["GET", "OPTIONS"]);
}

export async function GET(request) {
  return withNovaCodeCors(request, agentApiJson(getNovaCodeSkillRegistry(), 200));
}
