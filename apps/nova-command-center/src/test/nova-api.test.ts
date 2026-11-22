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
  it("health needs no token", async () => {
    const c = createApiClient({
      baseUrl: "https://x",
      getToken: async () => null,
      fetchImpl: ok({ status: "ok" }),
    });
    expect((await c.health()).status).toBe("ok");
  });
});