// Base URL for the R2 bucket hosting both the ONNX model and tokenizer files.
// Override at build time via `VITE_R2_MODEL_URL` in `.env`. Falls back to the
// current R2 public URL so existing deploys keep working until the bucket move.
const R2_BASE_URL: string =
  (import.meta.env.VITE_R2_MODEL_URL as string | undefined) ??
  'https://pub-6134e6ba6a5149f7b5872db48d5182f3.r2.dev';
const ONNX_URL = `${R2_BASE_URL}/model_quantized.onnx`;
const MODEL_CACHE = 'ai-detector-model-v3'; // v3 = 3-class vendor model (Human/GPT/Gemini)

const PARALLEL_CHUNKS = 6;
const MOBILE_CHUNKS = 2;
const PROBE_TIMEOUT_MS = 8_000;
const DOWNLOAD_MSG = 'กำลังดาวน์โหลดโมเดล';

type ProgressFn = (msg: string, pct?: number) => void;

export type DetectCategory = 'human' | 'gpt' | 'gemini' | 'other';
export type ClassProbs = { human: number; gpt: number; gemini: number };
export type DetectResult = {
  category: DetectCategory;
  probs: ClassProbs;
  aiProbability: number; // 1 - P(human); total AI likelihood across vendors
};

type WorkerInbound =
  | { type: 'ready' }
  | { type: 'result'; id: string; category: DetectCategory; probs: ClassProbs; aiProbability: number }
  | { type: 'error'; id?: string; message: string };

let _worker: Worker | null = null;
let _workerReady: Promise<void> | null = null;
let _initResolve: (() => void) | null = null;
let _initReject: ((err: Error) => void) | null = null;
const _pending = new Map<string, { resolve: (r: DetectResult) => void; reject: (err: Error) => void }>();

function isMobile(): boolean {
  return typeof navigator !== 'undefined' && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
}

function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ac = new AbortController();
  const id = setTimeout(() => ac.abort(), ms);
  return fetch(url, { ...init, signal: ac.signal }).finally(() => clearTimeout(id));
}

function mergeChunks(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { out.set(c, offset); offset += c.length; }
  return out;
}

async function fetchInChunks(
  url: string,
  total: number,
  onProgress?: ProgressFn
): Promise<Uint8Array> {
  const numChunks = isMobile() ? MOBILE_CHUNKS : PARALLEL_CHUNKS;
  const chunkSize = Math.ceil(total / numChunks);
  let received = 0;

  const ranges = Array.from({ length: numChunks }, (_, i) => {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize - 1, total - 1);
    return { start, end };
  });

  const parts = await Promise.all(
    ranges.map(async ({ start, end }) => {
      const res = await fetchWithTimeout(
        url,
        { headers: { Range: `bytes=${start}-${end}` } },
        120_000
      );
      if (!res.ok && res.status !== 206) {
        throw new Error(`Range fetch failed: ${res.status}`);
      }
      const reader = res.body?.getReader();
      if (!reader) {
        const buf = await res.arrayBuffer();
        received += buf.byteLength;
        const pct = Math.round((received / total) * 100);
        onProgress?.(`${DOWNLOAD_MSG} ${pct}%`, pct);
        return new Uint8Array(buf);
      }
      const pieces: Uint8Array[] = [];
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        pieces.push(value);
        received += value.length;
        const pct = Math.round((received / total) * 100);
        onProgress?.(`${DOWNLOAD_MSG} ${pct}%`, pct);
      }
      return mergeChunks(pieces);
    })
  );

  return mergeChunks(parts);
}

