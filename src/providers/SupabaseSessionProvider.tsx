import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { createNovaApprovalApi } from "../services/novaApprovalApi";
import { supabaseClient } from "../services/supabaseClient";

type NovaApprovalApi = ReturnType<typeof createNovaApprovalApi>;

interface SupabaseSessionContextValue {
  isConfigured: boolean;
  loading: boolean;
  user: User | null;
  getAccessToken: () => Promise<string | null>;
  approvalApi: NovaApprovalApi | null;
  signOut: () => Promise<void>;
}

const SupabaseSessionContext = createContext<SupabaseSessionContextValue | null>(null);

export function SupabaseSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(supabaseClient));

  useEffect(() => {
    if (!supabaseClient) {
      setSession(null);
      setLoading(false);
      return;
    }

    // Supabase emits INITIAL_SESSION and subsequent sign-in, refresh, and sign-out events.
    const { data } = supabaseClient.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    if (!supabaseClient) return null;

    const { data, error } = await supabaseClient.auth.getSession();
    if (error) return null;
    return data.session?.access_token ?? null;
  }, []);

  const approvalApi = useMemo(
    () => supabaseClient
      ? createNovaApprovalApi({ getAccessToken })
      : null,
    [getAccessToken],
  );

  const signOut = useCallback(async () => {
    if (!supabaseClient) return;
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
  }, []);

  const value = useMemo<SupabaseSessionContextValue>(() => ({
    isConfigured: Boolean(supabaseClient),
    loading,
    user: session?.user ?? null,
    getAccessToken,
    approvalApi,
    signOut,
  }), [loading, session, getAccessToken, approvalApi, signOut]);

  return (
    <SupabaseSessionContext.Provider value={value}>
      {children}
    </SupabaseSessionContext.Provider>
  );
}

export function useSupabaseSession(): SupabaseSessionContextValue {
  const context = useContext(SupabaseSessionContext);
  if (!context) {
    throw new Error("useSupabaseSession must be used inside SupabaseSessionProvider");
  }
  return context;
}
