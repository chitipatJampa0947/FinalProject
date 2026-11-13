import test from 'node:test';
import assert from 'node:assert/strict';
import { InferenceClient, type WorkerPort } from '../src/inference/client.ts';
import { classify } from '../src/inference/contract.ts';
class FakeWorker {
  onmessage: Worker['onmessage'] = null;
  onerror: Worker['onerror'] = null;
  onmessageerror: Worker['onmessageerror'] = null;
  terminated = false;
  active = 0;
  maxActive = 0;
  mode: string;
  constructor(mode = 'ok') { this.mode = mode; }
  terminate() { this.terminated = true; }
  emit(data: unknown) {
    this.onmessage?.call(this as unknown as Worker, new MessageEvent('message', { data }));
  }
  postMessage(message: { type: string; id: string }) {
    if (message.type === 'init') queueMicrotask(() => {
      if (this.mode === 'hang-init') return;
      this.emit(this.mode === 'fail-init' ? { type: 'error', message: 'bad initialization' } :
        { type: 'ready', artifactId: 'test', runtimeVersion: 'test-runtime' });
    });
    else {
      this.active++; this.maxActive = Math.max(this.maxActive, this.active);
      if (this.mode === 'hang-detect') return;
      setTimeout(() => {
        this.active--;
        this.emit({ type: 'result', id: message.id,
          result: this.mode === 'malformed' ? { category: 'human' } : classify([1, 2, 0, -1], 'test') });
      }, 5);
    }
  }
}
function setup(modes: string[]) {
  const workers: FakeWorker[] = [];
  const client = new InferenceClient({
    artifactId: 'test', runtimeVersion: 'test-runtime', initTimeoutMs: 20, detectTimeoutMs: 30,
    prepare: async () => ({ model: new ArrayBuffer(1), tokenizer: new ArrayBuffer(1),
      tokenizerConfig: new ArrayBuffer(1), modelConfig: new ArrayBuffer(1) }),
    makeWorker: () => { const w = new FakeWorker(modes.shift()); workers.push(w); return w as unknown as WorkerPort; },
  });
  return { client, workers };
}
test('parallel calls share initialization and serialize session requests', async () => {
  const { client, workers } = setup(['ok']);
  await Promise.all([client.load(), client.load()]);
  const results = await Promise.all(['one', 'two', 'three'].map(t => client.detect(t)));
  assert.equal(workers.length, 1); assert.equal(workers[0].maxActive, 1);
  assert.ok(results.every(r => r.category === 'gpt'));
  client.dispose();
});
test('initialization failure terminates the worker and next load recovers', async () => {
  const { client, workers } = setup(['fail-init', 'ok']);
  await assert.rejects(client.load(), /bad initialization/);
  assert.equal(workers[0].terminated, true);
  assert.equal((await client.detect('retry')).category, 'gpt');
  assert.equal(workers.length, 2); client.dispose();
});
test('initialization timeout is bounded and recovery creates a fresh worker', async () => {
  const { client, workers } = setup(['hang-init', 'ok']);
  await assert.rejects(client.load(), /initialization timed out/);
  assert.equal(workers[0].terminated, true);
  await client.load(); assert.equal(workers.length, 2); client.dispose();
});
test('inference timeout terminates stalled work and ignores stale worker errors', async () => {
  const { client, workers } = setup(['hang-detect', 'ok']);
  await assert.rejects(client.detect('stalls'), /Inference timed out/);
  assert.equal(workers[0].terminated, true);
  await client.load();
  workers[0].onerror?.call(workers[0] as unknown as Worker, new Event('error') as ErrorEvent);
  assert.equal(workers[1].terminated, false);
  assert.equal((await client.detect('retry')).category, 'gpt'); client.dispose();
});
test('malformed inference response fails closed and terminates its worker', async () => {
  const { client, workers } = setup(['malformed']);
  await assert.rejects(client.detect('invalid'), /Invalid inference response/);
  assert.equal(workers[0].terminated, true);
});
test('disposing during preparation aborts downloads before a worker is allocated', async () => {
  let aborted = false, workers = 0;
  const client = new InferenceClient({ artifactId: 'test', runtimeVersion: 'test-runtime',
    prepare: (_progress, signal) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => { aborted = true; reject(new Error('download cancelled')); });
    }),
    makeWorker: () => { workers++; return new FakeWorker() as unknown as WorkerPort; },
  });
  const loading = client.load();
  client.dispose();
  await assert.rejects(loading, /cancelled/);
  assert.equal(aborted, true); assert.equal(workers, 0);
});