async function fetchModelBytes(onProgress?: ProgressFn): Promise<Uint8Array> {
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

  let total = 0;
  let finalUrl = ONNX_URL;
  try {
    const probe = await fetchWithTimeout(
      ONNX_URL,
      { headers: { Range: 'bytes=0-0' } },
      PROBE_TIMEOUT_MS
    );
    if (probe.status === 206) {
      const cr = probe.headers.get('content-range') || '';
      const m = /\/(\d+)\s*$/.exec(cr);
      if (m) total = Number(m[1]);
      if (probe.url) finalUrl = probe.url;
    }
    await probe.body?.cancel();
  } catch { /* fall back to simple fetch */ }

  let bytes: Uint8Array;
  if (total > 0) {
    bytes = await fetchInChunks(finalUrl, total, onProgress);
  } else {
    const res = await fetch(ONNX_URL);
    if (!res.ok) throw new Error(`Model fetch failed: ${res.status}`);
    const contentLen = Number(res.headers.get('content-length')) || 0;
    const reader = res.body?.getReader();
    if (!reader) {
      const buf = await res.arrayBuffer();
      bytes = new Uint8Array(buf);
    } else {
      const chunks: Uint8Array[] = [];
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        if (contentLen) {
          const pct = Math.round((received / contentLen) * 100);
          onProgress?.(`${DOWNLOAD_MSG} ${pct}%`, pct);
        }
      }
      bytes = mergeChunks(chunks);
    }
  }

  if (cache) {
    await cache.put(
      ONNX_URL,
      new Response(bytes as BodyInit, {
        headers: {
          'content-type': 'application/octet-stream',
          'content-length': String(bytes.length),
        },
      })
    );
  }

  return bytes;
}

function getWorker(): Worker {
  if (_worker) return _worker;
  _worker = new Worker(
    new URL('../workers/inferenceWorker.ts', import.meta.url),
    { type: 'module' }
  );
  _worker.onmessage = (event: MessageEvent<WorkerInbound>) => {
    const msg = event.data;
    if (msg.type === 'ready') {
      _initResolve?.();
      _initResolve = null;
      _initReject = null;
      return;
    }
    if (msg.type === 'result') {
      const handler = _pending.get(msg.id);
      if (handler) {
        _pending.delete(msg.id);
        handler.resolve({
          category: msg.category,
          probs: msg.probs,
          aiProbability: msg.aiProbability,
        });
      }
      return;
    }
    if (msg.type === 'error') {
      const error = new Error(msg.message);
      if (msg.id) {
        const handler = _pending.get(msg.id);
        if (handler) {
          _pending.delete(msg.id);
          handler.reject(error);
          return;
        }
      }
      _initReject?.(error);
      _initResolve = null;
      _initReject = null;
    }
  };
  _worker.onerror = (event) => {
    const error = new Error(event.message || 'Inference worker crashed');
    _initReject?.(error);
    _initResolve = null;
    _initReject = null;
    for (const [id, handler] of _pending) {
      handler.reject(error);
      _pending.delete(id);
    }
  };
  return _worker;
}

export async function loadModel(onProgress?: ProgressFn): Promise<void> {
  if (_workerReady) return _workerReady;

  _workerReady = (async () => {
    const bytes = await fetchModelBytes(onProgress);
    onProgress?.('กำลังเตรียมโมเดล...');

    const worker = getWorker();
    const initPromise = new Promise<void>((resolve, reject) => {
      _initResolve = resolve;
      _initReject = reject;
    });

    // Transfer the buffer to the worker (zero-copy). After this call, `bytes`
    // is detached on the main thread — we discard the reference.
    worker.postMessage(
      { type: 'init', modelBytes: bytes.buffer },
      [bytes.buffer]
    );

    await initPromise;
    onProgress?.('พร้อมวิเคราะห์');
  })().catch((err) => {
    _workerReady = null;
    throw err;
  });

  return _workerReady;
}

export async function detectAI(text: string): Promise<DetectResult> {
  await loadModel();
  const worker = getWorker();
  const id = crypto.randomUUID();
  return new Promise<DetectResult>((resolve, reject) => {
    _pending.set(id, { resolve, reject });
    worker.postMessage({ type: 'detect', id, text });
  });
}

export async function clearModelCache(): Promise<void> {
  if ('caches' in self) await caches.delete(MODEL_CACHE);
}
