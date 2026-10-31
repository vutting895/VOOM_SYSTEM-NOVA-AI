import { agentApiJson, authenticateAgentRequest } from "../../../../lib/agent-approval-server.js";
import { getVideoSkillRegistry } from "../../../../lib/video-skill-registry.js";
import { videoApiOptions, withVideoCors } from "../../../../lib/video-api-cors.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS(request) {
  return videoApiOptions(request, ["GET", "OPTIONS"]);
}

export async function GET(request) {
  const auth = await authenticateAgentRequest(request);
  if (!auth.ok) return withVideoCors(request, auth.response);

  return withVideoCors(request, agentApiJson(getVideoSkillRegistry(), 200));
}
