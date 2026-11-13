export const MODEL_ID = 'thai-en-w8a32-4baa5cb331f6-v1';
export type FeedbackPayload = { reported_text: string; ai_probability: number; user_expected_label: 'Human' | 'AI-Generated';
  status: 'pending'; model_id: string; category: string; probabilities: Record<string, number> };
export function validateFeedback(value: unknown): FeedbackPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid payload');
  const p = value as Record<string, unknown>;
  const fields = ['reported_text','ai_probability','user_expected_label','status','model_id','category','probabilities'];
  if (Object.keys(p).length !== fields.length || fields.some(k => !(k in p))) throw new Error('Invalid fields');
  if (typeof p.reported_text !== 'string' || [...p.reported_text].length < 200 || [...p.reported_text].length > 10000 ||
    !p.reported_text.trim() || new TextEncoder().encode(p.reported_text).length > 40000 || p.reported_text.includes('\0') ||
    typeof p.ai_probability !== 'number' || !Number.isFinite(p.ai_probability) || p.ai_probability < 0 || p.ai_probability > 100 ||
    !['Human','AI-Generated'].includes(String(p.user_expected_label)) || p.status !== 'pending' || p.model_id !== MODEL_ID) throw new Error('Invalid values');
  const probs = p.probabilities as Record<string, unknown>;
  const labels = ['human','gpt','gemini','other'];
  if (!probs || typeof probs !== 'object' || Array.isArray(probs) || Object.keys(probs).length !== 4 ||
    labels.some(k => typeof probs[k] !== 'number' || !Number.isFinite(probs[k]) || Number(probs[k]) < 0 || Number(probs[k]) > 1)) throw new Error('Invalid probabilities');
  const numbers = labels.map(k => Number(probs[k])); let top = 0;
  for (let i = 1; i < 4; i++) if (numbers[i] > numbers[top]) top = i;
  if (Math.abs(numbers.reduce((a,b) => a+b,0)-1) > 1e-6 || Math.abs(p.ai_probability-(1-numbers[0])*100) > 1e-4 || p.category !== labels[top]) throw new Error('Inconsistent prediction');
  return p as FeedbackPayload;
}
export type FeedbackDependencies = { origins: string[]; verify: (token: string, hostname: string) => Promise<boolean>;
  insert: (payload: FeedbackPayload, tokenHash: string) => Promise<'ok' | 'rate_limit'> };
export function feedbackHandler(deps: FeedbackDependencies) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin') ?? '';
    const allowed = deps.origins.includes(origin);
    const headers: Record<string,string> = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin' };
    if (allowed) Object.assign(headers, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type, apikey' });
    const reply = (status: number, error?: string) => new Response(JSON.stringify(error ? { error } : { accepted: true }), { status, headers });
    if (!allowed) return reply(403, 'Origin not permitted');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return reply(405, 'Method not allowed');
    if (!request.headers.get('content-type')?.startsWith('application/json')) return reply(415, 'JSON required');
    let payload: FeedbackPayload; let challenge: string;
    try {
      const reader = request.body?.getReader(); if (!reader) return reply(400, 'Body required');
      let bytes = 0; const chunks: Uint8Array[] = [];
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { void reader.cancel(); reject(new Error('Body timeout')); }, 5000); });
      try { for (;;) { const result = await Promise.race([reader.read(), deadline]); if (result.done) break;
        bytes += result.value.length; if (bytes > 48000) { await reader.cancel(); return reply(413, 'Body too large'); } chunks.push(result.value); } }
      finally { clearTimeout(timer); reader.releaseLock(); }
      const body = new Uint8Array(bytes); let offset = 0; for (const part of chunks) { body.set(part, offset); offset += part.length; }
      const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
      if (!value || typeof value !== 'object' || Object.keys(value).length !== 2 || !('payload' in value) || !('challenge' in value) ||
        typeof value.challenge !== 'string' || !value.challenge || value.challenge.length > 2048) return reply(400, 'Invalid submission');
      payload = validateFeedback(value.payload); challenge = value.challenge;
    } catch { return reply(400, 'Invalid submission'); }
    try {
      if (!await deps.verify(challenge, new URL(origin).hostname)) return reply(403, 'Verification failed');
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(challenge));
      const hash = [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2,'0')).join('');
      if (await deps.insert(payload, hash) === 'rate_limit') return reply(429, 'Feedback limit reached');
      return reply(202);
    } catch { return reply(503, 'Feedback temporarily unavailable'); }
  };
}
