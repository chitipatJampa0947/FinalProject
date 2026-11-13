# AI Detection App — developer guide

React/TypeScript frontend for the CS403 four-class WangchanBERTa detector. See the [project README](../README.md) for dataset construction, verified research results and academic limitations.

**Current production:** [final-project-eta-peach.vercel.app](https://final-project-eta-peach.vercel.app/) serves the accepted security-integrated W8A32 build (`dpl_4buo7fcyQsdPAKenZoGjpdvgZTrt`). Admin uses real Supabase Auth and database authorization; Feedback uses consent, real Turnstile and a validated Edge gateway. Backend mode remains opt-in for local builds; missing public configuration disables backend operations while inference stays available. The historical inference-only Preview is a different frozen build. Follow [security/README.md](security/README.md) for operations and remaining test limitations.

## Requirements and installation

- Node.js **24+** and npm; use the committed app `package-lock.json`.
- The approved ONNX artifact, obtained through an authorized transfer; it is not in Git.
- A desktop browser with the required WASM/SIMD, worker and Web Crypto support. Use localhost for development or HTTPS for hosting.

From the repository root:

```powershell
cd ai-detection-app
node --version
npm --version
npm ci
```

No Python environment is required for frontend inference. Full research reproduction and corpus-dependent tests require additional local artifacts. Installing `scripts/requirements.txt` does not install the full research environment.

## Model provisioning

The authoritative contract is [src/inference/model-manifest.json](src/inference/model-manifest.json). Required artifact:

```text
wo_pc_foldable.onnx
bytes: 106299948
SHA256: 4baa5cb331f6cad7d90492d33c3e9a5bf53a45029ca5a563aaa86f7a46bc84a2
```

Set a real authorized local path; the example below is a placeholder:

```powershell
$env:W8A32_MODEL_SOURCE = 'C:\approved-artifacts\wo_pc_foldable.onnx'
npm run prepare:model
npm run dev
```

An explicit positional source is also supported:

```powershell
node scripts/prepare-model.mjs 'C:\approved-artifacts\wo_pc_foldable.onnx'
```

Preparation verifies the model, tracked tokenizer/configuration assets and matched installed runtime, then creates missing versioned public files. Existing destinations are verified and not overwritten. Its default model source is `../experiment/archive-20261108-readiness-7c21/historical/quantization/models/wo_pc_foldable.onnx`. If that private archive is absent, use the explicit source or retain a verified pre-provisioned generated model. An explicitly configured source that is missing fails rather than silently substituting another model.

Output: `public/artifacts/thai-en-w8a32-4baa5cb331f6-v1/`. Generated files have a local ignore rule. Do not force-add them. Tokenizer/configuration masters and runtime hashes are tracked in [model-assets/](model-assets/README.md).

## Actual npm scripts

Run these from `ai-detection-app/`:

| Command | What it actually does |
|---|---|
| `npm run dev` | `node scripts/prepare-model.mjs && vite` |
| `npm run prepare:model` | Asset verification/provisioning only |
| `npm test` | Node type-stripping test runner over `tests/*.test.ts` |
| `npm run lint` | `eslint .`; no automatic fixes |
| `npm run build` | Asset preparation, `tsc -b`, then `vite build` |
| `npm run preview` | Serve the existing Vite production build locally |

Vite prints its local server address. Preview does not build or deploy. Build writes `dist/`, including the selected model/runtime assets. Avoid unreviewed environment files when building; `VITE_*` values are compiled into browser JavaScript.

## Frontend architecture

| File / directory | Responsibility |
|---|---|
| `src/App.tsx` | UI state, input/consent, result display and secure feedback/admin routes |
| `src/hooks/useAIInference.ts` | Lazy service import, loading/analysis state, retry and stale-result suppression |
| `src/services/inferenceService.ts` | Manifest-driven asset loading, progress and worker/client construction |
| `src/inference/artifacts.ts` | SHA256 checks, bounded downloads and optional verified cache |
| `src/inference/client.ts` | Worker lifecycle, initialization sharing, serialized requests, response validation and timeouts |
| `src/workers/inferenceWorker.ts` | Asset/schema checks, tokenizer initialization, ONNX session and inference |
| `src/inference/tokenizer.ts` | Saved normalization mapping and exact 400-token encoding |
| `src/inference/contract.ts` | Tensor-schema validation, label order, stable softmax and argmax |
| `src/inference/feedback.ts` | Snapshot-consistent feedback prediction payload |
| `src/lib/supabaseClient.ts` | Validated public configuration and memory-only Auth client; independent of model computation |
| `src/components/admin/AdminGateway.tsx` | Password Auth and database-authorized admin gate |
| `src/components/common/FeedbackChallenge.tsx` | Real Turnstile widget lifecycle |
| `src/security/` | Server authorization checks and independent feedback transport |
| `../supabase/functions/submit-feedback/` | Server-only CAPTCHA verification and validated ingestion |
| `src/components/` | Text entry, verdict/probabilities, loading/modal/toast and admin UI |

The model runs entirely in the dedicated worker. Model/tokenizer/config buffers are verified and transferred from the main thread; the worker verifies them again. No Hugging Face tokenizer download or legacy R2 model request selects the current artifact.

## Runtime, tokenizer and model contracts

- `onnxruntime-web`: **1.26.0-dev.20260416-b7804b056c**. WASM execution provider, one thread, `proxy=false`.
- `@huggingface/tokenizers`: **0.1.3**. Public normalizer extension points execute the saved SentencePiece mapping; there is no permanent private `_tokenizer` dependency.
- Unigram/Metaspace with the pinned `Sequence(Precompiled, Strip, Replace)` normalizer. Do not substitute generic NFKC normalization.
- Maximum **400 total tokens**: BOS 5, up to 398 content tokens, EOS 6, right padding with PAD 1 and attention masks 1/0.
- `input_ids` and `attention_mask`: INT64 `[1,400]`; output `logits`: FP32 `[1,4]`.
- UI text length: 200–10,000 characters. Character limits do not extend the model's visible token window.
- W8A32 stores selected weights as INT8 and reconstructs FP32 weights; activations/computation remain FP32. File-size reduction does not imply matching memory/speed savings.

| Logit index | Output key | Display label |
|---:|---|---|
| 0 | `human` | Human |
| 1 | `gpt` | GPT |
| 2 | `gemini` | Gemini |
| 3 | `other` | Other |

The verdict is argmax of four logits. `aiProbability = 1 − probs.human`; it is not the winning class probability. Other covers the included DeepSeek/Qwen generators, not all unknown models. Probabilities are not calibrated evidence of authorship.

## Download, caching and recovery

The manifest pins artifact sizes, SHA256 hashes, tokenizer/model pairing, labels and runtime identity. Runtime `.mjs`/`.wasm` bytes are pinned/checked during preparation; their browser loading trusts the matched same-origin HTTPS host rather than an additional browser SHA256/SRI gate.

Every model/tokenizer/config cache hit and download is checked. Invalid cache entries are evicted; downloads allow at most two attempts. Cache API denial, quota failure and cache-operation timeout do not prevent inference. Default limits are 2 seconds per optional cache operation, 300 seconds per asset-download attempt, 620 seconds for overall preparation, 90 seconds for worker initialization and 120 seconds for inference.

Initialization errors terminate/reset the worker. A later Analyze can create a fresh session. The client serializes requests with a queue limit of 16, validates response probabilities/artifact identity and rejects stale/invalid responses. The hook prevents overlapping UI analyses. These safeguards have regression coverage; they do not promise every browser/error condition is handled.

## Environment variables and backend boundary

Inference needs no provider or Supabase key. Leave VITE_BACKEND_MODE unset to keep backend operations disabled. Secure backend configuration is opt-in; there is no placeholder public client or browser-passcode authorization.

For a separately configured local build, supply only public values; production already uses the reviewed secure-v1 configuration:

```dotenv
VITE_BACKEND_MODE=secure-v1
VITE_SUPABASE_URL=https://tslxclshozddleaojxwb.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_PUBLISHABLE_KEY
VITE_TURNSTILE_SITE_KEY=YOUR_REAL_PUBLIC_SITE_KEY
```

VITE_ADMIN_PASSCODE and VITE_SUPABASE_ANON_KEY are not read by the secure client. Never put service-role keys, database passwords, Turnstile secrets or research-provider credentials in VITE variables. The legacy VITE_R2_MODEL_URL remains unused by inference. Set W8A32_MODEL_SOURCE in the Node build shell when provisioning a model.

Feedback requires consent, a real host/action-bound CAPTCHA and the validated submit-feedback Edge Function. The browser cannot INSERT directly into user_reports. Admin signs in through Supabase Auth; server-side allowlist/session checks restrict SELECT, DELETE and UPDATE(status). Tokens stay in tab memory. Global database caps, rather than localStorage, enforce ingestion limits. Backend failure must not change inference results. See the administrator guide for setup, active RLS/allowlist/session enforcement, the 10/minute and 100/hour global limits, operational retention and targeted expiry-test limitations.

## Tests and reproducibility requirements

```powershell
npm test
npm run lint
npm run build
```

`tests/client.test.ts` and `tests/reliability.test.ts` exercise local client/cache/contract behavior. `tests/security.test.ts` checks administrator authorization, public-config screening, strict feedback/gateway validation, time/body/error/rate-limit handling and inference independence; these are local tests, not live database mutations. `tests/tokenizer-parity.test.ts` additionally reads:

- `../data/val.csv` relative to this app directory.
- `../experiment/archive-20261108-readiness-7c21/historical/quantization/inputs/validation400.jsonl`.
- `../experiment/archive-20261108-readiness-7c21/readiness/fixtures/synthetic-edge-cases.json`.

The full suite checks 3,844 validation inputs and 15 recorded edge cases. Those private fixtures are not tracked in Git; a bare clone is not enough for all tests. No final-test classifier evaluation is part of this npm suite. The final academic metrics come from saved research artifacts described in the root README.

## Static hosting and deployment

`vite.config.ts` packages only the selected versioned asset set plus UI assets, preserving the legacy public model locally. Runtime, worker and model paths assume origin-root hosting. Use HTTPS, correct JavaScript/JSON/WASM MIME types, reviewed CSP and cache headers. Protected Preview/staged URLs must protect HTML, model and runtime files consistently; canonical production is intentionally public. Backend authorization remains enforced independently by Auth/RLS and CAPTCHA. Do not assume root `vercel.json` supplies all these settings.

Production uses the reviewed 23-file compressed wrapper to reconstruct 18 verified static assets; its source and output inventories remain local reproducibility evidence. The approved production deployment was staged with --prod --skip-domain, passed asset/browser/Admin/Feedback checks, and was later promoted by the owner. A normal build does not necessarily reproduce the older 16-file inference-only build or production's exact environment/headers automatically.

The synchronized deploy source at defeed3e8b2c59732a3c6ca8d9fb1edceee7794b disables automatic Git deployments at the repository and app roots, with an additional exit-0 Git ignored-build safeguard. Manual release preparation verifies the approved local model/public configuration and all 18 outputs before generating a root-compatible frozen wrapper. The project-level ignore rule below remains unchanged; it is not the effective deployment policy for the guarded deploy commit. See the [pinned manual release guide](https://github.com/chitipatJampa0947/FinalProject/blob/defeed3e8b2c59732a3c6ca8d9fb1edceee7794b/ai-detection-app/release/README.md).

The Vercel Root Directory is ai-detection-app and Production Branch is deploy. The current ignore rule builds production only; non-production Git pushes can still create ignored/canceled deployment records. Do not push deploy, change project settings or promote a deployment without release authorization. The independent deploy branch must not be merged with main automatically. Previous production dpl_GnJvRAogUL4XoUjewLy7A4GNZBWU remains retained; its legacy anonymous backend will still be denied by the hardened database.

Canonical feedback requires that exact HTTPS origin in FEEDBACK_ALLOWED_ORIGINS and the hostname in the existing Turnstile widget. The deployment's strict CSP permits only the reviewed Supabase and Cloudflare origins alongside required self/WASM/worker resources. The noindex policy is retained. Follow the security guide for per-host configuration, regression/acceptance evidence, session revocation and rollback.

## Known limitations

Desktop browser tests do not cover Safari/mobile, offline starts, browser restart persistence or low-memory hardware. First load includes a 106.30 MB model plus tokenizer/runtime downloads, and FP32 reconstruction can use substantial memory. The runtime pin is a development build. Dataset scope, false-AI risk and exploratory code-switching limitations remain as documented in the project README.

The footer still says "indisputable forensic analysis"; this is unsupported marketing, not a scientific guarantee. The former local-encryption/compliance claims and passcode/direct-table feedback design were replaced in the verified security integration. Do not publish raw feedback, environments, authentication profiles, weights or datasets by blanket staging.
