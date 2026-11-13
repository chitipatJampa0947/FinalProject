// Reconstruct approved static bytes only. No network, environment expansion or model conversion.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createBrotliDecompress } from 'node:zlib';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
const root=path.dirname(fileURLToPath(import.meta.url));
const expectedRelease='4a3e5c525c157c395231c55dd24a607f140994d7eeb01cb10d15e6e490f8ef77';
const bytes=fs.readFileSync(path.join(root,'release.json'));
const hash=b=>createHash('sha256').update(b).digest('hex');
if(hash(bytes)!==expectedRelease)throw Error('Release manifest integrity mismatch');
const release=JSON.parse(bytes);
if(release.schemaVersion!==1||release.modelSha256!=='4baa5cb331f6cad7d90492d33c3e9a5bf53a45029ca5a563aaa86f7a46bc84a2'||release.files.length!==18)throw Error('Unsupported release');
const out=path.resolve(process.argv[2]??path.join(root,'dist'));
if(fs.existsSync(out))throw Error('Use a new output directory; existing evidence is never overwritten');
fs.mkdirSync(out);
async function digest(file){const h=createHash('sha256');for await(const b of fs.createReadStream(file))h.update(b);return h.digest('hex');}
for(const item of release.files){
 if(path.posix.isAbsolute(item.path)||item.path.includes('\\')||item.path.split('/').some(p=>p==='..'||p===''))throw Error('Unsafe output path');
 const dest=path.resolve(out,item.path);if(!dest.startsWith(out+path.sep))throw Error('Output escapes destination');
 fs.mkdirSync(path.dirname(dest),{recursive:true});
 const existing=release.files.find(other=>other.path!==item.path&&other.sha256===item.sha256&&fs.existsSync(path.join(out,other.path)));
 if(existing)fs.copyFileSync(path.join(out,existing.path),dest,fs.constants.COPYFILE_EXCL);
 else{
  const blob=release.blobs.find(b=>b.sha256===item.sha256);
  if(!blob||blob.file!=='payload/'+item.sha256+'.br'||blob.bytes!==item.bytes)throw Error('Blob manifest mismatch');
  const input=path.join(root,blob.file);
  if(fs.statSync(input).size!==blob.compressedBytes||await digest(input)!==blob.compressedSha256)throw Error('Compressed blob integrity mismatch');
  let count=0;const h=createHash('sha256');
  const verifier=new Transform({transform(chunk,_encoding,callback){count+=chunk.length;if(count>item.bytes)return callback(Error('Oversized output'));h.update(chunk);callback(null,chunk);}});
  await pipeline(fs.createReadStream(input),createBrotliDecompress(),verifier,fs.createWriteStream(dest,{flags:'wx'}));
  if(count!==item.bytes||h.digest('hex')!==item.sha256)throw Error('Output integrity mismatch');
 }
 if(fs.statSync(dest).size!==item.bytes||await digest(dest)!==item.sha256)throw Error('Release output mismatch');
}
console.log('Verified reconstruction: 18 secure candidate files, '+release.files.reduce((n,f)=>n+f.bytes,0)+' bytes');
