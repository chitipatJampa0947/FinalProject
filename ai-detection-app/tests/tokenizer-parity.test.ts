import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { createTokenizer } from '../src/inference/tokenizer.ts';
const read = (p: string) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const tokenizer = createTokenizer(JSON.parse(read('../model-assets/tokenizer.json')),
  JSON.parse(read('../model-assets/tokenizer_config.json')));
const archive = '../../experiment/archive-20261108-readiness-7c21/';
function csv(text: string) {
  const rows: string[][] = []; let row: string[] = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += c; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  return rows;
}
test('all 3,844 validation examples match frozen Python IDs, masks and input hashes', () => {
  const text = read('../../data/val.csv');
  assert.equal(sha(text), '78c834a1479de83d8d18636c4df37775578379dc350fbfdf85084c25198b8989');
  const frozen = read(archive + 'historical/quantization/inputs/validation400.jsonl');
  assert.equal(sha(frozen), '28de905a061d7f7a7b112b6f12d65b6e26d12e10ce6c9770622b175b5bbafdbb');
  const records = frozen.trimEnd().split('\n').map(x => JSON.parse(x));
  const rows = csv(text.replace(/^\uFEFF/, '')), header = rows.shift()!;
  const column = header.indexOf('text'); assert.ok(column >= 0);
  assert.equal(records.length, 3844); assert.equal(rows.length, records.length);
  records.forEach((r, i) => {
    const result = tokenizer(rows[i][column]);
    assert.deepEqual(result.input_ids, r.input_ids, 'token IDs at validation row ' + i);
    assert.deepEqual(result.attention_mask, r.attention_mask, 'mask at validation row ' + i);
    assert.equal(sha(JSON.stringify([result.input_ids, result.attention_mask])), r.inputHash);
    assert.equal(result.input_ids[0], 5);
    assert.equal(result.input_ids[result.attention_mask.reduce((a, b) => a + b, 0) - 1], 6);
  });
});
test('all 15 recorded Python edge cases match', () => {
  const cases = JSON.parse(read(archive + 'readiness/fixtures/synthetic-edge-cases.json'));
  assert.equal(cases.length, 15);
  for (const r of cases) assert.deepEqual(tokenizer(r.text),
    { input_ids: r.input_ids, attention_mask: r.attention_mask }, 'edge case ' + r.index);
});
test('unsupported tokenizer configurations fail closed', () => {
  assert.throws(() => createTokenizer({}, {}), /Unsupported/);
});
