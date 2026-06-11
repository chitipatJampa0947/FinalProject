# scripts/legacy/ — V1/V2 pipeline scripts (superseded, kept for reference)

These scripts are **not part of the V3 pipeline** that produced the deployed
4-class model. They are retained because the thesis methodology narrative
cites the V1→V2→V3 lineage. Do not run them against current data.

| Script | Era | Superseded by | Why kept |
|---|---|---|---|
| `generate_ai.py` | V1/V2 | `generate_openai_realtime.py` + `generate_gemini.py` + `generate_openrouter.py` with shared `gen_prompts.py` | old twin-bucket generation (tech/foreign prompt, ID-parity vendor split); documents the pre-prompt-parity design |
| `combine_dataset.py` | V2 | `build_dataset_v3.py` | old 3-class melt without group-level (gid) splitting — the leakage risk V3 was designed to eliminate |
| `clean_dataset.py` | V1 | cleaning filters inside `build_dataset_v3.py` | early Pantip-era cleaning helper |
| `analyze_dataset.py` | V1 | — | one-off corpus statistics helper |
| `finetune_export.py` | V1 | `train_model.py` + `export_onnx.py` | early combined fine-tune/export experiment |
| `generate_openai_batch.py` | V3 (dead path) | `generate_openai_realtime.py` | OpenAI Batch API was blocked by the org's 2M enqueued-token cap; the realtime generator produced the actual corpus. Kept because the thesis cites the Batch→realtime pivot |
