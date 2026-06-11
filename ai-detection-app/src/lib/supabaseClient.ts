import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    'Supabase env vars missing (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). Report submission will fail.'
  );
}

// createClient throws on an empty/invalid URL at module-evaluation time, which
// would white-screen the whole app — including Mode-1 detection, which doesn't
// need Supabase at all. With a syntactically valid placeholder the client is
// constructed safely and only the opt-in feedback path fails (its errors are
// already caught and surfaced by the report/admin UI).
export const supabase = createClient(
  SUPABASE_URL || 'https://placeholder.supabase.co',
  SUPABASE_ANON_KEY || 'placeholder-anon-key'
);
