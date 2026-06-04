/// <reference lib="webworker" />
import { AutoTokenizer } from '@huggingface/transformers';
import * as ort from 'onnxruntime-web';

declare const self: DedicatedWorkerGlobalScope;

ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/';

const MAX_LENGTH = 416;
const HF_REPO = 'Chitipat0947/wangchanberta-ai-detector';

type Tokenizer = Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>>;

let tokenizer: Tokenizer | null = null;
let session: ort.InferenceSession | null = null;

type InitMessage = { type: 'init'; modelBytes: ArrayBuffer };
type DetectMessage = { type: 'detect'; id: string; text: string };
type InMessage = InitMessage | DetectMessage;

function toInt64Array(source: ArrayLike<number>): BigInt64Array {
  const out = new BigInt64Array(source.length);
  for (let i = 0; i < source.length; i++) {
    out[i] = BigInt(Math.round(Number((source as ArrayLike<unknown>)[i])));
  }
  return out;
}

function softmax(logits: ArrayLike<number>): number[] {
  const arr = Array.from(logits);
  const max = Math.max(...arr);
  const exps = arr.map((x) => Math.exp(x - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((x) => x / sum);
}

async function handleInit(modelBytes: ArrayBuffer): Promise<void> {
  const bytes = new Uint8Array(modelBytes);
  const [tok, sess] = await Promise.all([
    AutoTokenizer.from_pretrained(HF_REPO),
    ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] }),
  ]);
  tokenizer = tok;
  session = sess;
  self.postMessage({ type: 'ready' });
}

async function handleDetect(id: string, text: string): Promise<void> {
  if (!tokenizer || !session) {
    self.postMessage({ type: 'error', id, message: 'Worker not initialized' });
    return;
  }

  const encoding = tokenizer(text, {
    padding: 'max_length',
    truncation: true,
    max_length: MAX_LENGTH,
  });

  const inputIds = new ort.Tensor(
    'int64',
    toInt64Array(encoding.input_ids.data as ArrayLike<number>),
    [1, MAX_LENGTH]
  );
  const attentionMask = new ort.Tensor(
    'int64',
    toInt64Array(encoding.attention_mask.data as ArrayLike<number>),
    [1, MAX_LENGTH]
  );

  const feeds: Record<string, ort.Tensor> = {
    input_ids: inputIds,
    attention_mask: attentionMask,
  };
  if (session.inputNames.includes('token_type_ids')) {
    feeds.token_type_ids = new ort.Tensor(
      'int64',
      new BigInt64Array(MAX_LENGTH),
      [1, MAX_LENGTH]
    );
  }

  const output = await session.run(feeds);
  const logits = output['logits'].data as Float32Array;
  // 4-class model: logits/probs ordered [Human, GPT, Gemini, Other] per id2label.
  const probs = softmax(logits);
  const pHuman = probs[0] ?? 0;
  const pGpt = probs[1] ?? 0;
  const pGemini = probs[2] ?? 0;
  const pOther = probs[3] ?? 0;

  // 'Other' is a real trained class now (DeepSeek/Qwen), so pick the argmax
  // directly — no confidence thresholding / OOD fallback needed.
  const cats = ['human', 'gpt', 'gemini', 'other'] as const;
  let top = 0;
  for (let i = 1; i < 4; i++) {
    if ((probs[i] ?? 0) > (probs[top] ?? 0)) top = i;
  }
  const category = cats[top];

  self.postMessage({
    type: 'result',
    id,
    category,
    probs: { human: pHuman, gpt: pGpt, gemini: pGemini, other: pOther },
    aiProbability: 1 - pHuman, // total likelihood the text is AI (any vendor)
  });
}

self.onmessage = async (event: MessageEvent<InMessage>) => {
  const msg = event.data;
  try {
    if (msg.type === 'init') {
      await handleInit(msg.modelBytes);
    } else if (msg.type === 'detect') {
      await handleDetect(msg.id, msg.text);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const id = 'id' in msg ? msg.id : undefined;
    self.postMessage({ type: 'error', id, message });
  }
};
