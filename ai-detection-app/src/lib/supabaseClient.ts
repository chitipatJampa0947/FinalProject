import type { SupabaseClient } from '@supabase/supabase-js';

export type BackendConfig = { url: string; key: string; siteKey: string };
export function validateBackendConfig(mode?: string, url?: string, key?: string, siteKey?: string): BackendConfig | null {
  if (mode !== 'secure-v1' || !url || !key || !siteKey) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) return null;
    if (key.startsWith('sb_secret_')) return null;
    if (key.startsWith('eyJ')) {
      const claims = JSON.parse(atob(key.split('.')[1].replaceAll('-', '+').replaceAll('_', '/'))) as { role?: string };
      if (claims.role !== 'anon') return null;
    } else if (!key.startsWith('sb_publishable_')) return null;
    return { url: parsed.origin, key, siteKey };
  } catch { return null; }
}
export function backendConfig(): BackendConfig | null {
  return validateBackendConfig(import.meta.env.VITE_BACKEND_MODE, import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, import.meta.env.VITE_TURNSTILE_SITE_KEY);
}
let client: Promise<SupabaseClient> | undefined;
export function getAdminClient(): Promise<SupabaseClient> {
  const config = backendConfig();
  if (!config) return Promise.reject(new Error('Secure backend is not configured. Inference remains available.'));
  client ??= import('@supabase/supabase-js').then(({ createClient }) => createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store', signal: init?.signal
      ? AbortSignal.any([init.signal, AbortSignal.timeout(12_000)]) : AbortSignal.timeout(12_000) }) },
  })).catch((error: unknown) => { client = undefined; throw error; });
  return client;
}
