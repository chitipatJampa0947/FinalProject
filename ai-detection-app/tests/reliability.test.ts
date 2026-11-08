import test from 'node:test';
import assert from 'node:assert/strict';
import { loadVerifiedAsset, sha256 } from '../src/inference/artifacts.ts';
import { classify, verifySessionSchema } from '../src/inference/contract.ts';
import { MODEL_MANIFEST, validateManifest } from '../src/inference/manifest.ts';
import { createFeedbackPayload } from '../src/inference/feedback.ts';
const bytes = new Uint8Array([1, 2, 3]);
const asset = { url: '/model.onnx', bytes: 3, sha256: await sha256(bytes) };
const fetcher = async () => new Response(bytes);
const fakeStorage = (cache: object) => ({ open: async () => cache }) as unknown as CacheStorage;
test('denied and hanging Cache API do not block verified inference assets', async () => {
  for (const open of [async () => { throw new Error('denied'); }, () => new Promise<Cache>(() => {})]) {
    const storage = { open } as unknown as CacheStorage;
    assert.deepEqual(await loadVerifiedAsset(asset, 'test', undefined,
      { storage, fetcher, cacheTimeoutMs: 10 }), bytes);
  }
});
test('same-length corrupted cache entry is evicted and downloaded once', async () => {
  let deleted = 0, fetched = 0, written = 0;
  const storage = fakeStorage({ match: async () => new Response(new Uint8Array([3, 2, 1])),
    delete: async () => { deleted++; return true; }, put: async () => { written++; } });
  const result = await loadVerifiedAsset(asset, 'test', undefined, { storage,
    fetcher: async () => { fetched++; return new Response(bytes); } });
  assert.deepEqual(result, bytes); assert.equal(deleted, 1); assert.equal(fetched, 1); assert.equal(written, 1);
});
test('valid cache does not use the network; quota write failure is optional', async () => {
  const storage = fakeStorage({ match: async () => new Response(bytes) });
  assert.deepEqual(await loadVerifiedAsset(asset, 'test', undefined, { storage,
    fetcher: async () => { throw new Error('offline'); } }), bytes);
  assert.deepEqual(await loadVerifiedAsset(asset, 'test', undefined, { fetcher,
    storage: fakeStorage({ match: async () => undefined, put: async () => { throw new Error('quota'); } }) }), bytes);
});
test('unverified network data is retried only once and never cached', async () => {
  let attempts = 0, writes = 0;
  await assert.rejects(loadVerifiedAsset(asset, 'test', undefined, {
    fetcher: async () => { attempts++; return new Response(new Uint8Array([3, 2, 1])); },
    storage: fakeStorage({ match: async () => undefined, put: async () => { writes++; } }),
  }), /integrity/);
  assert.equal(attempts, 2); assert.equal(writes, 0);
});
test('stalled response bodies time out and are cancelled', async () => {
  let cancelled = 0;
  await assert.rejects(loadVerifiedAsset(asset, 'test', undefined, { storage: null, timeoutMs: 15,
    fetcher: async () => new Response(new ReadableStream({ cancel() { cancelled++; } })),
  }), /timed out/);
  assert.equal(cancelled, 2);
});
test('incompatible model/tokenizer/labels/types are rejected', () => {
  for (const change of [{ maxLength: 416 }, { labels: ['GPT', 'Human', 'Gemini', 'Other'] },
    { inputType: 'int32' }, { model: { ...MODEL_MANIFEST.model, tokenizerSha256: '0'.repeat(64) } }]) {
    assert.throws(() => validateManifest({ ...MODEL_MANIFEST, ...change }), /Incompatible/);
  }
  const inputs = ['input_ids', 'attention_mask'].map(name => ({ name, isTensor: true, type: 'int64', shape: ['batch', 'seq'] }));
  const outputs = [{ name: 'logits', isTensor: true, type: 'float32', shape: ['batch', 4] }];
  verifySessionSchema(inputs, outputs);
  assert.throws(() => verifySessionSchema(inputs, [{ ...outputs[0], shape: [1, 2] }]), /schema/);
  assert.throws(() => verifySessionSchema([{ ...inputs[0], type: 'int32' }, inputs[1]], outputs), /input/);
});
test('UI verdict, total AI probability and feedback snapshot use the same prediction', () => {
  const result = { ...classify([0, 2, 1, -1], MODEL_MANIFEST.id), text: 'original analyzed text' };
  assert.equal(result.category, 'gpt');
  assert.ok(Math.abs(Object.values(result.probs).reduce((a, b) => a + b, 0) - 1) < 1e-10);
  assert.equal(result.aiProbability, 1 - result.probs.human);
  assert.deepEqual(createFeedbackPayload(result, 'Human'), { reported_text: result.text,
    ai_probability: (1 - result.probs.human) * 100, user_expected_label: 'Human', status: 'pending' });
  assert.throws(() => createFeedbackPayload({ ...result, aiProbability: 1 }, 'AI'), /inconsistent/);
  assert.throws(() => classify([NaN, 1, 2, 3], 'test'), /finite/);
  assert.throws(() => classify([1, 2], 'test'), /four/);
});
