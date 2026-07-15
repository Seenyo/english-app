import { createContext } from 'react';
import type { Session, User } from '@supabase/supabase-js';

export type AuthContextValue = {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  configured: boolean;
  error: string | null;
  clearError: () => void;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

// The context object lives in its own (component-free) file so React Fast
// Refresh works cleanly for AuthProvider.
export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined,
);
