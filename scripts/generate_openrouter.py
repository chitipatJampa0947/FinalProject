"""Generate "Other AI" (label 3) variants via OpenRouter (open-weight vendors).

Why cloud, not local: a small local model produced scaffolding/garbled output
and took ~33h. OpenRouter gives clean, instruction-following open-weight models
in ~95min for ~$5, concurrently.

Class 3 is split 50/50 across two distinct open-weight vendors for diversity,
handled AUTOMATICALLY here:

    first  DEEPSEEK_TARGET rows -> deepseek/deepseek-chat    (DeepSeek-V3)
    remaining rows up to TOTAL  -> qwen/qwen-2.5-7b-instruct (Qwen 2.5)

Run ONE command, leave it:
    python generate_openrouter.py

Fully RESUMABLE: reads other_results.csv, counts rows per model, continues
with the correct model to hit the split. Each row tagged with its model.

Reads generation_source.csv and uses the shared prompts (gen_prompts.py) —
same articles/modes as the GPT and Gemini generators.

Requires OPENROUTER_API_KEY in the project-root .env (https://openrouter.ai).
"""

import argparse
import csv
import os
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from dotenv import load_dotenv
from tqdm import tqdm
from openai import OpenAI

from gen_prompts import build_prompt, GENERATION_TEMPERATURE

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

HERE = Path(__file__).resolve().parent
SOURCE_CSV = HERE / "generation_source.csv"
RESULTS_CSV = HERE / "other_results.csv"

# Auto-split across two open-weight vendors.
DEEPSEEK_MODEL = "deepseek/deepseek-chat"
QWEN_MODEL = "qwen/qwen-2.5-7b-instruct"  # 7B: ~5x faster than 72B on OpenRouter, still clean
DEEPSEEK_TARGET = 5_000      # first 5k rows from DeepSeek
TOTAL_TARGET = 10_000        # then Qwen up to 10k

MAX_OUTPUT_TOKENS = 900
MAX_RETRIES = 5
INITIAL_BACKOFF = 2.0
MAX_BACKOFF = 60.0

API_KEY = os.environ.get("OPENROUTER_API_KEY")
if not API_KEY:
    sys.exit("ERROR: OPENROUTER_API_KEY not set in .env (get one at https://openrouter.ai).")

client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=API_KEY)
_write_lock = threading.Lock()


def load_progress(deepseek_model: str) -> tuple[set[str], int, int]:
    """Return (done_gids, deepseek_count, qwen_count) from existing results."""
    done: set[str] = set()
    ds = qw = 0
    if RESULTS_CSV.exists():
        with RESULTS_CSV.open(encoding="utf-8-sig") as f:
            for row in csv.DictReader(f):
                gid = row.get("gid")
                if not gid:
                    continue
                done.add(gid)
                if row.get("model", "") == deepseek_model:
                    ds += 1
                else:
                    qw += 1
    return done, ds, qw


def generate_one(model: str, prompt: str) -> str | None:
    backoff = INITIAL_BACKOFF
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                temperature=GENERATION_TEMPERATURE,
                max_tokens=MAX_OUTPUT_TOKENS,
            )
            if not resp.choices:
                raise RuntimeError("no choices in response")
            text = (resp.choices[0].message.content or "").strip()
            if text:
                return text
        except Exception as e:
            if attempt == MAX_RETRIES:
                tqdm.write(f"  [FAIL] {type(e).__name__}: {str(e)[:120]}")
                return None
        time.sleep(min(backoff, MAX_BACKOFF))
        backoff *= 2
    return None


def main() -> None:
    ap = argparse.ArgumentParser(description="OpenRouter 'Other AI' generator (DeepSeek+Qwen).")
    ap.add_argument("--deepseek-model", default=DEEPSEEK_MODEL)
    ap.add_argument("--qwen-model", default=QWEN_MODEL)
    ap.add_argument("--deepseek-target", type=int, default=DEEPSEEK_TARGET)
    ap.add_argument("--total-target", type=int, default=TOTAL_TARGET)
    ap.add_argument("--limit", type=int, default=None, help="Pilot: max N new rows.")
    ap.add_argument("--workers", type=int, default=8, help="Concurrent requests.")
    args = ap.parse_args()

    if not SOURCE_CSV.exists():
        sys.exit(f"ERROR: {SOURCE_CSV.name} not found. Run build_gen_source.py first.")

    rows = list(csv.DictReader(SOURCE_CSV.open(encoding="utf-8-sig")))
    done, ds_done, qw_done = load_progress(args.deepseek_model)
    pending = [r for r in rows if r["gid"] not in done]

    total_done = ds_done + qw_done
    remaining = max(0, args.total_target - total_done)
    if args.limit is not None:
        remaining = min(remaining, args.limit)

    print(f"Source: {len(rows)} | done: {total_done} "
          f"(DeepSeek {ds_done}/{args.deepseek_target}, "
          f"Qwen {qw_done}/{args.total_target - args.deepseek_target})")
    print(f"Pending available: {len(pending)} | will generate up to: {remaining}")
    if remaining <= 0 or not pending:
        print("Target reached. Nothing to do.")
        return

    file_exists = RESULTS_CSV.exists()
    fout = RESULTS_CSV.open("a", encoding="utf-8-sig", newline="")
    writer = csv.DictWriter(fout, fieldnames=["gid", "ai_text", "model"])
    if not file_exists:
        writer.writeheader()
        fout.flush()

    # Pre-assign a model to each pending row based on the DeepSeek quota.
    # (Counts are corrected on resume from the CSV, so this stays balanced.)
    slots_ds = max(0, args.deepseek_target - ds_done)
    plan = []
    for i, r in enumerate(pending[:remaining]):
        model = args.deepseek_model if i < slots_ds else args.qwen_model
        plan.append((r, model))

    produced = {"ds": 0, "qw": 0}
    failed = 0
    pbar = tqdm(total=len(plan), desc="OpenRouter", unit="row")

    def task(item):
        r, model = item
        prompt = build_prompt(r["mode"], r.get("title", ""), r.get("human_text", ""))
        return r["gid"], model, generate_one(model, prompt)

    try:
        with ThreadPoolExecutor(max_workers=args.workers) as ex:
            futures = [ex.submit(task, it) for it in plan]
            for fut in as_completed(futures):
                gid, model, text = fut.result()
                if text:
                    with _write_lock:
                        writer.writerow({"gid": gid, "ai_text": text, "model": model})
                        fout.flush()
                    produced["ds" if model == args.deepseek_model else "qw"] += 1
                else:
                    failed += 1
                pbar.update(1)
    except KeyboardInterrupt:
        tqdm.write("\nInterrupted. Progress saved (resumable).")
    finally:
        pbar.close()
        fout.close()
        print(f"Done. DeepSeek +{produced['ds']}, Qwen +{produced['qw']}, failed {failed}.")


if __name__ == "__main__":
    main()
