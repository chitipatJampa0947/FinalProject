# Manual release contract

This branch stores source, never an automatically promoted release. Both Vercel
configuration files disable Git deployments. The application configuration also
uses `ignoreCommand: "exit 0"` as a fail-closed Git build safeguard. Do not remove
either safeguard when synchronizing source. Existing project settings stay intact.

## Reviewed inputs

- Use the existing pinned Windows Node 24.22.1 and its npm; run
  `npm ci --ignore-scripts --no-audit --no-fund` in this application directory.
- Supply the approved local `wo_pc_foldable.onnx` from the permanent experiment
  archive. Its content identity is SHA256
  `4baa5cb331f6cad7d90492d33c3e9a5bf53a45029ca5a563aaa86f7a46bc84a2`,
  106299948 bytes. `prepare-model.mjs` verifies source and destination and refuses
  to overwrite an existing incompatible model. No model URL or download service
  is used. Keep an independent private backup of the approved archive.
- Supply a private local UTF-8 file containing exactly these four public values:
  `VITE_BACKEND_MODE=secure-v1`, `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_TURNSTILE_SITE_KEY`. The exact approved
  values are checked against `public-config-hashes.json`; they are already
  browser-public in the accepted production application. Never supply service
  keys, passwords, JWTs, a Turnstile secret, or unrelated environment variables.
- Supply the `ai-detection-app` directory of the existing approved security
  `preview-package-v3` as the compressed payload source. `upload-release.json`
  pins compressed and uncompressed hashes. No mutable URL is trusted. An absent
  or corrupt approved local source stops preparation.
- `production-assets.json` pins all 18 accepted production outputs. Updating this
  lock for a future application change requires a new review and acceptance run;
  do not regenerate it merely to make a failed comparison pass.
- `.gitattributes` pins CRLF for `index.html` and `public/icons.svg`, matching the
  accepted Windows-built production bytes. This is a checkout contract; their
  normalized Git blobs remain identical to reviewed main. Other inputs retain
  their reviewed bytes. The first LF-only comparison was retained as evidence.

## Prepare without deploying

From this application directory, using the pinned Node executable:

```text
node scripts/manual-release.mjs --model <approved-local-onnx> --public-config <local-public-build.env> --payload-source <approved-wrapper-app-directory> --name <new-release-name>
```

The script validates the inputs, builds source, compares every output byte hash,
copies only hash-verified compressed assets, and independently reconstructs all
18 outputs. `.release/<name>/verification.json` records the complete upload
inventory. The generated `upload-parent/ai-detection-app` layout matches the
existing Vercel Root Directory. No secrets, source archive, data, or test fixtures
enter that upload. Existing release directories are never overwritten.

The generated wrapper uses the source-controlled production headers, no install,
and `node unpack-staging.mjs`; its remote build only reconstructs pinned bytes.
It does not compile source or expand Vite variables on Vercel. Missing project
Vite environment values therefore do not require a project-setting change.
Do not run CLI deployment against the repository or this application source root.

## Approval gates and release operations

Before a source synchronization push, fetch and compare `origin/deploy` with the
reviewed parent; inspect both `vercel.json` Git guards in the exact commit, confirm
project identity, Root Directory, production branch and protection again. The
documented guard is checked locally; a real Git-webhook suppression test is a
separate gate, not proven by JSON validation or a CLI upload dry run. The ignored
build command is an additional safeguard, not a substitute for that distinction.

After owner approval only, use a normal fast-forward push of the exact candidate
SHA to `deploy`. Never force-push, merge unrelated histories, or use a plain
production Git build as a staging mechanism. Inspect Vercel immediately; any
unexpected build is a failed guard check, not permission to promote.

Separately, after release approval, run the pinned Vercel CLI against only the
generated upload parent, explicitly specifying project and team. A Preview or a
production-target deployment with `--prod --skip-domain` is a separate operation;
neither is performed by this script. Keep authentication enabled and existing
aliases unchanged. Verify served hashes, response headers, browser inference,
Admin, Feedback and origin restrictions before requesting promotion approval.
Do not add unexpected origins or weaken CAPTCHA to make acceptance pass.

Record the exact deployment ID and current production ID before any operation.
Promotion is always a separate explicit decision. For rollback after an approved
promotion, verify the previous deployment remains READY, then request approval
for `vercel rollback <previous-deployment-id> --scope <approved-team-slug>`.
Rollback affects aliases; it is not executed as part of source synchronization.
For source rollback, create a new descendant commit restoring reviewed files;
never reset or force-update the recovery history. Preserve the existing deploy
recovery tag and private Git bundle independently of Vercel rollback.
