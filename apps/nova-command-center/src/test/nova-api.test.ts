import { describe, it, expect } from "vitest";
import { createApiClient, ApiError } from "@/lib/nova/api";

const ok =
  (body: unknown, status = 200) =>
  async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
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
      await kind(
        createApiClient({ baseUrl: null, getToken: async () => "t" }).get(
          "/v1/me",
        ),
      ),
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
    ).toBe("timeout"));
  });
  it("sends bearer token and parses json", async () => {
    let auth: string | null = null;
    const c = createApiClient({
      baseUrl: "https://x",
      getToken: async () => "tok",
      fetchImpl: async (_u, i) => {
        auth = new Headers(i?.headers).get("authorization");
        return new Response('{"a":1}', {
          headers: { "content-type": "application/json" },
        });
      },
    });
    expect(await c.get("/v1/me")).toEqual({ a: 1 });
    expect(auth).toBe("Bearer tok");
  });
  it("health needs no token", async () => {
    const c = createApiClient({
      baseUrl: "https://x",
      getToken: async () => null,
      fetchImpl: ok({ status: "ok" }),
    });
    expect((await c.health()).status).toBe("ok");
  });
  it("posts only bounded user/assistant history with bearer auth", async () => {
    let url = "";
    let init: RequestInit | undefined;
    const c = createApiClient({
      baseUrl: "https://system-hub.example",
      chatBaseUrl: "https://chat-worker.example",
      getToken: async () => "user-access-token",
      fetchImpl: async (input, options) => {
        url = String(input);
        init = options;
        return new Response(
          JSON.stringify({
            message: "Research answer",
            provider: "cloudflare-workers-ai",
            model: "@cf/meta/llama-3.2-3b-instruct",
            executionEnabled: false,
            liveTradingEnabled: false,
          }),
          { headers: { "content-type": "application/json" } },
        );
      },
    });
    const response = await c.sendChat([
      { role: "user", content: "Explain SMC" },
    ]);
    expect(response.message).toBe("Research answer");
    expect(url).toBe("https://chat-worker.example/api/chat");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("authorization")).toBe(
      "Bearer user-access-token",
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      messages: [{ role: "user", content: "Explain SMC" }],
    });
  });
  it("rejects invalid chat history before network access", async () => {
    let called = false;
    const c = createApiClient({
      baseUrl: "https://system-hub.example",
      chatBaseUrl: "https://chat-worker.example",
      getToken: async () => "t",
      fetchImpl: async () => {
        called = true;
        return new Response("{}");
      },
    });
    await expect(
      c.sendChat([{ role: "user", content: "x".repeat(1201) }]),
    ).rejects.toMatchObject({
      kind: "blocked",
    });
    await expect(
      c.sendChat([{ role: "assistant", content: "orphan assistant" }]),
    ).rejects.toMatchObject({
      kind: "blocked",
    });
    expect(called).toBe(false);
  });
  it("maps a failed Supabase session refresh to an actionable auth error", async () => {
    const c = createApiClient({
      baseUrl: "https://system-hub.example",
      chatBaseUrl: "https://chat-worker.example",
      getToken: async () => {
        throw new SyntaxError("Unexpected token '<'");
      },
      fetchImpl: ok({}),
    });
    await expect(
      c.sendChat([{ role: "user", content: "hello" }]),
    ).rejects.toMatchObject({
      kind: "unauthenticated",
      message:
        "Could not read or refresh the Supabase session. Sign out and sign in again.",
    });
  });
  it("classifies an HTML response without trying to parse it as JSON", async () => {
    const c = createApiClient({
      baseUrl: "https://system-hub.example",
      chatBaseUrl: "https://chat-worker.example",
      getToken: async () => "t",
      fetchImpl: async () =>
        new Response("<!doctype html><title>Not Found</title>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
    });
    await expect(
      c.sendChat([{ role: "user", content: "hello" }]),
    ).rejects.toMatchObject({
      kind: "parse",
      status: 200,
      message: expect.stringContaining("Content-Type: text/html"),
    });
  });
  it("rejects unsafe worker response flags", async () => {
    const c = createApiClient({
      baseUrl: "https://system-hub.example",
      chatBaseUrl: "https://chat-worker.example",
      getToken: async () => "t",
      fetchImpl: ok({
        message: "unsafe",
        executionEnabled: true,
        liveTradingEnabled: false,
      }),
    });
    await expect(
      c.sendChat([{ role: "user", content: "hello" }]),
    ).rejects.toMatchObject({
      kind: "parse",
    });
  });
});
