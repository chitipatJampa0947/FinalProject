"""Generate GPT (label 1) variants via the OpenAI Batch API (50% cheaper, async).

Reads generation_source.csv (gid, source, title, human_text, mode) and produces
one GPT generation per article using the shared prompts in gen_prompts.py.

Workflow (Batch API is asynchronous — submit, wait, fetch):

    python generate_openai_batch.py submit   # build .jsonl, upload, create batch
    python generate_openai_batch.py status    # poll batch state
    python generate_openai_batch.py fetch      # when completed -> gpt_results.csv

State (batch id, file ids) is persisted in openai_batch_state.json so submit and
fetch can run in separate sessions. Requires OPENAI_API_KEY in the project .env.
"""

import argparse
import csv
import json
import sys
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

from gen_prompts import build_prompt, GENERATION_TEMPERATURE

# Load OPENAI_API_KEY from the project-root .env (one level up from scripts/).
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

HERE = Path(__file__).resolve().parent
SOURCE_CSV = HERE / "generation_source.csv"
JSONL_PATH = HERE / "openai_batch_input.jsonl"
STATE_PATH = HERE / "openai_batch_state.json"
RESULTS_CSV = HERE / "gpt_results.csv"

MODEL = "gpt-4o-mini"
ENDPOINT = "/v1/chat/completions"
COMPLETION_WINDOW = "24h"
MAX_OUTPUT_TOKENS = 900

client = OpenAI()


def load_state() -> dict:
    if STATE_PATH.exists():
        return json.loads(STATE_PATH.read_text(encoding="utf-8"))
    return {}


def save_state(state: dict) -> None:
    STATE_PATH.write_text(json.dumps(state, indent=2), encoding="utf-8")


def build_jsonl() -> int:
    if not SOURCE_CSV.exists():
        sys.exit(f"ERROR: {SOURCE_CSV.name} not found. Run build_gen_source.py first.")
    df_rows = list(csv.DictReader(SOURCE_CSV.open(encoding="utf-8-sig")))
    if not df_rows:
        sys.exit("ERROR: generation_source.csv is empty.")

    n = 0
    with JSONL_PATH.open("w", encoding="utf-8") as f:
        for r in df_rows:
            prompt = build_prompt(r["mode"], r.get("title", ""), r.get("human_text", ""))
            line = {
                "custom_id": r["gid"],
                "method": "POST",
                "url": ENDPOINT,
                "body": {
                    "model": MODEL,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": GENERATION_TEMPERATURE,
                    "max_tokens": MAX_OUTPUT_TOKENS,
                },
            }
            f.write(json.dumps(line, ensure_ascii=False) + "\n")
            n += 1
    print(f"Built {JSONL_PATH.name}: {n} requests.")
    return n


def cmd_submit() -> None:
    state = load_state()
    if state.get("batch_id"):
        print(f"A batch already exists: {state['batch_id']} "
              f"(status last seen: {state.get('status','?')}).")
        print("Run 'status' or delete openai_batch_state.json to start over.")
        return

    count = build_jsonl()
    print("Uploading input file...")
    up = client.files.create(file=JSONL_PATH.open("rb"), purpose="batch")
    print(f"  input_file_id = {up.id}")

    print("Creating batch...")
    batch = client.batches.create(
        input_file_id=up.id,
        endpoint=ENDPOINT,
        completion_window=COMPLETION_WINDOW,
        metadata={"job": "ai-detect-thai-gpt", "n": str(count)},
    )
    save_state({
        "batch_id": batch.id,
        "input_file_id": up.id,
        "status": batch.status,
        "count": count,
        "model": MODEL,
    })
    print(f"Submitted batch {batch.id} (status={batch.status}).")
    print("Run 'python generate_openai_batch.py status' to monitor.")


def cmd_status() -> None:
    state = load_state()
    if not state.get("batch_id"):
        sys.exit("No batch submitted yet. Run 'submit' first.")
    batch = client.batches.retrieve(state["batch_id"])
    state["status"] = batch.status
    state["output_file_id"] = getattr(batch, "output_file_id", None)
    state["error_file_id"] = getattr(batch, "error_file_id", None)
    save_state(state)
    rc = batch.request_counts
    print(f"batch    : {batch.id}")
    print(f"status   : {batch.status}")
    if rc:
        print(f"progress : total={rc.total} completed={rc.completed} failed={rc.failed}")
    if batch.status == "completed":
        print("Ready. Run 'python generate_openai_batch.py fetch'.")


def cmd_fetch() -> None:
    state = load_state()
    if not state.get("batch_id"):
        sys.exit("No batch submitted yet. Run 'submit' first.")
    batch = client.batches.retrieve(state["batch_id"])
    if batch.status != "completed":
        sys.exit(f"Batch not completed (status={batch.status}). Run 'status' to monitor.")

    out_id = batch.output_file_id
    if not out_id:
        sys.exit("No output_file_id on completed batch (all requests may have failed).")

    print(f"Downloading output file {out_id}...")
    content = client.files.content(out_id).text

    written, errors = 0, 0
    with RESULTS_CSV.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["gid", "ai_text"])
        writer.writeheader()
        for line in content.splitlines():
            if not line.strip():
                continue
            obj = json.loads(line)
            gid = obj.get("custom_id", "")
            resp = obj.get("response") or {}
            body = resp.get("body") or {}
            try:
                text = body["choices"][0]["message"]["content"].strip()
            except (KeyError, IndexError, TypeError):
                errors += 1
                continue
            if not text:
                errors += 1
                continue
            writer.writerow({"gid": gid, "ai_text": text})
            written += 1

    print(f"Wrote {written} rows -> {RESULTS_CSV.name}. Skipped {errors} empty/error responses.")
    if batch.error_file_id:
        print(f"Note: batch has an error file ({batch.error_file_id}); some requests failed.")


def main() -> None:
    ap = argparse.ArgumentParser(description="OpenAI Batch API GPT generator.")
    ap.add_argument("command", choices=["submit", "status", "fetch"],
                    help="submit: create batch | status: poll | fetch: download results")
    args = ap.parse_args()
    {"submit": cmd_submit, "status": cmd_status, "fetch": cmd_fetch}[args.command]()


if __name__ == "__main__":
    main()
