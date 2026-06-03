"""Generate "Other AI" (label 3) variants via a LOCAL Ollama model.

Represents open-source / local LLMs (not GPT, not Gemini) so the classifier
learns a distinct third AI style and the OOD bucket is actually trained.

Reads generation_source.csv and uses the shared prompts (gen_prompts.py) —
same articles/modes as the GPT and Gemini generators.

Runs against a local Ollama server (default http://localhost:11434). Generation
is GPU-bound, so requests are sequential (concurrency wouldn't help a single
GPU). The run is RESUMABLE: re-running skips gids already in ollama_results.csv,
so an overnight run can be stopped/restarted freely.

Prereqs:
    1. Install Ollama (https://ollama.com)
    2. Pull a small fast Thai-capable model, e.g.:
         ollama pull llama3.2:3b
       (or a Typhoon build:  ollama pull scb10x/llama3.2-typhoon2-3b  )
    3. Ensure `ollama serve` is running.

Usage:
    python generate_ollama.py --model llama3.2:3b                 # full run
    python generate_ollama.py --model llama3.2:3b --limit 20      # pilot
"""

import argparse
import csv
import sys
import time
from pathlib import Path

import requests
from tqdm import tqdm

from gen_prompts import build_prompt

HERE = Path(__file__).resolve().parent
SOURCE_CSV = HERE / "generation_source.csv"
RESULTS_CSV = HERE / "ollama_results.csv"

OLLAMA_URL = "http://localhost:11434/api/generate"
DEFAULT_MODEL = "llama3.2:3b"
TEMPERATURE = 0.8
NUM_PREDICT = 900          # max output tokens
REQUEST_TIMEOUT = 300      # local generation can be slow on small GPUs
MAX_RETRIES = 3


def check_server(model: str) -> None:
    try:
        r = requests.get("http://localhost:11434/api/tags", timeout=10)
        r.raise_for_status()
    except Exception:
        sys.exit("ERROR: Ollama server not reachable at localhost:11434. "
                 "Start it with 'ollama serve' and pull a model first.")
    tags = [m.get("name", "") for m in r.json().get("models", [])]
    if model not in tags and not any(t.startswith(model) for t in tags):
        print(f"WARNING: model '{model}' not in local list {tags}. "
              f"Pull it with: ollama pull {model}")


def load_done() -> set[str]:
    done: set[str] = set()
    if RESULTS_CSV.exists():
        with RESULTS_CSV.open(encoding="utf-8-sig") as f:
            for row in csv.DictReader(f):
                if row.get("gid"):
                    done.add(row["gid"])
    return done


def generate_one(model: str, prompt: str) -> str | None:
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": TEMPERATURE, "num_predict": NUM_PREDICT},
    }
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            r = requests.post(OLLAMA_URL, json=payload, timeout=REQUEST_TIMEOUT)
            r.raise_for_status()
            text = (r.json().get("response") or "").strip()
            if text:
                return text
        except Exception as e:
            if attempt == MAX_RETRIES:
                tqdm.write(f"  [FAIL] {type(e).__name__}: {str(e)[:120]}")
                return None
            time.sleep(2.0 * attempt)
    return None


def main() -> None:
    ap = argparse.ArgumentParser(description="Ollama 'Other AI' generator (label 3).")
    ap.add_argument("--model", default=DEFAULT_MODEL, help=f"Ollama model tag (default {DEFAULT_MODEL}).")
    ap.add_argument("--limit", type=int, default=None, help="Pilot: max N new rows.")
    args = ap.parse_args()

    if not SOURCE_CSV.exists():
        sys.exit(f"ERROR: {SOURCE_CSV.name} not found. Run build_gen_source.py first.")
    check_server(args.model)

    rows = list(csv.DictReader(SOURCE_CSV.open(encoding="utf-8-sig")))
    done = load_done()
    pending = [r for r in rows if r["gid"] not in done]
    if args.limit is not None:
        pending = pending[: args.limit]

    print(f"Model: {args.model} | total: {len(rows)} | done: {len(done)} | pending: {len(pending)}")
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
    pbar = tqdm(total=len(pending), desc="Ollama", unit="row")
    try:
        for r in pending:
            prompt = build_prompt(r["mode"], r.get("title", ""), r.get("human_text", ""))
            text = generate_one(args.model, prompt)
            if text:
                writer.writerow({"gid": r["gid"], "ai_text": text})
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
