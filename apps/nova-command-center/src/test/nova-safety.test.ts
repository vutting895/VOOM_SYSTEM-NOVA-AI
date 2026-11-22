import { describe, it, expect } from "vitest";
import {
  SAFETY,
  assertReadOnlyRequest,
  ALLOWED_API_PATHS,
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
  it("allow-listed paths contain no forbidden endpoints", () =>
    expect(ALLOWED_API_PATHS.some(isForbiddenPath)).toBe(false));
  it("api client refuses forbidden path before any network call", async () => {
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