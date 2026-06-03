"""Generate GPT (label 1) variants via the OpenAI real-time chat API.

Fallback to the Batch API path (generate_openai_batch.py) when the org's
enqueued-token limit is too low for a 10k batch (error: token_limit_exceeded).
Real-time has no enqueued cap; concurrency + backoff handles throughput.

Reads generation_source.csv, uses the shared prompts (gen_prompts.py), and
writes gpt_results.csv (gid, ai_text) — the exact file build_dataset_v3.py
expects. RESUMABLE: re-running skips gids already present.

Requires OPENAI_API_KEY in the project-root .env.

Usage:
    python generate_openai_realtime.py --limit 20      # pilot
    python generate_openai_realtime.py                 # full run
    python generate_openai_realtime.py --workers 8     # concurrency (default 8)
"""

import argparse
import csv
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
RESULTS_CSV = HERE / "gpt_results.csv"

MODEL = "gpt-4o-mini"
MAX_OUTPUT_TOKENS = 900
MAX_RETRIES = 5
INITIAL_BACKOFF = 2.0
MAX_BACKOFF = 60.0

client = OpenAI()
_write_lock = threading.Lock()


def load_done() -> set[str]:
    done: set[str] = set()
    if RESULTS_CSV.exists():
        with RESULTS_CSV.open(encoding="utf-8-sig") as f:
            for row in csv.DictReader(f):
                if row.get("gid"):
                    done.add(row["gid"])
    return done


def generate_one(prompt: str) -> str | None:
    backoff = INITIAL_BACKOFF
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = client.chat.completions.create(
                model=MODEL,
                messages=[{"role": "user", "content": prompt}],
                temperature=GENERATION_TEMPERATURE,
                max_tokens=MAX_OUTPUT_TOKENS,
            )
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
    ap = argparse.ArgumentParser(description="OpenAI real-time GPT generator (label 1).")
    ap.add_argument("--limit", type=int, default=None, help="Pilot: max N new rows.")
    ap.add_argument("--workers", type=int, default=8, help="Concurrent requests.")
    args = ap.parse_args()

    if not SOURCE_CSV.exists():
        sys.exit(f"ERROR: {SOURCE_CSV.name} not found. Run build_gen_source.py first.")

    rows = list(csv.DictReader(SOURCE_CSV.open(encoding="utf-8-sig")))
    done = load_done()
    pending = [r for r in rows if r["gid"] not in done]
    if args.limit is not None:
        pending = pending[: args.limit]

    print(f"Total: {len(rows)} | done: {len(done)} | pending this run: {len(pending)}")
    if not pending:
        print("Nothing to do.")
        return

    file_exists = RESULTS_CSV.exists()
    fout = RESULTS_CSV.open("a", encoding="utf-8-sig", newline="")
    writer = csv.DictWriter(fout, fieldnames=["gid", "ai_text"])
    if not file_exists:
        writer.writeheader()
        fout.flush()

    written, failed = 0, 0
    pbar = tqdm(total=len(pending), desc="GPT", unit="row")

    def task(r: dict) -> tuple[str, str | None]:
        prompt = build_prompt(r["mode"], r.get("title", ""), r.get("human_text", ""))
        return r["gid"], generate_one(prompt)

    try:
        with ThreadPoolExecutor(max_workers=args.workers) as ex:
            futures = [ex.submit(task, r) for r in pending]
            for fut in as_completed(futures):
                gid, text = fut.result()
                if text:
                    with _write_lock:
                        writer.writerow({"gid": gid, "ai_text": text})
                        fout.flush()
                    written += 1
                else:
                    failed += 1
                pbar.update(1)
    except KeyboardInterrupt:
        tqdm.write("\nInterrupted. Progress saved (resumable).")
    finally:
        pbar.close()
        fout.close()
        print(f"Done. Wrote {written}, failed {failed}. Total in CSV: {len(done) + written}.")


if __name__ == "__main__":
    main()
