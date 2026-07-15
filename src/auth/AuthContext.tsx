import {
  createContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export type AuthContextValue = {
  session: Session | null
  user: User | null
  isLoading: boolean
  configured: boolean
  error: string | null
  clearError: () => void
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = supabase !== null
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(configured)
  const [error, setError] = useState<string | null>(null)

  // Seed from storage, then track changes. Treat INITIAL_SESSION as authoritative.
  useEffect(() => {
    if (!supabase) return

    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      .catch(() => setError('Could not restore session.'))
      .finally(() => setIsLoading(false))

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })

    return () => {
      sub.subscription.unsubscribe()
    }
  }, [])

  // Surface an OAuth error if Supabase redirected back with one.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const message = params.get('error_description') ?? params.get('error')
    if (message) setError(decodeErrorMessage(message))
  }, [])

  async function signInWithGoogle() {
    if (!supabase) return
    setError(null)
    try {
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + import.meta.env.BASE_URL,
        },
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.')
    }
  }

  async function signOut() {
    if (!supabase) return
    // 'local' — the default 'global' would sign out every device.
    await supabase.auth.signOut({ scope: 'local' })
  }

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    isLoading,
    configured,
    error,
    clearError: () => setError(null),
    signInWithGoogle,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

function decodeErrorMessage(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '))
  } catch {
    return value
  }
}
