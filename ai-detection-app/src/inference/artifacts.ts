export type Asset = { url: string; bytes: number; sha256: string };
type Progress = (received: number, total: number) => void;
export type LoadOptions = {
  fetcher?: typeof fetch;
  storage?: CacheStorage | null;
  timeoutMs?: number;
  cacheTimeoutMs?: number;
  signal?: AbortSignal;
};
export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, '0')).join('');
}
export async function verifyBytes(bytes: Uint8Array, asset: Asset): Promise<void> {
  if (bytes.length !== asset.bytes || await sha256(bytes) !== asset.sha256) {
    throw new Error('Artifact integrity check failed: ' + asset.url);
  }
}
export async function bounded<T>(task: Promise<T>, ms: number, label: string, abort?: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([task, new Promise<never>((_, reject) => {
      timer = setTimeout(() => { abort?.(); reject(new Error(label + ' timed out')); }, ms);
    })]);
  } finally { clearTimeout(timer); }
}

// Cache storage is optional. Every hit and every download is verified.
export async function loadVerifiedAsset(asset: Asset, cacheName: string, progress?: Progress,
  options: LoadOptions = {}): Promise<Uint8Array<ArrayBuffer>> {
  const cacheMs = options.cacheTimeoutMs ?? 2000;
  let cache: Cache | undefined;
  const optional = async <T>(task: () => Promise<T>): Promise<T | undefined> => {
    try { return await bounded(task(), cacheMs, 'Cache operation'); } catch { return undefined; }
  };
  try {
    const storage = options.storage === undefined ? globalThis.caches : options.storage;
    if (storage) cache = await optional(() => storage.open(cacheName));
  } catch { /* restricted CacheStorage getter */ }
  if (cache) {
    const hit = await optional(() => cache!.match(asset.url));
    if (hit) {
      try {
        const bytes = new Uint8Array(await bounded(hit.arrayBuffer(), cacheMs, 'Cache read'));
        await verifyBytes(bytes, asset);
        if (options.signal?.aborted) throw new Error('Artifact loading cancelled');
        progress?.(bytes.length, bytes.length);
        return bytes;
      } catch (error) {
        if (options.signal?.aborted) throw error;
        await optional(() => cache!.delete(asset.url));
      }
    }
  }
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (options.signal?.aborted) throw new Error('Artifact loading cancelled');
    const ac = new AbortController();
    const cancelRequest = () => ac.abort();
    options.signal?.addEventListener('abort', cancelRequest, { once: true });
    try {
      const bytes = await bounded((async () => {
        const response = await (options.fetcher ?? fetch)(asset.url, { signal: ac.signal, cache: 'no-store' });
        if (!response.ok) throw new Error('Artifact download failed: HTTP ' + response.status);
        const output = new Uint8Array(asset.bytes);
        const reader = response.body?.getReader();
        if (!reader) {
          const body = new Uint8Array(await response.arrayBuffer());
          await verifyBytes(body, asset);
          progress?.(body.length, body.length);
          return body;
        }
        let received = 0;
        const cancel = () => { void reader.cancel().catch(() => undefined); };
        ac.signal.addEventListener('abort', cancel, { once: true });
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            if (received + value.length > output.length) throw new Error('Oversized artifact response');
            output.set(value, received); received += value.length;
            progress?.(received, asset.bytes);
          }
        } finally {
          ac.signal.removeEventListener('abort', cancel);
          await reader.cancel().catch(() => undefined); reader.releaseLock();
        }
        if (received !== asset.bytes) throw new Error('Incomplete artifact response');
        await verifyBytes(output, asset);
        return output;
      })(), options.timeoutMs ?? 300_000, 'Artifact download', () => ac.abort());
      if (cache) await optional(() => cache!.put(asset.url, new Response(bytes, {
        headers: { 'Content-Type': 'application/octet-stream' },
      })));
      return bytes;
    } catch (error) {
      ac.abort();
      if (options.signal?.aborted) throw error;
      lastError = error;
    } finally { options.signal?.removeEventListener('abort', cancelRequest); }
  }
  throw lastError;
}
