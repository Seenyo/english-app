// Centralized access to build-time env. These values are PUBLIC — they ship in
// the bundle and are safe only under Row Level Security. Server-only database
// credentials must never appear here (or anywhere in src/).
export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const configuredAiBridgeUrl = import.meta.env.VITE_AI_BRIDGE_URL
  ?.trim()
  .replace(/\/+$/, '');

export const aiBridgeUrl =
  configuredAiBridgeUrl ||
  (import.meta.env.DEV ? 'http://127.0.0.1:8787' : null);

export function getAiBridgeUrl(): string {
  if (!aiBridgeUrl) {
    throw new Error('AIブリッジの公開URLが設定されていません。');
  }
  return aiBridgeUrl;
}

export const isConfigured = Boolean(supabaseUrl && supabaseAnonKey);
