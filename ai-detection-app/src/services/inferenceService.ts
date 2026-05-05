import { AutoTokenizer } from '@huggingface/transformers';
import * as ort from 'onnxruntime-web';

ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/';

const MAX_LENGTH = 416;
const HF_REPO = 'Chitipat0947/wangchanberta-ai-detector';
const ONNX_URL = `https://huggingface.co/${HF_REPO}/resolve/main/model_quantized.onnx`;
const MODEL_CACHE = 'ai-detector-model-v1';

type Tokenizer = Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>>;

let _tokenizer: Tokenizer | null = null;
let _session: ort.InferenceSession | null = null;
let _loadingPromise: Promise<void> | null = null;

async function fetchModelBytes(
  onProgress?: (msg: string, pct?: number) => void
): Promise<Uint8Array> {
  const cache = 'caches' in self ? await caches.open(MODEL_CACHE) : null;

  if (cache) {
    const hit = await cache.match(ONNX_URL);
    if (hit) {
      onProgress?.('โหลดโมเดลจากแคช...');
      const buf = await hit.arrayBuffer();
      return new Uint8Array(buf);
    }
  }

  onProgress?.('กำลังดาวน์โหลดโมเดล (~102 MB)...', 0);
  const res = await fetch(ONNX_URL);
  if (!res.ok) throw new Error(`Model fetch failed: ${res.status}`);

  const total = Number(res.headers.get('content-length')) || 0;
  const reader = res.body?.getReader();
  if (!reader) {
    const buf = await res.arrayBuffer();
    if (cache) await cache.put(ONNX_URL, new Response(buf));
    return new Uint8Array(buf);
  }

  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (total) {
      const pct = Math.round((received / total) * 100);
      onProgress?.(`กำลังดาวน์โหลดโมเดล ${pct}%`, pct);
    }
  }

  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }

  if (cache) {
    await cache.put(
      ONNX_URL,
      new Response(bytes, {
        headers: { 'content-type': 'application/octet-stream', 'content-length': String(received) },
      })
    );
  }

  return bytes;
}

export async function loadModel(
  onProgress?: (msg: string, pct?: number) => void
): Promise<void> {
  if (_tokenizer && _session) return;
  if (_loadingPromise) return _loadingPromise;

  _loadingPromise = (async () => {
    onProgress?.('กำลังโหลด Tokenizer...');
    _tokenizer = await AutoTokenizer.from_pretrained(HF_REPO);

    const bytes = await fetchModelBytes(onProgress);

    onProgress?.('กำลังเตรียมโมเดล...');
    _session = await ort.InferenceSession.create(bytes, {
      executionProviders: ['wasm'],
    });

    onProgress?.('พร้อมวิเคราะห์');
  })().catch(err => {
    _loadingPromise = null;
    throw err;
  });

  return _loadingPromise;
}

export async function clearModelCache(): Promise<void> {
  if ('caches' in self) await caches.delete(MODEL_CACHE);
}

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
  const exps = arr.map(x => Math.exp(x - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map(x => x / sum);
}

export async function detectAI(
  text: string
): Promise<{ label: 'AI' | 'Human'; probability: number }> {
  if (!_tokenizer || !_session) await loadModel();

  const encoding = _tokenizer!(text, {
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

  const feeds: Record<string, ort.Tensor> = { input_ids: inputIds, attention_mask: attentionMask };

  const session = _session!;
  if (session.inputNames.includes('token_type_ids')) {
    feeds.token_type_ids = new ort.Tensor('int64', new BigInt64Array(MAX_LENGTH), [1, MAX_LENGTH]);
  }

  const output = await session.run(feeds);
  const logits = output['logits'].data as Float32Array;
  const probs = softmax(logits);

  return probs[1] > probs[0]
    ? { label: 'AI', probability: probs[1] }
    : { label: 'Human', probability: probs[0] };
}
