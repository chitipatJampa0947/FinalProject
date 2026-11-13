import { feedbackHandler } from './handler.ts';
// Server secrets only. Never prefix these values with VITE_ or ship them to React.
const url = Deno.env.get('SUPABASE_URL') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const secret = Deno.env.get('TURNSTILE_SECRET_KEY') ?? '';
const origins = (Deno.env.get('FEEDBACK_ALLOWED_ORIGINS') ?? '').split(',').map(v => v.trim()).filter(Boolean);
Deno.serve(feedbackHandler({ origins,
  verify: async (token, hostname) => {
    if (!secret || !serviceKey || !url) return false;
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, response: token }), signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return false;
    const value = await response.json();
    return value.success === true && value.hostname === hostname && value.action === 'feedback';
  },
  insert: async (payload, tokenHash) => {
    const response = await fetch(url + '/rest/v1/rpc/ingest_verified_feedback', {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: serviceKey, Authorization: 'Bearer ' + serviceKey },
      body: JSON.stringify({ p_payload: payload, p_challenge_hash: tokenHash }), signal: AbortSignal.timeout(5000),
    });
    if (response.status === 429) return 'rate_limit';
    if (!response.ok) throw new Error('Feedback write failed');
    return 'ok';
  },
}));
