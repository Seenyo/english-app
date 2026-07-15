import { useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { isConfigured } from '@/config/env';
import { supabase } from '@/lib/supabase';
import { AuthContext, type AuthContextValue } from './AuthContext';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(isConfigured);
  const [error, setError] = useState<string | null>(null);

  // Seed from storage, then track changes. Treat INITIAL_SESSION as authoritative.
  useEffect(() => {
    if (!supabase) return;

    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      .catch(() => setError('Could not restore session.'))
      .finally(() => setIsLoading(false));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  // Surface an OAuth error if Supabase redirected back with one.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const message = params.get('error_description') ?? params.get('error');
    if (message) setError(decodeErrorMessage(message));
  }, []);

  async function signInWithGoogle() {
    if (!supabase) return;
    setError(null);
    try {
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + import.meta.env.BASE_URL,
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    }
  }

  async function signOut() {
    if (!supabase) return;
    // 'local' — the default 'global' would sign out every device.
    await supabase.auth.signOut({ scope: 'local' });
  }

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    isLoading,
    configured: isConfigured,
    error,
    clearError: () => setError(null),
    signInWithGoogle,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function decodeErrorMessage(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
}
