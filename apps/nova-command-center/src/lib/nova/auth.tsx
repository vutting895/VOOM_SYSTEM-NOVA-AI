import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import { authReducer, initialAuthState, type AuthState } from "./auth-state";
import { getSupabase } from "./supabase";
import { parseRole } from "./roles";
import { setTokenGetter } from "./api";
import { hasUserIdentityChanged } from "./session-scope";

interface AuthCtx extends AuthState {
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, initialAuthState);
  const queryClient = useQueryClient();
  const currentUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) {
      dispatch({ type: "UNCONFIGURED" });
      return;
    }

    setTokenGetter(
      async () =>
        (await sb.auth.getSession()).data.session?.access_token ?? null,
    );

    let active = true;
    let authEventSeen = false;

    const applyUser = (user: User | null) => {
      const nextUserId = user?.id ?? null;
      if (hasUserIdentityChanged(currentUserIdRef.current, nextUserId)) {
        // Never let one authenticated identity inherit another identity's cached API data.
        queryClient.clear();
        currentUserIdRef.current = nextUserId;
      }

      if (user) {
        dispatch({
          type: "SESSION",
          email: user.email ?? null,
          userId: user.id,
          role: parseRole(user),
        });
      } else {
        dispatch({ type: "SIGNED_OUT" });
      }
    };

    // Subscribe first so a later getUser() result cannot overwrite a newer auth event.
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      authEventSeen = true;
      if (!active) return;
      if (!session) applyUser(null);
      else applyUser(session.user);
    });

    void sb.auth
      .getUser()
      .then(({ data }) => {
        if (active && !authEventSeen) applyUser(data.user);
      })
      .catch(() => {
        if (active && !authEventSeen) applyUser(null);
      });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [queryClient]);

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
