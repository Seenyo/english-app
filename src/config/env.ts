// Centralized access to build-time env. These values are PUBLIC — they ship in
// the bundle and are safe only under Row Level Security. The service_role key
// must never appear here (or anywhere in src/).
export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(supabaseUrl && supabaseAnonKey);
