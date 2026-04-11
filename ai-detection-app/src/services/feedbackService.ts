/**
 * Mock feedback submission service
 */
export interface FeedbackPayload {
  text: string;
  predictedClass: string;
  actualClass: string;
}

export const submitFeedback = async (payload: FeedbackPayload): Promise<{ success: boolean }> => {
  // Privacy-First: No personal data or login required
  const logPayload = {
    ...payload,
    timestamp: new Date().toISOString(),
    anonymousId: crypto.randomUUID(),
  };

  console.log('Sending feedback to backend...', logPayload);

  // Simulate network delay
  return new Promise((resolve) => {
    setTimeout(() => {
      console.log('Feedback submitted successfully (Mock)');
      resolve({ success: true });
    }, 1000);
  });
};
