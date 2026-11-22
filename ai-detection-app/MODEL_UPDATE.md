# คู่มือเปลี่ยนโมเดลและเผยแพร่ผ่าน Vercel

คู่มือนี้ใช้เมื่อเปลี่ยน classifier เป็นโมเดลรุ่นใหม่ ไม่ใช่เพียงนำโมเดลเดิมไปติดตั้งอีกเครื่อง
คำสั่งเป็น PowerShell สำหรับผู้ดูแล release และไม่ได้ทำให้ production เปลี่ยนอัตโนมัติ
อ่านเกณฑ์ผ่านแต่ละขั้นก่อนรัน ค่าภายใน path ตัวอย่างต้องแทนด้วยไฟล์ที่ได้รับอนุญาตจริง

## 1. ขอบเขตและข้อจำกัดของเครื่องมือปัจจุบัน

- ใช้ release working copy แยก รักษาโมเดลเดิมและหลักฐานประเมินเดิมไว้
- `npm run prepare:model` ตรวจและเตรียม artifact ที่ตรง manifest เท่านั้น
  ไม่ฝึก ไม่ประเมินคุณภาพ ไม่ยอมรับไฟล์ใหม่เพียงเพราะชื่อเหมือนเดิม และไม่ deploy
- [manual release guide ที่ตรึงกับ deploy commit](https://github.com/chitipatJampa0947/FinalProject/blob/defeed3e8b2c59732a3c6ca8d9fb1edceee7794b/ai-detection-app/release/README.md)
  และ `manual-release.mjs` ของรุ่นนั้นล็อกผล production เดิมทั้งหมด 18 assets
  จึงยังไม่ใช่ตัวสร้าง release ของโมเดลใหม่โดยอัตโนมัติ
- ห้ามใช้ compressed payload ของ `preview-package-v3` เดิมเพื่ออ้างว่าเผยแพร่โมเดลใหม่
  เพราะยังบรรจุ build และโมเดลเดิม
- ใช้ validation สำหรับเลือก configuration ไม่วนใช้ final test เดิมเพื่อเลือกโมเดล
  ผลวิจัยรุ่นเดิมไม่ใช่ผลรับรองของโมเดลใหม่

## 2. เตรียม working copy และเครื่องมือ

ตัวอย่างนี้สมมติว่ามี release working copy และเครื่องมือที่ได้รับการตรวจแล้ว
ไม่ได้สั่งสร้าง branch, ติดตั้ง CLI, merge หรือ push ไป `deploy`
ใช้ Node 24.22.1 และ Vercel CLI 65.12.1 ตาม release เดิม หรือรุ่นใหม่ที่ผ่านการ review แยกแล้ว

```powershell
$ErrorActionPreference = 'Stop'

$ReleaseRoot = 'C:\cs403-release\candidate-v2'
$App = Join-Path $ReleaseRoot 'ai-detection-app'
$NewModel = 'C:\approved-artifacts\model-v2.onnx'

$Node = 'C:\approved-tools\node-v24.22.1-win-x64\node.exe'
$NpmCli = Join-Path (Split-Path -Parent $Node) 'node_modules\npm\bin\npm-cli.js'
$VercelCli = 'C:\approved-tools\vercel\dist\vc.js'

foreach ($Required in @($App, $NewModel, $Node, $NpmCli, $VercelCli)) {
    if (-not (Test-Path -LiteralPath $Required)) {
        throw "Missing approved input: $Required"
    }
}

$env:Path = (Split-Path -Parent $Node) + [IO.Path]::PathSeparator + $env:Path

& $Node --version
if ($LASTEXITCODE -ne 0) { throw 'Node version check failed' }

& $Node $VercelCli --version
if ($LASTEXITCODE -ne 0) { throw 'Vercel CLI version check failed' }

git -C $ReleaseRoot status --short
git -C $ReleaseRoot rev-parse HEAD
```

ตรวจ working tree และ commit ที่จะใช้จริงก่อนทำต่อ หากมีงานที่ไม่เกี่ยวข้องให้รักษาไว้
ไม่ใช้ `git reset`, `git clean`, force-push หรือ merge ประวัติ `main` กับ `deploy` โดยตรง

## 3. วัด SHA256 และขนาดโมเดลใหม่

คำสั่งส่วนนี้อ่านไฟล์ ไม่เปลี่ยนน้ำหนักโมเดล

```powershell
$NewHash = (
    Get-FileHash -LiteralPath $NewModel -Algorithm SHA256
).Hash.ToLowerInvariant()

$NewBytes = (Get-Item -LiteralPath $NewModel).Length

$NewHash
$NewBytes
```

เทียบกับ hash จากหลักฐานอนุมัติของโมเดลใหม่นั้น ไม่ใช่นำ hash ที่เพิ่งคำนวณมาอนุมัติตัวเอง
SHA256 ใช้ยืนยันตัวตนของไฟล์ ไม่ได้พิสูจน์คุณภาพหรือแหล่งที่มาที่น่าเชื่อถือ

```powershell
$ApprovedHash = 'REPLACE_WITH_REVIEWED_64_HEX_SHA256'

if ($ApprovedHash -notmatch '^[0-9a-fA-F]{64}$') {
    throw 'Supply the reviewed hash before continuing'
}

if ($NewHash -ne $ApprovedHash.ToLowerInvariant()) {
    throw 'New model differs from the approved artifact'
}
```

โมเดล production เดิมมี SHA256
`4baa5cb331f6cad7d90492d33c3e9a5bf53a45029ca5a563aaa86f7a46bc84a2`
และขนาด 106,299,948 ไบต์ ค่านี้เป็นหลักฐานของรุ่นเดิม ไม่ใช่ค่า expected ของรุ่นใหม่

## 4. ตรวจ compatibility และแก้ configuration ใน working copy

ไม่ควรเขียนสคริปต์เปลี่ยน manifest ทุกช่องโดยอัตโนมัติโดยยังไม่ได้ตรวจโมเดล
รายการต่อไปนี้ต้องผ่านการ review ก่อน `prepare:model`

| ไฟล์หรือส่วน | สิ่งที่ต้องตรวจหรือแก้ |
| --- | --- |
| [model-manifest.json](src/inference/model-manifest.json) | ID รุ่นใหม่, model SHA256/bytes และ URL ของ model/tokenizer/config/manifest แบบมีเวอร์ชัน |
| [runtime-hashes.json](model-assets/runtime-hashes.json) | URL ของ runtime ทุกไฟล์ให้ตรง version directory และ `runtime.wasmPath`; คง hash เดิมได้เฉพาะ runtime bytes เดิม |
| [model-assets](model-assets/README.md) | ตรวจ tokenizer, normalizer, special IDs, config และ label mapping ว่าคู่กับโมเดลจริง |
| [contract.ts](src/inference/contract.ts) | ตรวจ input/output schema และ semantics ของสี่คลาส |
| [vite.config.ts](vite.config.ts) | ตรวจว่ารวม artifact รุ่นใหม่ที่ manifest เลือก และไม่รวมรุ่นเก่าหรือไฟล์ส่วนตัว |
| Release contract ใน deploy source | เตรียม output inventory, compressed payload และ reconstruction evidence ของรุ่นใหม่ |

หากตั้งใจคง inference contract เดิม ต้องตรวจด้วย runtime ที่ตรึงไว้ว่า:

- Inputs: `input_ids` และ `attention_mask` ชนิด INT64 รูปร่าง `[1,400]`
- Output: `logits` ชนิด FP32 รูปร่าง `[1,4]`
- ลำดับคลาส: Human, GPT, Gemini, Other
- 400 ตำแหน่งรวม BOS/EOS; เนื้อหาไม่เกิน 398; right padding และ mask ตรงกัน
- Saved normalization map และ tokenizer bytes จับคู่ถูกต้อง
- ONNX operators รองรับ WASM ของ runtime ที่เลือกจริง ไม่ใช่เพียงเปิดได้ใน Python

ใช้ directory/URL รุ่นใหม่ ไม่แทนไฟล์เดิมที่ URL เดิมและไม่ล้างหลักฐาน cache/release เก่าเพื่อให้ผ่าน
หาก contract เปลี่ยน ต้อง review implementation และผลทดสอบใหม่เพิ่มเติมก่อนเผยแพร่

## 5. จัดการ Feedback model ID ก่อน release

การเปลี่ยน `manifest.id` กระทบมากกว่าการโหลดโมเดล ปัจจุบันมีการตรวจ ID แบบตายตัวที่:

- [Edge Function handler](../supabase/functions/submit-feedback/handler.ts): `MODEL_ID` และ `validateFeedback`
- [migration เดิม](../supabase/migrations/20261112134950_harden_reports.sql): feedback ingestion ตรวจ `model_id`

การแก้เฉพาะ frontend อาจทำให้ inference ผ่านแต่ส่ง Feedback ไม่ได้
ต้องเตรียม compatibility change ที่อนุญาตเฉพาะ model versions ที่ตรวจแล้ว
รักษาการตรวจ schema, probabilities, labels, consent, rate limits และสิทธิ์เดิมทั้งหมด

หากต้องเปลี่ยนฐานข้อมูล ให้สร้างและ review migration ใหม่ อย่าแก้ migration ที่ apply แล้ว
การ apply migration หรือ deploy Edge Function ต้องได้รับอนุมัติแยกจากการแก้ README
ทดสอบด้วย synthetic fixtures เท่านั้น ไม่แก้หรือลบ feedback จริง

เพื่อรองรับ rollback ให้ทดสอบว่า backend รับรุ่นเก่าที่เก็บไว้ได้ด้วย
หากยังไม่ผ่าน compatibility gate ให้หยุด release รุ่น secure หรือจัดทำ inference-only candidate
ที่ปิด Feedback/Admin อย่างชัดเจน ห้ามปิด RLS, CAPTCHA หรือข้าม server validation

## 6. เตรียม assets และรันทดสอบ

ทำเฉพาะ release working copy ที่มี input configuration ตรงรุ่นใหม่แล้ว
`npm ci` จะจัด dependencies ใหม่ จึงไม่ควรรันใน working copy ที่มีงานค้างโดยไม่ตรวจ

```powershell
Set-Location -LiteralPath $App

& $Node $NpmCli ci --ignore-scripts --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed' }

$env:W8A32_MODEL_SOURCE = $NewModel

& $Node $NpmCli run prepare:model
if ($LASTEXITCODE -ne 0) { throw 'Model preparation failed' }

& $Node $NpmCli test
if ($LASTEXITCODE -ne 0) { throw 'Regression tests failed' }

& $Node '.\node_modules\typescript\bin\tsc' -b --pretty false
if ($LASTEXITCODE -ne 0) { throw 'TypeScript check failed' }

& $Node $NpmCli run lint
if ($LASTEXITCODE -ne 0) { throw 'ESLint failed' }
```

ก่อน build ต้องตั้ง public Vite configuration ที่ผ่านการ review ตาม [application README](README.md)
การไม่มีค่า backend อาจได้ inference-only build ไม่ใช่หลักฐานว่า secure release พร้อม
ห้ามใส่ service-role key, password, JWT หรือ Turnstile secret ใน `VITE_*`
หากใช้ manual release builder ให้ส่ง public configuration ตาม contract ของ builder
แทนการวาง dotenv ในแอป ซึ่ง builder เดิมจะปฏิเสธ

```powershell
& $Node $NpmCli run build
if ($LASTEXITCODE -ne 0) { throw 'Production build failed' }

& $Node $NpmCli run preview
```

`preview` เป็น local server ใช้ Ctrl+C เมื่อทดสอบเสร็จ ไม่ใช่การเผยแพร่ไป Vercel

ชุด tokenizer parity ปัจจุบันต้องมี validation 3,844 ตัวอย่างและ edge cases 15 กรณีในเครื่อง
ใช้ reference เดิมได้เมื่อยืนยันว่าคง tokenizer contract เดิม หากตั้งใจเปลี่ยน tokenizer
ต้องมี protocol และ Python references รุ่นใหม่ที่ตรวจแล้ว ไม่แก้ expected IDs เพียงเพื่อให้ test ผ่าน

นอกจาก `npm test` ต้องมีการประเมินคุณภาพบน validation ด้วย frozen inputs ที่ตรง Python
บันทึก Macro F1, per-class metrics, confusion matrix, latency, memory และ software/input/model hashes
ไม่มี generic `evaluate-model` npm command ในโปรเจกต์นี้ ให้ใช้ evaluator ที่ตรวจแล้วและ output directory ใหม่
ห้ามรัน evaluator เดิมที่เขียนทับหลักฐาน หรือใช้ final test เดิมจัดอันดับ configuration ใหม่

## 7. สร้าง package รุ่นใหม่และตรวจ hash หลัง build

ต้องเตรียม frozen output, inventory และ compressed payload ใหม่จาก build ที่ผ่านการตรวจ
จำนวนไฟล์และ upload size อาจต่างจากรุ่นเดิม อย่าบังคับให้เท่ากับ 18 assets หรือ 23 source files
ให้วัดจาก package จริงและเทียบขีดจำกัด hosting ปัจจุบัน

ตรวจ model copy ที่ build เลือก:

```powershell
$Manifest = Get-Content -LiteralPath '.\src\inference\model-manifest.json' -Raw |
    ConvertFrom-Json

$BuiltRelativePath = $Manifest.model.url.TrimStart('/')
$BuiltModel = Join-Path (Join-Path $App 'dist') $BuiltRelativePath

$BuiltHash = (
    Get-FileHash -LiteralPath $BuiltModel -Algorithm SHA256
).Hash.ToLowerInvariant()

if ($BuiltHash -ne $NewHash -or
    (Get-Item -LiteralPath $BuiltModel).Length -ne $NewBytes) {
    throw 'Built model differs from the approved new model'
}
```

ให้ generator ของ release รุ่นใหม่บันทึก inventory ของทุก output และทุก upload source file
พร้อมตรวจ compressed hash, decoded hash, ขนาด และ independent reconstruction
ต้องผ่าน byte comparison ทั้งชุด ไม่ใช่ตรวจเฉพาะ model.onnx
ตรวจว่าไม่มี dotenv, credentials, raw feedback, private fixtures, datasets หรือ archive ปะปน

นี่เป็น gate ที่ต้องเตรียมเครื่องมือ/contract ใหม่ก่อนทำต่อ ยังไม่มีคำสั่งที่อนุมัติไว้ซึ่งแปลง
`manual-release.mjs` รุ่นเดิมให้รองรับโมเดลใหม่ได้โดยไม่ต้อง review
ห้ามแก้ production inventory เดิมให้ตรงกับผลที่ผิดเพื่อข้าม gate

Package ที่ตรวจแล้วต้องรักษา root-compatible layout สำหรับ Root Directory `ai-detection-app`:

```text
upload-parent/
  .vercelignore
  ai-detection-app/
    .vercelignore
    package.json
    vercel.json
    release.json
    unpack-staging.mjs
    payload/
```

อย่า upload repository root, source worktree, `dist` ที่ไม่มี wrapper/config ที่ตรวจแล้ว
หรือ model archive แทน package นี้ และอย่าเปลี่ยน project Root Directory เพื่อให้คำสั่งผ่าน

## 8. ตรวจ Vercel ก่อน deploy

คำสั่งหลังจากนี้ต้องใช้ package รุ่นใหม่ที่ผ่าน gate ข้างต้นแล้ว
ค่าบัญชีและ project มาจาก release เดิม ต้องตรวจปัจจุบันซ้ำ ไม่ถือว่ารายงานเก่าคือ live state

```powershell
$Team = 'chitipat92547-7679s-projects'
$Project = 'prj_ZUQDepdtX522CHRyCl0v1w65qVwL'
$UploadParent = 'C:\reviewed-release-v2\upload-parent'

& $Node $VercelCli whoami
if ($LASTEXITCODE -ne 0) { throw 'Vercel authentication required' }

& $Node $VercelCli project inspect final-project --scope $Team
if ($LASTEXITCODE -ne 0) { throw 'Vercel project inspection failed' }

& $Node $VercelCli alias ls --scope $Team
if ($LASTEXITCODE -ne 0) { throw 'Alias inspection failed' }
```

ตรวจ project/team ID, Root Directory `ai-detection-app`, Production Branch `deploy`,
protection, Git deployment guards และ ignore rule ปัจจุบัน
บันทึก production deployment ID และ aliases ทั้งสามก่อนทำต่อ
หาก login หมดอายุ ให้เจ้าของ login ด้วยตนเอง ไม่ส่ง token ผ่านแชตหรือใส่ `--token` ในคำสั่ง

```powershell
$PreviousProduction = 'REPLACE_WITH_VERIFIED_CURRENT_PRODUCTION_ID'

& $Node $VercelCli inspect $PreviousProduction --scope $Team
if ($LASTEXITCODE -ne 0) { throw 'Previous production inspection failed' }
```

## 9. สร้าง staged production deployment โดยไม่ย้าย domains

คำสั่งนี้ upload และ deploy จริง รันหลังอนุมัติ release attempt เท่านั้น
ห้ามเพิ่ม `--force`, `--prebuilt`, เปลี่ยน ignore rule หรือแก้ project settings เพื่อข้ามความล้มเหลว

```powershell
& $Node $VercelCli deploy `
    --prod `
    --skip-domain `
    --project $Project `
    --scope $Team `
    --cwd $UploadParent

if ($LASTEXITCODE -ne 0) { throw 'Stop and preserve deployment evidence' }
```

`--prod --skip-domain` ใช้ Production environment แต่ไม่ auto-assign production domains
ตาม [Vercel deploy documentation](https://vercel.com/docs/cli/deploy#skip-domain)
บันทึก deployment ID, URL และ build logs หาก canceled, upload/build ล้มเหลว หรือขอค่าใช้จ่ายที่ไม่คาดไว้
ให้หยุด ไม่ retry หรือเปลี่ยน configuration เอง

```powershell
$StagedUrl = 'https://REPLACE-WITH-NEW-STAGED-DEPLOYMENT.vercel.app'

& $Node $VercelCli inspect $StagedUrl --scope $Team
if ($LASTEXITCODE -ne 0) { throw 'Staged inspection failed' }
```

สถานะ READY ไม่ได้แปลว่า acceptance ผ่าน ต้องตรวจ:

- Protection ของ HTML/model/WASM ก่อนแชร์ URL และใช้ authorized access ทดสอบ
- Served hashes ทุกไฟล์ตรง frozen inventory รุ่นใหม่ รวม model และ tokenizer
- MIME, CSP, cache headers, Worker/WASM และ 400-token inputs
- Predictions/probabilities ตรง reference ของโมเดลใหม่ ไม่บังคับให้ตรงโมเดลเก่า
- Edge/Chrome/Firefox ทั้ง fresh/cache, initialization, latency, sampled memory และ recovery
- Admin negative-access และ synthetic-only Feedback รวม model ID ใหม่และ rollback รุ่นเก่า
- CORS และ Turnstile รองรับ exact hostname/origin ที่ได้รับอนุมัติ โดยไม่ลด protection
- Production aliases ยังคงชี้ deployment เดิม

หากต้องเพิ่ม hostname/origin หรือ credentials ต้องได้รับอนุมัติจากเจ้าของแยก
ห้ามปิด CAPTCHA หรือทำ origin wildcard เพื่อให้ทดสอบผ่าน

## 10. Promotion และ rollback เป็นคนละการอนุมัติ

หลัง acceptance ผ่านและเจ้าของอนุมัติให้เปลี่ยน traffic จริง จึงรัน:

```powershell
& $Node $VercelCli promote $StagedUrl --scope $Team
if ($LASTEXITCODE -ne 0) { throw 'Inspect promotion state before retrying' }

& $Node $VercelCli alias ls --scope $Team
& $Node $VercelCli inspect $StagedUrl --scope $Team
```

เลือก staged Production deployment ที่ทดสอบแล้ว ไม่ใช่ Preview เพราะการ promote Preview
อาจสร้าง production deployment ใหม่ตาม [Vercel promote documentation](https://vercel.com/docs/cli/promote)
ตรวจ hash, inference และ backend บน canonical URL อีกครั้งหลัง promotion
อย่าลบ deployment รุ่นเดิมหรือ artifact รุ่นเดิม

หากมีปัญหาหลัง promotion ให้ตรวจว่ารุ่นก่อนพร้อมใช้งานและอนุมัติ rollback ก่อนรัน:

```powershell
& $Node $VercelCli rollback $PreviousProduction --scope $Team
if ($LASTEXITCODE -ne 0) { throw 'Inspect rollback state before retrying' }

& $Node $VercelCli alias ls --scope $Team
```

Hobby รองรับ rollback ไปยัง production deployment ก่อนหน้าตาม
[Vercel rollback documentation](https://vercel.com/docs/cli/rollback)
ตรวจ eligibility จริงก่อน release อย่าสมมติว่าทุก deployment ในประวัติย้อนกลับได้
การ rollback frontend ไม่ rollback database โดยอัตโนมัติ และห้ามคืน unsafe grants/passcode

## 11. หลักฐานที่ต้องเก็บสำหรับรุ่นใหม่

- Source commit, Node/npm/CLI/runtime versions และ dependency lock identity
- โมเดลต้นทางที่อนุมัติ SHA256/bytes, tokenizer/config/runtime hashes และ manifest ใหม่
- Validation protocol/results, frozen input identities และ per-class errors
- Build/output/upload inventories, reconstruction checks และ package size
- Browser/authorization/Feedback acceptance พร้อมขอบเขตและ failures ที่ยังเหลือ
- Production baseline, staged deployment ID, promotion/rollback decisions และ alias mappings

เก็บหลักฐานส่วนตัวแยกจาก GitHub ไม่เพิ่ม datasets, model binaries, dotenv, credentials,
browser profiles หรือ feedback จริงด้วย blanket staging
คู่มือนี้เป็นขั้นตอนปฏิบัติ ไม่ใช่หลักฐานว่าโมเดลรุ่นใหม่หรือ deployment ใหม่ผ่านแล้ว
