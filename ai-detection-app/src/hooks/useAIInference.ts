import { useCallback, useRef, useState } from 'react';
import type { CompletedDetection } from '../inference/contract';
export type { DetectCategory, ClassProbs } from '../inference/contract';
export type DetectionOutcome = CompletedDetection;
export interface UseAIInferenceReturn {
  isModelLoading: boolean; isAnalyzing: boolean; isModelReady: boolean;
  modelStatus: string; modelProgress: number | null; result: DetectionOutcome | null;
  error: string | null; preloadModel: () => Promise<void>;
  analyzeText: (text: string) => Promise<void>; reset: () => void;
}
type InferenceModule = typeof import('../services/inferenceService');
let modulePromise: Promise<InferenceModule> | null = null;
const getInference = () => {
  modulePromise ??= import('../services/inferenceService').catch(error => { modulePromise = null; throw error; });
  return modulePromise;
};
export function useAIInference(): UseAIInferenceReturn {
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isModelReady, setIsModelReady] = useState(false);
  const [modelStatus, setModelStatus] = useState('');
  const [modelProgress, setModelProgress] = useState<number | null>(null);
  const [result, setResult] = useState<DetectionOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loading = useRef(false), analyzing = useRef(false), generation = useRef(0);
  const progress = useCallback((message: string, pct?: number) => {
    setModelStatus(message);
    if (typeof pct === 'number') setModelProgress(pct);
  }, []);
  const preloadModel = useCallback(async () => {
    if (loading.current) return;
    loading.current = true; setIsModelLoading(true); setError(null);
    try {
      const service = await getInference();
      await service.loadModel(progress);
      setIsModelReady(true);
    } catch (e) {
      setIsModelReady(false); setError(e instanceof Error ? e.message : String(e));
      setModelStatus('โหลดโมเดลล้มเหลว / Model load failed — retry Analyze');
    } finally { loading.current = false; setIsModelLoading(false); }
  }, [progress]);
  const analyzeText = useCallback(async (text: string) => {
    if (analyzing.current) return;
    analyzing.current = true;
    const request = ++generation.current;
    setIsAnalyzing(true); setResult(null); setError(null);
    try {
      const service = await getInference();
      await service.loadModel(progress);
      setIsModelReady(true);
      const outcome = await service.detectAI(text);
      if (request === generation.current) setResult({ ...outcome, text });
    } catch (e) {
      setIsModelReady(false);
      if (request === generation.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      analyzing.current = false; setIsAnalyzing(false);
      setModelStatus(''); setModelProgress(null);
    }
  }, [progress]);
  const reset = useCallback(() => { generation.current++; setResult(null); setError(null); }, []);
  return { isModelLoading, isAnalyzing, isModelReady, modelStatus, modelProgress, result, error,
    preloadModel, analyzeText, reset };
}
