# Pinned local inference assets

The authoritative manifest is src/inference/model-manifest.json. Tokenizer and
configuration bytes here are unchanged copies of the verified evaluation assets.

Run npm run prepare:model (also run by dev/build). It verifies and copies the
selected model from the permanent experiment archive into a new versioned public
directory. No original model is overwritten. Alternatively pass an approved model
path to node scripts/prepare-model.mjs; its hash must still match the manifest.
Generated public/artifacts files are Git-ignored; provision them before packaging
on a different machine. W8A32_MODEL_SOURCE may point a staging builder at an
approved model file. A pre-provisioned generated model is accepted only after
hash/size verification. Node 24+ and npm are the standard development prerequisites.
The existing production R2 object is never used.

The tokenizer uses @huggingface/tokenizers 0.1.3's exported Tokenizer,
SequenceNormalizer and PrecompiledNormalizer classes and public normalizer fields.
Our subclass executes the saved SentencePiece UTF-8 map instead of that package's
NFKC approximation. It does not access Transformers.js's private _tokenizer.
Special-token splitting remains inside the public Tokenizer.encode API.

Compatibility is deliberately limited to this hashed CamemBERT tokenizer and its
Sequence(Precompiled, Strip, Replace) configuration. Unsupported normalizers,
token IDs or manifests are rejected. Keep the exact dependency pin and full
3,844-validation/15-edge-case parity suite when reviewing any library upgrade.
The regression suite verifies corpus compatibility, not all possible Unicode.
