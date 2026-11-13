# AI-Generated Text Detection and Classification System for Thai-English Code-switching

A CS403 final-year Computer Science project at Thammasat University. The system fine-tunes WangchanBERTa to classify Thai text as **Human, GPT, Gemini or Other**, and runs the selected ONNX classifier in a browser Web Worker.

The finalized **W8A32** model achieved **87.3705% test Macro F1** and **97.3624% Human Precision** on the project's original 3,844-example test split. The corpus is **Thai-dominant news**. Supplementary Thai/Latin script-mixing analysis is exploratory; the project does **not** establish a fully annotated linguistic Thai-English code-switching benchmark.

**Current production:** [final-project-eta-peach.vercel.app](https://final-project-eta-peach.vercel.app/) runs the security-integrated W8A32 application, deployment `dpl_4buo7fcyQsdPAKenZoGjpdvgZTrt`. Supabase Auth, database administrator authorization/RLS, Turnstile and validated feedback ingestion are enabled. The earlier inference-only Preview is preserved historical evidence, not the current production feature set. See the [application guide](ai-detection-app/README.md) and [administrator guide](ai-detection-app/security/README.md).

## 1. Academic context and objectives

CS403 extends the earlier CS303/SP1 prototype to four-class source attribution, a balanced news corpus, group-based splitting and browser-side inference. The stated accuracy objectives are test Macro F1 ≥85% and Human Precision ≥95%. Engineering objectives include reproducible tokenization, verified model assets, responsive worker-based inference, optional caching and recovery from initialization/download failures.

These are results for a fixed model and evaluated data distribution, not proof of authorship or a general-purpose forensic detector.

## 2. Features and prediction outputs

- Four-class verdict, four softmax probabilities and combined AI score `1 − P(Human)`.
- Thai-focused text entry, loading progress, error messages, retry and light/dark themes.
- Dedicated worker, SHA256-pinned model/tokenizer assets, optional Cache API persistence and serialized inference requests.
- Production feedback uses explicit consent, Turnstile and a server-only validated gateway. Admin uses Supabase Auth plus a database-protected allowlist/session check. Inference works independently; the frozen inference-only Preview keeps both features disabled.

| ID | Label | Meaning in this dataset |
|---:|---|---|
| 0 | Human | Text collected from the designated human news sources |
| 1 | GPT | `gpt-4o-mini` generations |
| 2 | Gemini | `gemini-2.5-flash-lite` generations |
| 3 | Other | Included DeepSeek/Qwen generations: `deepseek/deepseek-chat` and `qwen/qwen-2.5-7b-instruct` |

**Other is a trained class, not an unknown-model detector.** Softmax scores are not calibrated confidence guarantees. Never use a verdict alone to accuse a writer of misconduct.

## 3. Technology stack

| Component | Implementation |
|---|---|
| Frontend | React 19, TypeScript 6, Vite 8, Tailwind CSS 4 |
| Browser inference | `onnxruntime-web` **1.26.0-dev.20260416-b7804b056c**, WASM, one thread |
| Browser tokenizer | `@huggingface/tokenizers` **0.1.3**, saved-map normalizer adapter |
| Research | Python, PyTorch, Transformers, scikit-learn, ONNX/ONNX Runtime |
| Production backend | Supabase Auth, administrator allowlist/RLS, validated Edge ingestion and Turnstile; live RLS/Auth, real CAPTCHA feedback, administrator moderation and native concurrent limiting verified |
| Verification | Node test runner, TypeScript, ESLint, archived desktop-browser smoke tests |

The application lockfile resolves dependency versions. The exact tokenizer/runtime pins are part of the compatibility contract; upgrading them requires renewed parity and browser validation.

## 4. Architecture and browser inference

```mermaid
flowchart LR
    UI[React text input] --> Hook[Inference hook and service]
    Manifest[Pinned asset manifest] --> Assets[Download/cache and SHA256 checks]
    Assets --> Worker[Dedicated Web Worker]
    Hook --> Worker
    Worker --> Tokenizer[Saved-map tokenizer: 400 tokens]
    Tokenizer --> ONNX[ONNX Runtime Web WASM: W8A32]
    ONNX --> Result[Four logits: softmax and argmax]
    Result --> UI
```

The service verifies asset lengths/hashes, transfers buffers to the worker and checks worker artifact/runtime identity. The worker checks model configuration and tensor schemas. Requests are serialized; failed sessions are terminated and can be recreated. Caching is optional and cached bytes are verified before use.

The input contract is `input_ids` and `attention_mask`, INT64 `[1,400]`, with BOS=5, EOS=6, PAD=1 and right padding. At most 398 content tokens are retained before BOS/EOS. Output is FP32 `logits` `[1,4]`. The tokenizer is SentencePiece-style **Unigram/Metaspace with the saved normalization mapping**, not an interchangeable NFKC approximation.

## 5. Dataset and splitting

| Split | Records | Source-article groups | Records per class |
|---|---:|---:|---:|
| Training | 30,740 | 7,685 | 7,685 |
| Validation | 3,844 | 961 | 961 |
| Test | 3,844 | 961 | 961 |
| Total | **38,428** | **9,607** | **9,607** |

Human news came from Sanook and The Standard. Source articles were expanded into human and three AI-class records using polish/pure generation modes; only complete four-class groups surviving cleaning were retained. Splitting shuffles source article IDs with a fixed seed and assigns whole groups approximately 80/10/10, following the group-separation principle rather than row-level random splitting.

Group separation does not exclude semantic near-duplicates, pretraining contamination or source/length/generator/mode confounding. Human labels describe source provenance, not independently verified absence of AI assistance. Corpus redistribution and source permissions require separate review; raw datasets are kept local.

## 6. Training and W8A32 optimization

The base model is `airesearch/wangchanberta-base-att-spm-uncased`, fine-tuned with a four-class classification head. Recorded training settings include maximum length 400, learning rate `1e-5`, batch size 8 with two gradient-accumulation steps, four configured epochs and early stopping. The best checkpoint was `checkpoint-5766` at epoch 3.

The selected artifact uses symmetric INT8 storage for selected linear weights per output channel and word/position embeddings per row, with FP32 scales. Foldable Cast/Mul reconstructs FP32 weights; activations and model computation remain FP32. Token-type embeddings, biases, normalization and other unselected constants remain FP32. This is **weight-only W8A32**, not all-INT8 execution.

| Model property | Approved value |
|---|---|
| Artifact | `wo_pc_foldable.onnx` |
| Size | **106,299,948 bytes** (106.30 decimal MB) |
| SHA256 | `4baa5cb331f6cad7d90492d33c3e9a5bf53a45029ca5a563aaa86f7a46bc84a2` |
| Storage reduction versus FP32 | Approximately **74.76%** |

The size reduction does not imply the same RAM or latency reduction. Quantization configuration was selected using validation data. `scripts/export_onnx.py` is the **historical per-tensor dynamic INT8 exporter**, not the producer of this approved W8A32 artifact; it also replaces output directories. Do not run it as a setup step or overwrite preserved model evidence.

## 7. Verified evaluation results

| Model / split | Macro F1 |
|---|---:|
| Original FP32 / original test | 87.5074% |
| Controlled FP32 / validation | 88.7861% |
| Selected W8A32 / validation | **88.8342%** |
| Fixed W8A32 / original test | **87.3705%** |

| Final W8A32 test metric | Result |
|---|---:|
| Accuracy | 87.3569% |
| Macro Precision | 88.8430% |
| Macro Recall | 87.3569% |
| Macro F1 | 87.3705% |
| Human Precision | 97.3624% |
| Human Recall | 88.3455% |
| Human F1 | 92.6350% |

The model exceeds the Macro F1 target by 2.3705 percentage points. Its Macro F1 is 0.1369 percentage points below FP32; 20 of 3,844 class predictions differ. This is not a statistical-equivalence claim. **112/961 human texts were classified as AI**: high Human Precision does not mean zero false accusations.

The original test split had been inspected during earlier diagnostics. The final pass used the fixed, validation-selected model, but was not a never-inspected blind test. No claim extends automatically to essays, social media, unseen generators or other domains. Hosted browser smoke tests established 36 functional inferences across Edge, Chrome and Firefox; they are separate from corpus accuracy evaluation. `scripts/last_metrics.json` is an older **binary** evaluation and must not be quoted as the final four-class result.

## 8. Repository structure

```text
ai-detection-app/        React application, pinned assets, tests and build scripts
scripts/                 Dataset/training/evaluation scripts; legacy pipeline in legacy/
supabase/                Registered migration, reviewed Edge Function and guarded SQL checks
.github/workflows/       Retired keep-alive in this branch; no database access
Document and Draft/      Historical academic documents; review before redistribution
data/                    Local-only train/validation/test CSVs
model_output/            Local-only checkpoint/tokenizer and training outputs
experiment/              Local research, staging and report evidence; mostly ignored
README.md                Academic/project overview
vercel.json              Existing Vite build/output settings
```

The npm project and its authoritative lockfile are inside `ai-detection-app/`. The root has no npm package manifest; do not run app commands from the repository root.

## 9. Prerequisites and installation

Use **Node.js 24+**, npm and a reviewed checkout containing the corrected implementation. From the repository root:

```powershell
cd ai-detection-app
node --version
npm --version
npm ci
```

The model binary is intentionally absent from Git. Obtain the exact approved artifact through an authorized project transfer before running dev/build. No public weight-download URL or complete public research bundle is currently provided. A fresh clone alone is insufficient for the full application and corpus-dependent regression suite.

## 10. Environment configuration

No backend credentials are required for inference. Leave VITE_BACKEND_MODE unset for classification-only local review. Secure Admin/Feedback remains disabled unless all four public settings below are configured. This opt-in behavior does not recreate the historical frozen inference-only build.

| Variable | Scope / purpose |
|---|---|
| `W8A32_MODEL_SOURCE` | Node build/preparation process: local path to the approved ONNX file |
| `VITE_BACKEND_MODE` | `secure-v1` to enable the separately configured secure backend |
| `VITE_SUPABASE_URL` | Approved project HTTPS API origin; browser-visible |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Public publishable key, or a valid legacy anon JWT; never a service/secret key |
| `VITE_TURNSTILE_SITE_KEY` | Public key for the real host-restricted Turnstile widget |
| `VITE_R2_MODEL_URL` | Legacy setting; ignored by the corrected manifest-based inference pipeline |

To provision the approved model, use an actual authorized local path in the shell:

```powershell
$env:W8A32_MODEL_SOURCE = 'C:\approved-artifacts\wo_pc_foldable.onnx'
npm run prepare:model
```

The path is an example, not a supplied download. Alternatively, `node scripts/prepare-model.mjs 'C:\approved-artifacts\wo_pc_foldable.onnx'` performs the same pinned check. Keep `W8A32_MODEL_SOURCE` set for subsequent dev/build if relying on an explicit source. The default source is the local permanent experiment archive.

For local secure-backend testing, use an ignored app-local environment file and only public values. Configure the exact local origin/widget hostname separately; these placeholders do not provision a backend:

```dotenv
VITE_BACKEND_MODE=secure-v1
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_PUBLISHABLE_KEY
VITE_TURNSTILE_SITE_KEY=YOUR_PUBLIC_SITE_KEY
```

The legacy VITE_SUPABASE_ANON_KEY variable and browser admin passcode are not read. For inference-only development, leave VITE_BACKEND_MODE unset.

Do not put service-role keys, provider API keys or real admin credentials in `VITE_*`. Vite embeds these values in client bundles. Dataset-generation/Hugging Face credentials belong only in protected research-process configuration, never the frontend. The present ignore rules do not cover every environment-file variant; verify exclusion before creating one.

## 11. Development server

After model provisioning, from `ai-detection-app/`:

```powershell
npm run dev
```

This verifies/provisions assets before starting Vite. Use the local address printed by Vite. HTTPS or a trustworthy localhost context is required for browser cryptography and worker-related APIs. The UI accepts 200–10,000 characters; the model still sees only the 400-token contract.

## 12. Build and tests

```powershell
npm test
npm run lint
npm run build
npm run preview
```

The six actual npm scripts are documented in the [application README](ai-detection-app/README.md). `npm test` covers client/reliability behavior and tokenizer parity against **all 3,844 frozen validation examples plus 15 edge cases**. Corpus-dependent tests need local `data/val.csv` and the preserved archive fixtures; they will not all run from a bare clone. They do not perform final-test model selection or retraining.

`npm run build` executes asset preparation, `tsc -b` and Vite, writing `dist/`. It packages the application with secure Admin/Feedback enabled only when all public backend configuration is supplied. `npm run preview` serves that local output; it does not deploy it. Current source checks and build-consistency evidence are kept locally in `experiment/github-documentation-finalization-20261113-v1/`; earlier audits remain historical evidence.

## 13. Model hosting and assets

The [source manifest](ai-detection-app/src/inference/model-manifest.json) binds model identity, tokenizer/configuration hashes, four labels and runtime version. [Asset preparation](ai-detection-app/scripts/prepare-model.mjs) validates rather than silently overwriting existing files. Generated assets live under:

```text
ai-detection-app/public/artifacts/thai-en-w8a32-4baa5cb331f6-v1/
```

They include the model, tokenizer, tokenizer/model configuration, manifest and matched `.mjs`/`.wasm` runtime assets. Only this selected public asset set is packaged; the old `public/model/` is not selected. The versioned URLs are same-origin and root-relative. Do not substitute the old R2 model, mutable tokenizer URL or mismatched runtime. Subdirectory/cross-origin hosting needs explicit path/header review and tests.

## 14. Deployment overview

Canonical production: **https://final-project-eta-peach.vercel.app/**. Deployment `dpl_4buo7fcyQsdPAKenZoGjpdvgZTrt` was staged with `--prod --skip-domain`, accepted before promotion, and subsequently promoted by the owner. All three production aliases point to it:

- `final-project-eta-peach.vercel.app` (canonical public entry point).
- `final-project-chitipat92547-7679s-projects.vercel.app`.
- `final-project-git-deploy-chitipat92547-7679s-projects.vercel.app`.

The previous deployment `dpl_GnJvRAogUL4XoUjewLy7A4GNZBWU` remains retained for rollback. Its legacy anonymous backend cannot bypass the hardened database; a frontend rollback must never restore unsafe grants or a client passcode.

The production package contains **18 served assets**. A reviewed **23-file / 99,015,449-byte** Brotli source wrapper reconstructs the exact tested bytes without dependency installation, app recompilation or environment expansion. Model, tokenizer, worker and WASM are served from the same HTTPS origin. The original R2 object was not replaced. The earlier 16-file inference-only staging output is an archived predecessor, not this security-integrated production build.

The Vercel project is `final-project`, Root Directory `ai-detection-app`, Production Branch **deploy**, with Ignored Build Step **Only build production**. Root `vercel.json` alone is not the full verified production release configuration: the frozen wrapper also provides reviewed CSP, MIME and cache policies. Live origins and Turnstile hostname coverage must be configured explicitly per hostname; canonical production feedback preflight is verified. Other aliases do not automatically gain CAPTCHA/CORS coverage merely by pointing at the same app.

GitHub source and deployed artifacts have separate release histories. The `deploy` branch has unrelated history; never merge main into it automatically. Review source on a non-production branch, integrate through the repository review process, provision the approved ignored assets and validate a separate release before an explicitly authorized traffic switch. A non-production Git push may create an ignored/canceled Vercel record; verify current settings rather than assuming every push is inert. This documentation/source synchronization does not deploy a new application.

## 15. Privacy and security

Inference processes text inside the worker. With secure backend mode enabled, feedback sends text/prediction only after explicit consent and Turnstile verification. Anonymous direct table access is denied; administrators require Auth and an owner-managed database allowlist plus a current session. Only report status can be updated. The obsolete browser passcode and localStorage cooldown are not used for authorization or abuse control.

Feedback follows a separate security boundary:

```mermaid
flowchart LR
    User[Explicit feedback consent] --> Widget[Turnstile challenge]
    Widget --> Edge[submit-feedback Edge Function]
    Edge --> Verify[Cloudflare Siteverify: host and action]
    Verify --> RPC[Service-only validated ingestion RPC]
    RPC --> Limits[Atomic global rate limits and replay receipts]
    Limits --> Reports[Reports protected by forced RLS]
    Admin[Administrator login] --> Auth[Supabase Auth]
    Auth --> Allowlist[Owner-managed allowlist and active session]
    Allowlist --> Reports
```

Direct anonymous table INSERT/SELECT/UPDATE/DELETE/TRUNCATE is denied. The public Edge endpoint deliberately uses verify_jwt=false so an anonymous visitor can submit **only after real CAPTCHA and strict server validation**; service credentials remain server-only. New reports are pending. Model ID, text bounds, normalized four-class probabilities, argmax/AI percentage and user label are checked. Private challenge hashes and atomic database caps enforce replay protection and global limits of **10 accepted submissions/minute and 100/hour**. These caps survive browser resets; they are not a localStorage cooldown or a complete traffic/WAF defense.

Real administrator login, allowlist revocation, approval/rejection, normal-browser CAPTCHA submission, anonymous REST denial and native overlapping database transactions were exercised. The accepted production build passed three-browser inference/recovery and all 18 served hashes. Staged moderation was independently observed in database state; later production feedback acceptance is documented by the owner/server-log confirmation. Current read-only verification confirms the public build and canonical 204 feedback preflight without submitting/deleting reports.

The older inference-only copy disabled feedback/admin and remains a separate baseline. The current tests retain limitations: natural JWT expiry and targeted valid-but-expired/wrong-action/wrong-host CAPTCHA cases were not all forced end-to-end. Global limits can be exhausted by abuse, sessions are memory-only, and provider logs may retain request metadata. Feedback is untrusted user opinion, not independently verified authorship or automatic training data. Retain operational test records when the owner requests it; do not delete them as routine cleanup. Do not submit sensitive personal information.

Never commit `.env` files, real API keys, private browser profiles, authentication tokens, raw feedback, training checkpoints or unreviewed scraped data. An ignored file can still be tracked from an earlier commit; review history as well as `.gitignore`.

## 16. Reproducibility and local research evidence

These exact locations exist in the completed local workspace and are **not promised to be present on GitHub**:

| Evidence | Local path |
|---|---|
| Final W8A32 test results | `experiment/research-evaluation-20261108-w8a32-test-v1/FINAL_EVALUATION_REPORT.md` and `final-metrics.json` |
| Selection/construction/readiness archive | `experiment/archive-20261108-readiness-7c21/` |
| Approved model | `experiment/archive-20261108-readiness-7c21/historical/quantization/models/wo_pc_foldable.onnx` |
| Exploratory mixing | `experiment/code-switching-evaluation-20261108-v1/CODE_SWITCHING_EVALUATION_REPORT.md` |
| Original inference-only hosted checks | `experiment/hosted-staging-validation-20261108-v2/HOSTED_STAGING_VALIDATION_REPORT.md` |
| Security integration and native concurrency | `experiment/security-integration-20261112-v1/SECURITY_INTEGRATION_REPORT.md` |
| Accepted production build | `experiment/production-staging-20261113-v1/STAGED_PRODUCTION_ACCEPTANCE_REPORT.md` (pre-promotion checkpoint) |
| Current production/source synchronization | `experiment/github-documentation-finalization-20261113-v1/FINAL_GITHUB_DOCUMENTATION_REPORT.md` |
| Final academic report | `experiment/report-final-content-r5-20261109-v1/CS403_Report_68-2_36_pkl-r5.docx` and matching `.pdf` |

The r5 report is 63 pages with separate verification, cleanup and author-checklist records. Do not substitute historical draft reports or binary metrics. Preserved evaluation records include hashes, software settings, inputs, predictions and confusion matrices. Full reproduction requires authorized data/model/fixture access and a separate output directory; do not rerun scripts that overwrite saved evidence. `scripts/requirements.txt` contains scraper requirements only, not the complete training/evaluation environment; the recorded frozen environment accompanies the final evaluation.

## 17. Generative AI usage disclosure

Generative models produced the labeled AI training examples through the recorded data pipeline. AI assistants also supported programming/debugging, diagnostics, documentation and report preparation. Numerical claims here come from saved experimental evidence, not generated estimates. The author remains responsible for code, provenance, references, diagram accuracy and interpretation; the fuller disclosure is in r5 Appendix ก.

## 18. Known limitations

- Evaluated news-domain distribution and operational authorship labels; no general cross-domain or unseen-generator guarantee.
- Prior diagnostic test inspection; no claim of an untouched blind test or complete contamination exclusion.
- Exploratory script proxies without bilingual language-span annotation; subgroup confounding and small high-mixing groups.
- Human false-AI errors, uncalibrated probabilities and class-specific performance differences.
- Substantial browser memory/first-load costs; single-thread WASM and a development-tagged pinned runtime.
- Desktop Edge/Chrome/Firefox evidence does not establish mobile, Safari, offline or low-memory support.
- Secure staged moderation was independently verified and production feedback was exercised; targeted CAPTCHA expiry/action and natural JWT-expiry tests remain limitations; ordinary-build/frozen-staging differences and private artifacts are needed for complete reproduction.

## 19. Future work

Backend Auth/RLS, validated CAPTCHA ingestion and atomic server-side rate limits are implemented. Further priorities are administrator MFA, trusted-gateway abuse controls and retention/monitoring, an independently collected untouched evaluation set, verified authorship provenance, bilingual annotation, open-set detection, robustness/cross-domain testing and separately validated runtime/device optimization. These additional items are proposals, not completed results.

## 20. Academic attribution and submission

Author: **Chitipat Jampa**. Final-year Computer Science project, Faculty of Science and Technology, **Thammasat University**, CS403/SP2. The final report retains institutional signature/date placeholders pending the university process.

Repository: [chitipatJampa0947/FinalProject](https://github.com/chitipatJampa0947/FinalProject). No repository-wide license file is currently supplied; do not infer redistribution rights for news text, model artifacts, templates or third-party materials. Submission should use selective reviewed commits and an explicitly approved push; preserve private research evidence separately.
