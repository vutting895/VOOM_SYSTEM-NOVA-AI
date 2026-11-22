import { describe, it, expect } from "vitest";
import { parseRole, hasAtLeast } from "@/lib/nova/roles";

describe("parseRole", () => {
  it("reads nova_role from app_metadata", () =>
    expect(parseRole({ app_metadata: { nova_role: "Admin" } })).toBe("admin"));
  it("ignores user_metadata (user-editable)", () =>
    expect(
      parseRole({ app_metadata: {}, user_metadata: { nova_role: "admin" } } as never),
    ).toBeNull());
  it("rejects unknown roles", () =>
    expect(parseRole({ app_metadata: { nova_role: "superuser" } })).toBeNull());
  it("fails closed on missing user", () => expect(parseRole(null)).toBeNull());
  it("ranks roles", () => {
    expect(hasAtLeast("operator", "viewer")).toBe(true);
    expect(hasAtLeast("viewer", "operator")).toBe(false);
    expect(hasAtLeast(null, "viewer")).toBe(false);
  });
});