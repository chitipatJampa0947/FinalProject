/// <reference lib="webworker" />
import * as ort from 'onnxruntime-web';
import { MODEL_MANIFEST as manifest, ORT_VERSION } from '../inference/manifest.ts';
import { verifyBytes, sha256 } from '../inference/artifacts.ts';
import { classify, verifySessionSchema } from '../inference/contract.ts';
import { createTokenizer, MAX_LENGTH } from '../inference/tokenizer.ts';
import type { InitAssets } from '../inference/client.ts';
declare const self: DedicatedWorkerGlobalScope;
ort.env.wasm.wasmPaths = manifest.runtime.wasmPath;
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;
let session: ort.InferenceSession | null = null;
let tokenize: ReturnType<typeof createTokenizer> | null = null;
let state: 'empty' | 'initializing' | 'ready' | 'busy' = 'empty';
async function init(assets: InitAssets): Promise<void> {
  if (state !== 'empty') throw new Error('Worker already initialized');
  state = 'initializing';
  try {
    const descriptors = { model: manifest.model, tokenizer: manifest.tokenizer,
      tokenizerConfig: manifest.tokenizerConfig, modelConfig: manifest.modelConfig };
    for (const key of Object.keys(descriptors) as (keyof InitAssets)[]) {
      await verifyBytes(new Uint8Array(assets[key]), descriptors[key]);
    }
    const json = (bytes: ArrayBuffer) => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    const config = json(assets.modelConfig);
    if (JSON.stringify(Object.values(config.id2label)) !== JSON.stringify(manifest.labels) ||
        config.model_type !== 'camembert' || config.pad_token_id !== 1) throw new Error('Model configuration mismatch');
    tokenize = createTokenizer(json(assets.tokenizer), json(assets.tokenizerConfig));
    session = await ort.InferenceSession.create(new Uint8Array(assets.model), { executionProviders: ['wasm'] });
    verifySessionSchema(session.inputMetadata, session.outputMetadata);
    if (ort.env.versions.web !== ORT_VERSION) throw new Error('ONNX Runtime version mismatch');
    state = 'ready';
    self.postMessage({ type: 'ready', artifactId: manifest.id, runtimeVersion: ort.env.versions.web });
  } catch (error) {
    await session?.release(); session = null; tokenize = null; state = 'empty';
    throw error;
  }
}
async function detect(id: string, text: string): Promise<void> {
  if (state !== 'ready' || !session || !tokenize) throw new Error('Worker is not ready or is busy');
  if (typeof text !== 'string' || text.length > 10_000) throw new Error('Unsupported text length');
  state = 'busy';
  const encoding = tokenize(text);
  const ids = new ort.Tensor('int64', BigInt64Array.from(encoding.input_ids, BigInt), [1, MAX_LENGTH]);
  const mask = new ort.Tensor('int64', BigInt64Array.from(encoding.attention_mask, BigInt), [1, MAX_LENGTH]);
  let output: ort.InferenceSession.ReturnType | undefined;
  try {
    output = await session.run({ input_ids: ids, attention_mask: mask });
    const logits = output.logits;
    if (logits.type !== 'float32' || logits.dims.length !== 2 ||
        logits.dims[0] !== 1 || logits.dims[1] !== 4) throw new Error('Invalid logits tensor');
    const result = classify(logits.data as Float32Array, manifest.id);
    const inputHash = await sha256(new TextEncoder().encode(JSON.stringify([encoding.input_ids, encoding.attention_mask])));
    self.postMessage({ type: 'result', id, result, inputHash });
  } finally {
    ids.dispose(); mask.dispose();
    if (output) for (const tensor of Object.values(output)) tensor.dispose();
    state = 'ready';
  }
}
self.onmessage = (event: MessageEvent) => {
  const msg = event.data;
  const work = msg?.type === 'init' ? init(msg.assets) :
    msg?.type === 'detect' ? detect(msg.id, msg.text) : Promise.reject(new Error('Unknown worker request'));
  void work.catch(error => self.postMessage({ type: 'error', id: msg?.id,
    message: error instanceof Error ? error.message : 'Inference failed' }));
};
