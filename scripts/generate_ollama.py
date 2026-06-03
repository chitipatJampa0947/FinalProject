"""Generate "Other AI" (label 3) variants via LOCAL Ollama models.

Represents open-source / local LLMs (not GPT, not Gemini). To diversify the
class, the run is split 50/50 across two local models, handled AUTOMATICALLY
inside this one script:

    first  TYPHOON_TARGET rows -> scb10x/llama3.2-typhoon2-3b-instruct
    remaining rows (up to TOTAL_TARGET) -> llama3.2:3b

Run ONE command and leave it unattended:
    python generate_ollama.py

Fully RESUMABLE: on restart it reads ollama_results.csv, counts how many rows
each model already produced, and continues with the correct model to hit the
TYPHOON_TARGET / TOTAL_TARGET split. Stop (Ctrl-C) / reboot any time.

Reads generation_source.csv and uses the shared prompts (gen_prompts.py) —
same articles/modes as the GPT and Gemini generators. Each row is tagged with
its source model in the `model` column.

Prereqs: Ollama running, both models pulled:
    ollama pull llama3.2:3b
    ollama pull scb10x/llama3.2-typhoon2-3b-instruct
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

# Auto-split configuration.
TYPHOON_MODEL = "scb10x/llama3.2-typhoon2-3b-instruct"
LLAMA_MODEL = "llama3.2:3b"
TYPHOON_TARGET = 5_000      # first 5k rows use Typhoon
TOTAL_TARGET = 10_000       # then Llama fills up to 10k total

TEMPERATURE = 0.8
NUM_PREDICT = 900
REQUEST_TIMEOUT = 300
MAX_RETRIES = 3


def check_server(models: list[str]) -> None:
    try:
        r = requests.get("http://localhost:11434/api/tags", timeout=10)
        r.raise_for_status()
    except Exception:
        sys.exit("ERROR: Ollama server not reachable at localhost:11434. "
                 "Start it with 'ollama serve' and pull the models first.")
    tags = [m.get("name", "") for m in r.json().get("models", [])]
    for model in models:
        if model not in tags and not any(t.startswith(model) for t in tags):
            sys.exit(f"ERROR: model '{model}' not pulled. Run: ollama pull {model}\n"
                     f"  (local models: {tags})")


def load_progress() -> tuple[set[str], int, int]:
    """Return (done_gids, typhoon_count, llama_count) from existing results."""
    done: set[str] = set()
    typhoon = llama = 0
    if RESULTS_CSV.exists():
        with RESULTS_CSV.open(encoding="utf-8-sig") as f:
            for row in csv.DictReader(f):
                gid = row.get("gid")
                if not gid:
                    continue
                done.add(gid)
                model = row.get("model", "")
                if model == LLAMA_MODEL:
                    llama += 1
                else:
                    # Anything not the Llama tag is treated as Typhoon
                    # (covers the ':latest' suffix and legacy rows).
                    typhoon += 1
    return done, typhoon, llama


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
    ap = argparse.ArgumentParser(description="Ollama 'Other AI' generator (auto 50/50 split).")
    ap.add_argument("--typhoon-model", default=TYPHOON_MODEL, help="Model for the first half.")
    ap.add_argument("--llama-model", default=LLAMA_MODEL, help="Model for the second half.")
    ap.add_argument("--typhoon-target", type=int, default=TYPHOON_TARGET,
                    help=f"Rows from the Typhoon model (default {TYPHOON_TARGET}).")
    ap.add_argument("--total-target", type=int, default=TOTAL_TARGET,
                    help=f"Total label-3 rows to produce (default {TOTAL_TARGET}).")
    ap.add_argument("--limit", type=int, default=None, help="Pilot: max N new rows this run.")
    args = ap.parse_args()

    typhoon_model = args.typhoon_model
    llama_model = args.llama_model
    typhoon_target = args.typhoon_target
    total_target = args.total_target

    if not SOURCE_CSV.exists():
        sys.exit(f"ERROR: {SOURCE_CSV.name} not found. Run build_gen_source.py first.")
    check_server([typhoon_model, llama_model])

    rows = list(csv.DictReader(SOURCE_CSV.open(encoding="utf-8-sig")))
    done, typhoon_done, llama_done = load_progress()
    pending = [r for r in rows if r["gid"] not in done]

    total_done = typhoon_done + llama_done
    remaining = max(0, total_target - total_done)
    if args.limit is not None:
        remaining = min(remaining, args.limit)

    print(f"Source: {len(rows)} | done: {total_done} "
          f"(Typhoon {typhoon_done}/{typhoon_target}, Llama {llama_done}/{total_target - typhoon_target})")
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

    produced, failed = 0, 0
    pbar = tqdm(total=remaining, desc="Ollama", unit="row")
    try:
        for r in pending:
            if produced >= remaining or (typhoon_done + llama_done) >= total_target:
                break
            # Count-based model selection -> correct on every resume.
            if typhoon_done < typhoon_target:
                model = typhoon_model
            else:
                model = llama_model

            prompt = build_prompt(r["mode"], r.get("title", ""), r.get("human_text", ""))
            text = generate_one(model, prompt)
            if text:
                writer.writerow({"gid": r["gid"], "ai_text": text, "model": model})
                fout.flush()
                if model == llama_model:
                    llama_done += 1
                else:
                    typhoon_done += 1
                produced += 1
                pbar.set_postfix_str(f"T={typhoon_done} L={llama_done}")
            else:
                failed += 1
            pbar.update(1)
    except KeyboardInterrupt:
        tqdm.write("\nInterrupted. Progress saved (resumable).")
    finally:
        pbar.close()
        fout.close()
        print(f"Done. Produced {produced}, failed {failed}. "
              f"Totals: Typhoon {typhoon_done}, Llama {llama_done}.")


if __name__ == "__main__":
    main()
