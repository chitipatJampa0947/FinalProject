import { MODEL_MANIFEST as manifest, MODEL_CACHE, ORT_VERSION } from '../inference/manifest.ts';
import { loadVerifiedAsset } from '../inference/artifacts.ts';
import { InferenceClient } from '../inference/client.ts';
export type { DetectCategory, ClassProbs, DetectResult } from '../inference/contract.ts';
const client = new InferenceClient({
  artifactId: manifest.id,
  runtimeVersion: ORT_VERSION,
  makeWorker: () => new Worker(new URL('../workers/inferenceWorker.ts', import.meta.url), { type: 'module' }),
  prepare: async (progress, signal) => {
    progress('กำลังโหลดและตรวจสอบโมเดล / Loading and verifying model (' +
      (manifest.model.bytes / 1_000_000).toFixed(2) + ' MB)...', 0);
    const model = await loadVerifiedAsset(manifest.model, MODEL_CACHE,
      (received, total) => progress('กำลังโหลดโมเดล / Loading model...', Math.min(75, Math.round(received / total * 75))),
      { signal });
    progress('กำลังตรวจสอบโทเคไนเซอร์ / Verifying tokenizer...', 80);
    const [tokenizer, tokenizerConfig, modelConfig] = await Promise.all([
      loadVerifiedAsset(manifest.tokenizer, MODEL_CACHE, undefined, { signal }),
      loadVerifiedAsset(manifest.tokenizerConfig, MODEL_CACHE, undefined, { signal }),
      loadVerifiedAsset(manifest.modelConfig, MODEL_CACHE, undefined, { signal }),
    ]);
    return { model: model.buffer, tokenizer: tokenizer.buffer,
      tokenizerConfig: tokenizerConfig.buffer, modelConfig: modelConfig.buffer };
  },
});
export const loadModel = client.load.bind(client);
export const detectAI = client.detect.bind(client);
export const disposeModel = client.dispose.bind(client);
export async function clearModelCache(): Promise<void> {
  client.dispose();
  try { await globalThis.caches?.delete(MODEL_CACHE); } catch { /* optional persistence */ }
}
