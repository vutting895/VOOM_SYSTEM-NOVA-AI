import type { NovaRole } from "./roles";

export type AuthStatus = "loading" | "unconfigured" | "signed_out" | "signed_in";

export interface AuthState {
  status: AuthStatus;
  email: string | null;
  userId: string | null;
  role: NovaRole | null;
}

export type AuthEvent =
  | { type: "UNCONFIGURED" }
  | { type: "SESSION"; email: string | null; userId: string; role: NovaRole | null }
  | { type: "SIGNED_OUT" };

export const initialAuthState: AuthState = {
  status: "loading",
  email: null,
  userId: null,
  role: null,
};

export function authReducer(_s: AuthState, e: AuthEvent): AuthState {
  switch (e.type) {
    case "UNCONFIGURED":
      return { status: "unconfigured", email: null, userId: null, role: null };
    case "SIGNED_OUT":
      return { status: "signed_out", email: null, userId: null, role: null };
    case "SESSION":
      return { status: "signed_in", email: e.email, userId: e.userId, role: e.role };
  }
}

/** Access requires a session AND a recognized role. Anything else is denied. */
export function canAccessApp(s: AuthState): boolean {
  return s.status === "signed_in" && s.role !== null;
}