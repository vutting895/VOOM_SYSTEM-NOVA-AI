import { describe, it, expect } from "vitest";
import { authReducer, initialAuthState, canAccessApp } from "@/lib/nova/auth-state";

describe("auth state", () => {
  it("starts loading and denies access", () => expect(canAccessApp(initialAuthState)).toBe(false));
  it("unconfigured denies access", () =>
    expect(canAccessApp(authReducer(initialAuthState, { type: "UNCONFIGURED" }))).toBe(false));
  it("signed in without role denies access", () =>
    expect(
      canAccessApp(
        authReducer(initialAuthState, { type: "SESSION", email: "a@b.c", userId: "u", role: null }),
      ),
    ).toBe(false));
  it("signed in with role grants access", () =>
    expect(
      canAccessApp(
        authReducer(initialAuthState, {
          type: "SESSION",
          email: "a@b.c",
          userId: "u",
          role: "viewer",
        }),
      ),
    ).toBe(true));
  it("sign out clears identity", () => {
    const s = authReducer(
      { status: "signed_in", email: "a", userId: "u", role: "admin" },
      { type: "SIGNED_OUT" },
    );
    expect(s).toEqual({ status: "signed_out", email: null, userId: null, role: null });
  });
});