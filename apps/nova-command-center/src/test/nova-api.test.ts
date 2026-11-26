import { describe, it, expect } from "vitest";
import { createApiClient, ApiError } from "@/lib/nova/api";

const ok =
  (body: unknown, status = 200) =>
  async () =>
    new Response(JSON.stringify(body), { status });
const kind = async (p: Promise<unknown>) => {
  try {
    await p;
    return "none";
  } catch (e) {
    return (e as ApiError).kind;
  }
};

describe("api client", () => {
  it("not_configured without base URL", async () =>
    expect(
      await kind(createApiClient({ baseUrl: null, getToken: async () => "t" }).get("/v1/me")),
    ).toBe("not_configured"));
  it("unauthenticated without token", async () =>
    expect(
      await kind(
        createApiClient({
          baseUrl: "https://x",
          getToken: async () => null,
          fetchImpl: ok({}),
        }).get("/v1/me"),
      ),
    ).toBe("unauthenticated"));
  it("maps 403 to forbidden", async () =>
    expect(
      await kind(
        createApiClient({
          baseUrl: "https://x",
          getToken: async () => "t",
          fetchImpl: ok({}, 403),
        }).get("/v1/me"),
      ),
    ).toBe("forbidden"));
  it("maps 500 to http", async () =>
    expect(
      await kind(
        createApiClient({
          baseUrl: "https://x",
          getToken: async () => "t",
          fetchImpl: ok({}, 500),
        }).get("/v1/me"),
      ),
    ).toBe("http"));
  it("maps network failure", async () =>
    expect(
      await kind(
        createApiClient({
          baseUrl: "https://x",
          getToken: async () => "t",
          fetchImpl: async () => {
            throw new TypeError("x");
          },
        }).get("/v1/me"),
      ),
    ).toBe("network"));
  it("times out", async () => {
    const hang: typeof fetch = (_u, init) =>
      new Promise((_r, rej) =>
        init?.signal?.addEventListener("abort", () =>
          rej(Object.assign(new Error("a"), { name: "AbortError" })),
        ),
      );
    expect(
      await kind(
        createApiClient({
          baseUrl: "https://x",
          getToken: async () => "t",
          timeoutMs: 10,
          fetchImpl: hang,
        }).get("/v1/me"),
      ),
    ).toBe("timeout");
  });
  it("sends bearer token and parses json", async () => {
    let auth: string | null = null;
    const c = createApiClient({
      baseUrl: "https://x",
      getToken: async () => "tok",
      fetchImpl: async (_u, i) => {
        auth = new Headers(i?.headers).get("authorization");
        return new Response('{"a":1}');
      },
    });
    expect(await c.get("/v1/me")).toEqual({ a: 1 });
    expect(auth).toBe("Bearer tok");
  });

  it("creates a research job with bearer auth and idempotency key", async () => {
    let seen: RequestInit | undefined;
    const c = createApiClient({
      baseUrl: "https://hub.example",
      getToken: async () => "session-token",
      fetchImpl: async (_url, init) => {
        seen = init;
        return Response.json({ job: { job_id: "job-123", state: "QUEUED" } }, { status: 202 });
      },
    });
    const result = await c.postQuantLabJob("/v1/quantlab/jobs", {
      job_type: "backtest",
      resource_profile: "free-cpu",
      timeout_seconds: 600,
      experiment: { spec: "nova.quant-experiment.v1" },
    }, "idem-key-12345678");
    expect(result).toEqual({ job: { job_id: "job-123", state: "QUEUED" } });
    expect(seen?.method).toBe("POST");
    expect(new Headers(seen?.headers).get("authorization")).toBe("Bearer session-token");
    expect(new Headers(seen?.headers).get("Idempotency-Key")).toBe("idem-key-12345678");
    expect(JSON.parse(String(seen?.body))).not.toHaveProperty("tenant_id");
  });
  it("blocks non-QuantLab POST operations before network access", async () => {
    let called = false;
    const c = createApiClient({
      baseUrl: "https://hub.example",
      getToken: async () => "session-token",
      fetchImpl: async () => {
        called = true;
        return Response.json({});
      },
    });
    await expect(c.postQuantLabJob("/v1/orders", {
      job_type: "backtest",
      experiment: {},
    }, "idem-key-12345678")).rejects.toMatchObject({ kind: "blocked" });
    expect(called).toBe(false);
  });

  it("health needs no token", async () => {
    const c = createApiClient({
      baseUrl: "https://x",
      getToken: async () => null,
      fetchImpl: ok({ status: "ok" }),
    });
    expect((await c.health()).status).toBe("ok");
  });
});