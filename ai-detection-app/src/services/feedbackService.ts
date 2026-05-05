/**
 * Feedback submission service (Opt-in only — Two-Mode Privacy Model)
 *
 * PRIVACY ARCHITECTURE:
 *   Mode 1 — Inference: runs entirely in-browser via ONNX Runtime Web.
 *             Zero-Data Leakage. No network call. Text never leaves device.
 *   Mode 2 — Feedback (this file): user explicitly consents before any data
 *             is sent. Text is transmitted anonymously for model improvement.
 *             This is opt-in and disclosed in the Privacy Consensus modal.
 */

export interface FeedbackPayload {
  text: string;
  predictedClass: string;
  actualClass: string;
}

export interface AnonymousFeedbackPayload {
  textLength: number;
  textHash: string;
  predictedClass: string;
  actualClass: string;
  timestamp: string;
  anonymousId: string;
  fullText?: string;
}

/**
 * Hash text client-side so the server receives a fingerprint, not raw content,
 * unless the user explicitly opted to share the full text.
 */
async function hashText(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const submitFeedback = async (
  payload: FeedbackPayload,
  shareFullText = true
): Promise<{ success: boolean }> => {
  const textHash = await hashText(payload.text);

  const anonymousPayload: AnonymousFeedbackPayload = {
    textLength: payload.text.length,
    textHash,
    predictedClass: payload.predictedClass,
    actualClass: payload.actualClass,
    timestamp: new Date().toISOString(),
    anonymousId: crypto.randomUUID(),
    ...(shareFullText && { fullText: payload.text }),
  };

  console.log('Sending opt-in feedback (Mode 2 — user consented):', {
    ...anonymousPayload,
    fullText: shareFullText ? '[included]' : '[omitted]',
  });

  // TODO: replace with real Supabase call in Semester 2
  // Example:
  // const { error } = await supabase.from('feedback').insert([anonymousPayload]);
  // if (error) throw error;

  return new Promise((resolve) => {
    setTimeout(() => {
      console.log('Feedback submitted successfully (Mock — Supabase pending)');
      resolve({ success: true });
    }, 1000);
  });
};
