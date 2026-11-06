import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  createNovaApprovalApi,
  NovaApprovalApiError,
} from "../src/services/novaApprovalApi.ts";

const proposal = {
  title: "NOVA research draft",
  summary: "Research-only proposal; no broker action.",
  market: "XAU/USD",
  timeframe: "15m",
  riskProfile: "low",
};

test("client obtains a fresh session token for each request and uses the System Hub API", async () => {
  const tokens = ["user-jwt-a1", "user-jwt-a2"];
  let tokenCalls = 0;
  const requests = [];
  const api = createNovaApprovalApi({
    baseUrl: "https://hub.example.test",
    getAccessToken: async () => tokens[tokenCalls++],
    fetcher: async (input, init) => {
      requests.push({ url: String(input), init });
      return Response.json({ threads: [] });
    },
  });

  await api.listThreads();
  await api.listThreads("active");

  assert.equal(tokenCalls, 2);
  assert.equal(requests[0].url, "https://hub.example.test/v1/agent/threads");
  assert.equal(requests[1].url, "https://hub.example.test/v1/agent/threads?state=active");
  assert.equal(requests[0].init.headers.get("Authorization"), "Bearer user-jwt-a1");
  assert.equal(requests[1].init.headers.get("Authorization"), "Bearer user-jwt-a2");
  assert.equal(requests[0].init.cache, "no-store");
  assert.equal(requests[0].init.credentials, "omit");
});

test("client creates threads and only submits the strategy-draft-review contract", async () => {
  const requests = [];
  const api = createNovaApprovalApi({
    baseUrl: "https://hub.example.test/",
    getAccessToken: async () => "fresh-user-jwt",
    fetcher: async (input, init) => {
      requests.push({ url: String(input), init });
      return Response.json({ thread: { id: "thread-id" } }, { status: 201 });
    },
  });

  await api.createThread("Research workspace");
  await api.createApproval("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", proposal);

  assert.equal(requests[0].url, "https://hub.example.test/v1/agent/threads");
  assert.equal(requests[0].init.method, "POST");
  assert.deepEqual(JSON.parse(requests[0].init.body), { title: "Research workspace" });
  assert.equal(
    requests[1].url,
    "https://hub.example.test/v1/agent/threads/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/approvals",
  );
  assert.deepEqual(JSON.parse(requests[1].init.body), {
    requestType: "strategy_draft_review",
    proposal,
  });
});

test("approval decisions are sent without any execution or broker fields", async () => {
  let requestSeen;
  const api = createNovaApprovalApi({
    baseUrl: "https://hub.example.test",
    getAccessToken: async () => "fresh-user-jwt",
    fetcher: async (input, init) => {
      requestSeen = { url: String(input), init };
      return Response.json({
        approval: {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          thread_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          status: "approved",
          decided_at: "2026-11-07T00:00:00Z",
          decision_payload: null,
        },
        agentGraphResumeEnabled: false,
        ordersEnabled: false,
        executionEnabled: false,
        liveTradingEnabled: false,
        brokerMutationEnabled: false,
      });
    },
  });

  const result = await api.decideApproval(
    "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    { decision: "approve", note: "Research accepted" },
  );
  assert.equal(
    requestSeen.url,
    "https://hub.example.test/v1/agent/approvals/bbbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/decision",
  );
  assert.deepEqual(JSON.parse(requestSeen.init.body), {
    decision: "approve",
    note: "Research accepted",
  });
  assert.equal(result.agentGraphResumeEnabled, false);
  assert.equal(result.executionEnabled, false);
  assert.equal(result.liveTradingEnabled, false);
});

test("missing session fails before any network request", async () => {
  let fetched = false;
  const api = createNovaApprovalApi({
    baseUrl: "https://hub.example.test",
    getAccessToken: async () => null,
    fetcher: async () => {
      fetched = true;
      throw new Error("must not fetch");
    },
  });

  await assert.rejects(
    api.listThreads(),
    (error) => error instanceof NovaApprovalApiError &&
      error.status === 401 && error.code === "authentication_required",
  );
  assert.equal(fetched, false);
});

test("service rejects unsafe API origins and never stores session tokens", async () => {
  assert.throws(
    () => createNovaApprovalApi({
      baseUrl: "http://public.example.test",
      getAccessToken: async () => "token",
    }),
    /must_use_https/,
  );
  const source = await readFile(new URL("../src/services/novaApprovalApi.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /localStorage|sessionStorage|document\.cookie/);
  assert.match(source, /credentials: "omit"/);
});
