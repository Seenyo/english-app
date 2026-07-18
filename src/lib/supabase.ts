import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isConfigured, supabaseAnonKey, supabaseUrl } from '@/config/env';

// null when env is missing -> the UI shows a "configure Supabase" state.
// The anon/publishable key is PUBLIC; safety comes entirely from RLS.
export const supabase: SupabaseClient | null = isConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { flowType: 'pkce', persistSession: true },
    })
  : null;
