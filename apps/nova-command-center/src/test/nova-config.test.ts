import { describe, expect, it } from "vitest";
import { NOVA_SERVICE_ORIGINS } from "../lib/nova/trusted-origins";
import { readConfig } from "../lib/nova/config";

describe("NOVA public environment compatibility", () => {
  it("reads the existing Netlify NEXT_PUBLIC Supabase variables", () => {
    const result = readConfig({
      NEXT_PUBLIC_SUPABASE_URL: "https://tlyyxufuiimrbaksoitf.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key",
    });

    expect(result.supabaseUrl).toBe(
      "https://tlyyxufuiimrbaksoitf.supabase.co",
    );
    expect(result.supabaseAnonKey).toBe("public-anon-key");
    expect(result.apiBaseUrl).toBe(NOVA_SERVICE_ORIGINS.systemHub);
    expect(result.chatApiBaseUrl).toBe(NOVA_SERVICE_ORIGINS.chat);
  });

  it("prefers VITE variables when both public naming conventions are present", () => {
    const result = readConfig({
      VITE_SUPABASE_URL: "https://tlyyxufuiimrbaksoitf.supabase.co",
      NEXT_PUBLIC_SUPABASE_URL: "https://untrusted.example",
      VITE_SUPABASE_ANON_KEY: "vite-anon-key",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "next-anon-key",
    });

    expect(result.supabaseUrl).toBe(
      "https://tlyyxufuiimrbaksoitf.supabase.co",
    );
    expect(result.supabaseAnonKey).toBe("vite-anon-key");
  });

  it("fails closed for a non-empty untrusted API origin instead of using fallback", () => {
    const result = readConfig({
      NEXT_PUBLIC_SUPABASE_URL: "https://tlyyxufuiimrbaksoitf.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key",
      VITE_NOVA_API_BASE_URL: "https://attacker.example",
    });

    expect(result.apiBaseUrl).toBeNull();
    expect(result.supabaseUrl).toBe(
      "https://tlyyxufuiimrbaksoitf.supabase.co",
    );
  });

  it("fails closed for an untrusted Supabase project URL", () => {
    const result = readConfig({
      NEXT_PUBLIC_SUPABASE_URL: "https://attacker.example",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key",
    });

    expect(result.supabaseUrl).toBeNull();
    expect(result.supabaseAnonKey).toBe("public-anon-key");
  });
});
