import definition from './model-manifest.json' with { type: 'json' };
import type { Asset } from './artifacts.ts';
export const ORT_VERSION = '1.26.0-dev.20260416-b7804b056c';
export type ModelManifest = {
  schemaVersion: number; id: string; contract: string; maxLength: number; labels: string[];
  inputType: string; outputType: string;
  runtime: { version: string; wasmPath: string };
  model: Asset & { tokenizerSha256: string };
  tokenizer: Asset; tokenizerConfig: Asset; modelConfig: Asset;
};
export function validateManifest(m: ModelManifest): ModelManifest {
  if (m.schemaVersion !== 1 || m.contract !== 'camembert-saved-map-400-v1' ||
      m.maxLength !== 400 || JSON.stringify(m.labels) !== '["Human","GPT","Gemini","Other"]' ||
      m.inputType !== 'int64' || m.outputType !== 'float32' || m.runtime.version !== ORT_VERSION ||
      m.model.tokenizerSha256 !== m.tokenizer.sha256 || !/^[a-z0-9-]+$/.test(m.id)) {
    throw new Error('Incompatible model/tokenizer manifest');
  }
  for (const a of [m.model, m.tokenizer, m.tokenizerConfig, m.modelConfig]) {
    if (!a.url.startsWith('/artifacts/' + m.id + '/') || !/^[a-f0-9]{64}$/.test(a.sha256) ||
        !Number.isSafeInteger(a.bytes) || a.bytes <= 0) throw new Error('Invalid versioned artifact');
  }
  if (m.runtime.wasmPath !== '/artifacts/' + m.id + '/runtime/') throw new Error('Invalid runtime path');
  return m;
}
export const MODEL_MANIFEST = validateManifest(definition);
export const MODEL_CACHE = 'thai-detector-' + MODEL_MANIFEST.id + '-' + MODEL_MANIFEST.model.sha256;
