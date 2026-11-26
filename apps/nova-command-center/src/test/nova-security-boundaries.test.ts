import { describe, expect, it } from "vitest";
import {
  NOVA_SERVICE_ORIGINS,
  resolveTrustedBaseUrl,
} from "../lib/nova/trusted-origins";
import {
  hasUserIdentityChanged,
  userScopedQueryKey,
} from "../lib/nova/session-scope";

describe("trusted service origins", () => {
  it("accepts only the exact production origins", () => {
    expect(
      resolveTrustedBaseUrl(NOVA_SERVICE_ORIGINS.supabase, "supabase"),
    ).toBe(NOVA_SERVICE_ORIGINS.supabase);
    expect(
      resolveTrustedBaseUrl(NOVA_SERVICE_ORIGINS.systemHub, "systemHub"),
    ).toBe(NOVA_SERVICE_ORIGINS.systemHub);
    expect(
      resolveTrustedBaseUrl(NOVA_SERVICE_ORIGINS.chat, "chat"),
    ).toBe(NOVA_SERVICE_ORIGINS.chat);
  });

  it("accepts a trailing slash but returns only the origin", () => {
    expect(
      resolveTrustedBaseUrl(
        `${NOVA_SERVICE_ORIGINS.systemHub}/`,
        "systemHub",
      ),
    ).toBe(NOVA_SERVICE_ORIGINS.systemHub);
  });

  it("rejects untrusted hosts and URL decorations", () => {
    const invalid = [
      "https://evil.example",
      "https://voom-system-hub.suwapat787.workers.dev.attacker.example",
      "https://user:password@voom-system-hub.suwapat787.workers.dev",
      "https://voom-system-hub.suwapat787.workers.dev/api",
      "https://voom-system-hub.suwapat787.workers.dev/?next=https://evil.example",
      "http://voom-system-hub.suwapat787.workers.dev",
    ];
    for (const value of invalid) {
      expect(resolveTrustedBaseUrl(value, "systemHub")).toBeNull();
    }
  });

  it("allows only explicit localhost development ports", () => {
    expect(
      resolveTrustedBaseUrl("http://localhost:54321", "supabase"),
    ).toBe("http://localhost:54321");
    expect(
      resolveTrustedBaseUrl("http://127.0.0.1:8787", "systemHub"),
    ).toBe("http://127.0.0.1:8787");
    expect(
      resolveTrustedBaseUrl("http://localhost:8788", "chat"),
    ).toBe("http://localhost:8788");
    expect(
      resolveTrustedBaseUrl("http://localhost:9999", "systemHub"),
    ).toBeNull();
  });

  it("uses a fallback only when the configured value is absent", () => {
    expect(
      resolveTrustedBaseUrl(undefined, "chat", NOVA_SERVICE_ORIGINS.chat),
    ).toBe(NOVA_SERVICE_ORIGINS.chat);
    expect(
      resolveTrustedBaseUrl("https://evil.example", "chat", NOVA_SERVICE_ORIGINS.chat),
    ).toBeNull();
  });
});

describe("authenticated identity isolation", () => {
  it("clears user-scoped state when the identity changes", () => {
    expect(hasUserIdentityChanged("user-a", "user-b")).toBe(true);
    expect(hasUserIdentityChanged("user-a", null)).toBe(true);
    expect(hasUserIdentityChanged("user-a", "user-a")).toBe(false);
    expect(hasUserIdentityChanged(null, null)).toBe(false);
  });

  it("separates protected query cache keys by user identity", () => {
    expect(userScopedQueryKey("user-a", "/v1/risk")).not.toEqual(
      userScopedQueryKey("user-b", "/v1/risk"),
    );
    expect(userScopedQueryKey(null, "/v1/risk")).not.toEqual(
      userScopedQueryKey("user-a", "/v1/risk"),
    );
  });
});
