import { useCallback, useState } from 'react';

export type DetectCategory = 'human' | 'gpt' | 'gemini' | 'other';
export interface ClassProbs {
  human: number;
  gpt: number;
  gemini: number;
}
export interface DetectionOutcome {
  category: DetectCategory;
  probs: ClassProbs;
  aiProbability: number; // 1 - P(human); total AI likelihood across vendors
}

export interface UseAIInferenceReturn {
  isModelLoading: boolean;
  isAnalyzing: boolean;
  isModelReady: boolean;
  modelStatus: string;
  modelProgress: number | null;
  result: DetectionOutcome | null;
  error: string | null;
  preloadModel: () => Promise<void>;
  analyzeText: (text: string) => Promise<void>;
  reset: () => void;
}

type InferenceModule = typeof import('../services/inferenceService');

// Module-level promise — the inference service (and its ~5 MB ORT WASM bundle)
// stays out of the main chunk until first call. Shared across all hook
// consumers, so we never load the module twice.
let _inferenceModulePromise: Promise<InferenceModule> | null = null;
const getInference = (): Promise<InferenceModule> => {
  if (!_inferenceModulePromise) {
    _inferenceModulePromise = import('../services/inferenceService');
  }
  return _inferenceModulePromise;
};

export function useAIInference(): UseAIInferenceReturn {
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isModelReady, setIsModelReady] = useState(false);
  const [modelStatus, setModelStatus] = useState('');
  const [modelProgress, setModelProgress] = useState<number | null>(null);
  const [result, setResult] = useState<DetectionOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  const preloadModel = useCallback(async (): Promise<void> => {
    if (isModelReady || isModelLoading) return;
    setIsModelLoading(true);
    setModelStatus('กำลังเตรียมโมเดล...');
    setModelProgress(0);
    setError(null);
    try {
      const { loadModel } = await getInference();
      await loadModel((msg, pct) => {
        setModelStatus(msg);
        if (typeof pct === 'number') setModelProgress(pct);
      });
      // Service resolved — model is ready regardless of whether the cache
      // hit path emitted any pct callbacks. Force completion state.
      setIsModelReady(true);
      setModelStatus('พร้อมวิเคราะห์');
      setModelProgress(100);
    } catch (err) {
      console.error('Model preload failed:', err);
      setError(err instanceof Error ? err.message : String(err));
      setModelStatus('โหลดโมเดลล้มเหลว — จะลองใหม่เมื่อกด Analyze');
    } finally {
      setIsModelLoading(false);
    }
  }, [isModelLoading, isModelReady]);

  const analyzeText = useCallback(
    async (text: string): Promise<void> => {
      if (isAnalyzing) return;
      setIsAnalyzing(true);
      setError(null);
      if (!isModelReady) {
        setModelStatus('');
        setModelProgress(0);
      }
      // Yield so React commits + paints the spinner BEFORE the synchronous
      // WASM session.run() block grabs the main thread.
      await new Promise((resolve) => setTimeout(resolve, 50));
      try {
        const { loadModel, detectAI } = await getInference();
        await loadModel((msg, pct) => {
          setModelStatus(msg);
          if (typeof pct === 'number') setModelProgress(pct);
        });
        setIsModelReady(true);
        setModelProgress(100);
        // Second yield: ensure spinner stays painted right before the heavy
        // synchronous ORT call kicks in.
        await new Promise((resolve) => setTimeout(resolve, 0));
        const outcome = await detectAI(text);
        setResult(outcome);
      } catch (err) {
        console.error('Inference failed:', err);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsAnalyzing(false);
        setModelStatus('');
        setModelProgress(null);
      }
    },
    [isAnalyzing, isModelReady]
  );

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return {
    isModelLoading,
    isAnalyzing,
    isModelReady,
    modelStatus,
    modelProgress,
    result,
    error,
    preloadModel,
    analyzeText,
    reset,
  };
}
