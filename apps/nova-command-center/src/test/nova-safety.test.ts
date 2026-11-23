import { describe, it, expect } from "vitest";
import {
  SAFETY,
  assertReadOnlyRequest,
  ALLOWED_API_PATHS,
  isAllowedApiPath,
  isForbiddenPath,
} from "@/lib/nova/safety";
import { createApiClient } from "@/lib/nova/api";

describe("safety invariants", () => {
  it("all trading/broker flags are off", () =>
    expect(Object.values(SAFETY).every((v) => v === false)).toBe(true));
  it("flags are frozen", () => {
    expect(Object.isFrozen(SAFETY)).toBe(true);
    expect(() => {
      (SAFETY as { LIVE_TRADING_ENABLED: boolean }).LIVE_TRADING_ENABLED = true;
    }).toThrow();
  });
  it("blocks non-GET methods", () =>
    expect(() => assertReadOnlyRequest("POST", "/v1/health")).toThrow());
  it("blocks order/withdraw/transfer paths", () => {
    for (const p of ["/v1/orders", "/v1/withdraw", "/v1/transfer", "/v1/trade/execute"])
      expect(() => assertReadOnlyRequest("GET", p)).toThrow();
  });
  it("allows only explicitly allow-listed paths", () => {
    for (const p of ALLOWED_API_PATHS) {
      expect(isAllowedApiPath(p)).toBe(true);
      expect(() => assertReadOnlyRequest("GET", p)).not.toThrow();
    }
    for (const p of ["/v1/users", "/v1/admin", "/v1/unknown", "/health", "/v1/me/roles"]) {
      expect(isAllowedApiPath(p)).toBe(false);
      expect(() => assertReadOnlyRequest("GET", p)).toThrow(/allow-listed/);
    }
  });
  it("permits query strings only on an allow-listed path", () => {
    expect(isAllowedApiPath("/v1/me?fields=id")).toBe(true);
    expect(() => assertReadOnlyRequest("GET", "/v1/me?fields=id")).not.toThrow();
    expect(isAllowedApiPath("/v1/admin?fields=id")).toBe(false);
  });
  it("rejects absolute URLs, traversal, fragments and encoded separators", () => {
    for (const p of [
      "https://attacker.example/v1/me",
      "//attacker.example/v1/me",
      "/v1/../v1/me",
      "/v1/me#fragment",
      "/v1%2fme",
      "/v1%5cme",
      "/v1\\me",
    ]) {
      expect(isAllowedApiPath(p)).toBe(false);
      expect(() => assertReadOnlyRequest("GET", p)).toThrow();
    }
  });
  it("allow-listed paths contain no forbidden endpoints", () =>
    expect(ALLOWED_API_PATHS.some(isForbiddenPath)).toBe(false));
  it("api client refuses forbidden and non-allow-listed paths before network calls", async () => {
    let called = false;
    const c = createApiClient({
      baseUrl: "https://x",
      getToken: async () => "t",
      fetchImpl: async () => {
        called = true;
        return new Response("{}");
      },
    });
    await expect(c.get("/v1/orders")).rejects.toMatchObject({ kind: "blocked" });
    await expect(c.get("/v1/admin")).rejects.toMatchObject({ kind: "blocked" });
    expect(called).toBe(false);
  });
});

import { emergencyStopAvailability } from "@/lib/nova/emergency";
describe("emergency stop", () => {
  it("never reports a connected/confirmed stop", () => {
    const r = emergencyStopAvailability();
    expect(r.connected).toBe(false);
    expect(r.message).toMatch(/not connected/i);
  });
});
