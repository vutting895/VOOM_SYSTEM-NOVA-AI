import { createContext, useContext, useEffect, useReducer, type ReactNode } from "react";
import { authReducer, initialAuthState, type AuthState } from "./auth-state";
import { getSupabase } from "./supabase";
import { parseRole } from "./roles";
import { setTokenGetter } from "./api";

interface AuthCtx extends AuthState {
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, initialAuthState);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) {
      dispatch({ type: "UNCONFIGURED" });
      return;
    }
    setTokenGetter(async () => (await sb.auth.getSession()).data.session?.access_token ?? null);
    sb.auth.getUser().then(({ data }) => {
      if (data.user)
        dispatch({
          type: "SESSION",
          email: data.user.email ?? null,
          userId: data.user.id,
          role: parseRole(data.user),
        });
      else dispatch({ type: "SIGNED_OUT" });
    });
    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) dispatch({ type: "SIGNED_OUT" });
      else if (event === "SIGNED_IN" || event === "USER_UPDATED" || event === "TOKEN_REFRESHED")
        dispatch({
          type: "SESSION",
          email: session.user.email ?? null,
          userId: session.user.id,
          role: parseRole(session.user),
        });
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const value: AuthCtx = {
    ...state,
    signIn: async (email, password) => {
      const sb = getSupabase();
      if (!sb) return "Authentication is not configured.";
      const { error } = await sb.auth.signInWithPassword({ email, password });
      return error ? error.message : null;
    },
    signOut: async () => {
      await getSupabase()?.auth.signOut();
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside AuthProvider");
  return c;
}