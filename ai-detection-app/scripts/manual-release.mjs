// Local preparation only: no credentials, network downloads, deployment or promotion.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { brotliDecompressSync } from 'node:zlib';

const app = path.resolve(import.meta.dirname, '..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const lock = read(path.join(app, 'release/production-assets.json'));
const publicHashes = read(path.join(app, 'release/public-config-hashes.json'));
const releaseFile = path.join(app, 'release/upload-release.json');
const release = read(releaseFile);
const options = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i];
  assert(['--model', '--public-config', '--payload-source', '--name'].includes(key), 'Unknown argument');
  assert(!options.has(key) && process.argv[i + 1], 'Missing/duplicate argument');
  options.set(key, process.argv[i + 1]);
}
assert.equal(options.size, 4, 'Required: --model --public-config --payload-source --name');
assert.equal(process.version, 'v24.22.1', 'Use the reviewed Node 24.22.1 runtime');
const name = options.get('--name');
assert(/^[a-z0-9][a-z0-9-]{0,63}$/.test(name), 'Unsafe release name');
const output = path.join(app, '.release', name);
assert(!fs.existsSync(output), 'Existing releases are never overwritten');
const model = path.resolve(options.get('--model'));
const modelEntry = lock.find(item => item.path.endsWith('/model.onnx'));
assert.equal(fs.statSync(model).size, modelEntry.bytes, 'Model length mismatch');
assert.equal(hash(fs.readFileSync(model)), modelEntry.sha256, 'Model SHA256 mismatch');
const supplied = {};
for (const line of fs.readFileSync(options.get('--public-config'), 'utf8').split(/\r?\n/)) {
  if (!line.trim() || line.startsWith('#')) continue;
  const match = /^([A-Z_]+)=(.*)$/.exec(line);
  assert(match && Object.hasOwn(publicHashes, match[1]), 'Only approved public Vite keys are accepted');
  assert(!Object.hasOwn(supplied, match[1]), 'Duplicate public key');
  supplied[match[1]] = match[2];
}
assert.deepEqual(Object.keys(supplied).sort(), Object.keys(publicHashes).sort(), 'Incomplete public configuration');
for (const [key, expected] of Object.entries(publicHashes)) {
  assert.equal(hash(Buffer.from(supplied[key])), expected, 'Public configuration hash mismatch: ' + key);
}
assert.equal(supplied.VITE_BACKEND_MODE, 'secure-v1');
assert.equal(supplied.VITE_SUPABASE_URL, 'https://tslxclshozddleaojxwb.supabase.co');
assert(supplied.VITE_SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_'));
assert(supplied.VITE_TURNSTILE_SITE_KEY.startsWith('0x4'));
// Vite loads dotenv independently. Refuse hidden configuration instead of letting it override review.
assert(!fs.readdirSync(app).some(file => file === '.env' || file.startsWith('.env.')), 'Remove dotenv inputs from this isolated release worktree');
assert.deepEqual(release.files, lock, 'Upload inventory differs from production asset lock');
const config = read(path.join(app, 'vercel.json'));
assert.equal(config.git.deploymentEnabled, false, 'Git deployment guard is required');
assert.equal(read(path.join(app, '../vercel.json')).git.deploymentEnabled, false, 'Repository guard is required');
const payloadRoot = path.resolve(options.get('--payload-source'));
// Validate every existing approved compressed blob before using it. No mutable download URL.
for (const blob of release.blobs) {
  assert.equal(blob.file, 'payload/' + blob.sha256 + '.br');
  const bytes = fs.readFileSync(path.join(payloadRoot, blob.file));
  assert.equal(bytes.length, blob.compressedBytes);
  assert.equal(hash(bytes), blob.compressedSha256, 'Compressed source SHA256 mismatch');
  const decoded = brotliDecompressSync(bytes, { maxOutputLength: blob.bytes });
  assert.equal(decoded.length, blob.bytes);
  assert.equal(hash(decoded), blob.sha256, 'Decoded source SHA256 mismatch');
}
fs.mkdirSync(output, { recursive: true });
const env = { ...process.env };
for (const key of Object.keys(env)) if (key.startsWith('VITE_') || key === 'W8A32_MODEL_SOURCE') delete env[key];
Object.assign(env, supplied, { W8A32_MODEL_SOURCE: model });
const run = (args, cwd = app) => {
  const result = spawnSync(process.execPath, args, { cwd, env, stdio: 'inherit', windowsHide: true });
  assert.equal(result.status, 0, 'Local release step failed');
};
const build = path.join(output, 'build');
const npm = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
run([npm, 'run', 'build', '--', '--outDir', build]);
function inventory(dir, prefix = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    assert(!entry.isSymbolicLink(), 'Release inputs must not be symlinks');
    const relative = prefix + entry.name;
    if (entry.isDirectory()) return inventory(path.join(dir, entry.name), relative + '/');
    const bytes = fs.readFileSync(path.join(dir, entry.name));
    return [{ path: relative, bytes: bytes.length, sha256: hash(bytes) }];
  }).sort((a, b) => a.path.localeCompare(b.path));
}
const ordered = files => [...files].sort((a, b) => a.path.localeCompare(b.path));
assert.deepEqual(inventory(build), ordered(lock), 'Build does not reproduce all 18 accepted assets');
const parent = path.join(output, 'upload-parent');
const wrapper = path.join(parent, 'ai-detection-app');
fs.mkdirSync(path.join(wrapper, 'payload'), { recursive: true });
for (const blob of release.blobs) fs.copyFileSync(path.join(payloadRoot, blob.file), path.join(wrapper, blob.file), fs.constants.COPYFILE_EXCL);
fs.copyFileSync(releaseFile, path.join(wrapper, 'release.json'), fs.constants.COPYFILE_EXCL);
fs.copyFileSync(path.join(app, 'release/unpack-staging.mjs'), path.join(wrapper, 'unpack-staging.mjs'), fs.constants.COPYFILE_EXCL);
const write = (file, value) => fs.writeFileSync(file, value, { flag: 'wx' });
const wrapperConfig = { framework: null, installCommand: '', buildCommand: 'node unpack-staging.mjs', outputDirectory: 'dist', headers: config.headers, git: { deploymentEnabled: false } };
write(path.join(wrapper, 'vercel.json'), JSON.stringify(wrapperConfig, null, 2) + '\n');
write(path.join(wrapper, 'package.json'), JSON.stringify({ name: 'cs403-manual-static-release', private: true, type: 'module', engines: { node: '24.x' } }, null, 2) + '\n');
const allowed = ['package.json', 'vercel.json', 'release.json', 'unpack-staging.mjs', '.vercelignore', ...release.blobs.map(blob => blob.file)];
write(path.join(wrapper, '.vercelignore'), '*\n!payload\n' + allowed.map(file => '!' + file).join('\n') + '\n');
write(path.join(parent, '.vercelignore'), '*\n!.vercelignore\n!ai-detection-app\n!ai-detection-app/payload\n' + allowed.map(file => '!ai-detection-app/' + file).join('\n') + '\n');
run([path.join(wrapper, 'unpack-staging.mjs'), path.join(output, 'reconstructed')]);
assert.deepEqual(inventory(path.join(output, 'reconstructed')), ordered(lock));
const files = inventory(parent);
const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
assert(totalBytes < 100000000, 'Hobby source upload budget exceeded');
write(path.join(output, 'verification.json'), JSON.stringify({ node: process.version, productionAssetCount: lock.length, all18Match: true, files, uploadBytes: totalBytes, publicConfigHashes: publicHashes, modelSha256: modelEntry.sha256, deployed: false }, null, 2) + '\n');
console.log('Prepared only; 18 exact production assets; upload bytes: ' + totalBytes);
