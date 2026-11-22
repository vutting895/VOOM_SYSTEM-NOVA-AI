import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';

export type NovaRole = 'admin' | 'operator' | 'viewer';

type AuthContextValue = {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  role: NovaRole | null;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUpWithPassword: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function readRole(user: User | null): NovaRole | null {
  // Roles must be assigned by a trusted administrative path in app_metadata.
  // Never read authorization roles from user_metadata or local storage.
  const value = user?.app_metadata?.nova_role;
  return value === 'admin' || value === 'operator' || value === 'viewer' ? value : null;
}

export function SupabaseAuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    const supabase = getSupabaseClient();
    let mounted = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (!error) setSession(data.session);
      setLoading(false);
    }).catch(() => { if (mounted) setLoading(false); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (mounted) setSession(nextSession);
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    configured: isSupabaseConfigured,
    loading,
    session,
    user: session?.user ?? null,
    role: readRole(session?.user ?? null),
    signInWithPassword: async (email, password) => {
      const { error } = await getSupabaseClient().auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    signUpWithPassword: async (email, password) => {
      const { error } = await getSupabaseClient().auth.signUp({ email, password });
      if (error) throw error;
    },
    signOut: async () => {
      const { error } = await getSupabaseClient().auth.signOut();
      if (error) throw error;
    },
  }), [loading, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useNovaAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useNovaAuth must be used inside SupabaseAuthProvider');
  return value;
}
