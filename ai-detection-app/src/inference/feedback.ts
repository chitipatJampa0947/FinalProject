import type { CompletedDetection } from './contract.ts';
// Existing database schema stores total AI probability as percentage (0–100).
export function createFeedbackPayload(result: CompletedDetection, expected: 'Human' | 'AI') {
  if (!result.text || !Number.isFinite(result.aiProbability) ||
      result.aiProbability < 0 || result.aiProbability > 1 ||
      Math.abs(result.aiProbability - (1 - result.probs.human)) > 1e-6) {
    throw new Error('Cannot report an incomplete or inconsistent prediction');
  }
  return { reported_text: result.text, ai_probability: result.aiProbability * 100,
    user_expected_label: expected === 'AI' ? 'AI-Generated' : 'Human', status: 'pending' };
}
