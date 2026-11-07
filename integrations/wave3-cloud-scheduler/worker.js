const REPOSITORY = "vutting895/VOOM_SYSTEM-NOVA-AI";
const EVENT_TYPE = "nova-wave3-daily-cloud";
const SAFE_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" };

function reply(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: SAFE_HEADERS });
}

async function dispatchDaily(env, scheduledTime) {
  if (!env.GITHUB_DISPATCH_TOKEN) throw new Error("github_dispatch_not_configured");
  const repository = env.GITHUB_REPOSITORY || REPOSITORY;
  if (repository !== REPOSITORY) throw new Error("repository_not_allowlisted");
  const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/dispatches`, {
    method: "POST",
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "NOVA-Wave3-Cloud-Scheduler",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      event_type: EVENT_TYPE,
      client_payload: {
        scheduled_for: new Date(scheduledTime).toISOString(),
        source: "cloudflare-workers-cron",
        pipeline: "wave3-daily-candidate",
        execution_enabled: false,
        live_trading_enabled: false,
      },
    }),
  });
  if (response.status !== 204) {
    // Never log response bodies or request headers; GitHub errors can contain sensitive metadata.
    throw new Error(`github_dispatch_failed_${response.status}`);
  }
  return { accepted: true, repository: REPOSITORY, event_type: EVENT_TYPE };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return reply({ service: "nova-wave3-cloud-scheduler", status: "ok", mode: "orchestration-only", executionEnabled: false, liveTradingEnabled: false });
    }
    return reply({ error: "not_found", executionEnabled: false, liveTradingEnabled: false }, 404);
  },
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(dispatchDaily(env, controller.scheduledTime));
  },
};

export { dispatchDaily };
