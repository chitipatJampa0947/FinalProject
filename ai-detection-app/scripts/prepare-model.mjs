import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import manifest from '../src/inference/model-manifest.json' with { type: 'json' };
import runtime from '../model-assets/runtime-hashes.json' with { type: 'json' };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const archive = path.resolve(root, '../experiment/archive-20261108-readiness-7c21');
const selected = process.argv[2] ?? process.env.W8A32_MODEL_SOURCE ??
  path.join(archive, 'historical/quantization/models/wo_pc_foldable.onnx');
async function hash(file) {
  const h = createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) h.update(chunk);
  return h.digest('hex');
}
async function check(file, asset) {
  if (fs.statSync(file).size !== asset.bytes || await hash(file) !== asset.sha256) {
    throw new Error('Asset does not match pinned manifest: ' + file);
  }
}
const ort = JSON.parse(fs.readFileSync(path.join(root, 'node_modules/onnxruntime-web/package.json')));
if (ort.version !== manifest.runtime.version) throw new Error('Installed ORT differs from manifest');
const generated = path.join(root, 'public/artifacts');
fs.mkdirSync(generated, { recursive: true });
const ignore = path.join(generated, '.gitignore');
if (!fs.existsSync(ignore)) fs.writeFileSync(ignore, '*\n', { flag: 'wx' });
const assets = [
  [selected, manifest.model],
  [path.join(root, 'model-assets/tokenizer.json'), manifest.tokenizer],
  [path.join(root, 'model-assets/tokenizer_config.json'), manifest.tokenizerConfig],
  [path.join(root, 'model-assets/config.json'), manifest.modelConfig],
  ...runtime.map(a => [path.join(root, 'node_modules/onnxruntime-web/dist', a.name), a]),
];
for (const [source, asset] of assets) {
  const dest = path.join(root, 'public', asset.url);
  // A staging builder may receive the verified model in its generated location.
  // All smaller source/runtime assets remain mandatory and checked.
  if (fs.existsSync(source)) await check(source, asset);
  else if (asset !== manifest.model || !fs.existsSync(dest) || process.argv[2] || process.env.W8A32_MODEL_SOURCE) {
    throw new Error('Provision the approved W8A32 model before building: ' + source);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (!fs.existsSync(dest)) fs.copyFileSync(source, dest, fs.constants.COPYFILE_EXCL);
  await check(dest, asset); // Existing files are checked, never overwritten.
}
const dest = path.join(generated, manifest.id, 'manifest.json');
if (!fs.existsSync(dest)) fs.writeFileSync(dest, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
if (JSON.stringify(JSON.parse(fs.readFileSync(dest))) !== JSON.stringify(manifest)) throw new Error('Stale generated manifest');
console.log('Verified local W8A32 model, tokenizer and runtime assets: ' + manifest.id);
