import type { CompletedDetection } from '../inference/contract.ts';
import { createFeedbackPayload } from '../inference/feedback.ts';
export function secureFeedbackPayload(result: CompletedDetection, expected: 'Human' | 'AI') {
  return { ...createFeedbackPayload(result, expected), model_id: result.artifactId,
    category: result.category, probabilities: { ...result.probs } };
}
export async function submitFeedback(config: { url: string; key: string }, payload: unknown, challenge: string,
  transport: typeof fetch = fetch): Promise<void> {
  if (!challenge) throw new Error('Complete the feedback verification first.');
  const response = await transport(config.url + '/functions/v1/submit-feedback', {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: config.key },
    body: JSON.stringify({ payload, challenge }), signal: AbortSignal.timeout(12_000), credentials: 'omit',
  });
  if (!response.ok) throw new Error(response.status === 429 ? 'Feedback limit reached. Please try later.' : 'Feedback is unavailable. Your analysis is unaffected.');
  const receipt: unknown = await response.json();
  if (!receipt || typeof receipt !== 'object' || !('accepted' in receipt) || receipt.accepted !== true) throw new Error('Invalid feedback acknowledgement.');
}
