"""Generate twin-bucket AI dataset (polished + pure) using a multi-vendor split.

Routing: odd `id` -> Gemini 2.5 Flash-Lite, even `id` -> GPT-4o-mini.
Each source article yields one output row with two AI variants from the same
provider, plus the original human text.
"""

import argparse
import csv
import os
import random
import sys
import time
from typing import Callable, Optional

import pandas as pd
from dotenv import load_dotenv
from tqdm import tqdm

# Load API keys from .env at the project root before reading os.environ.
load_dotenv()

from google import genai
from openai import OpenAI

# Configuration
INPUT_CSV = "cleaned_human_dataset.csv"
OUTPUT_CSV = "ai_generated_dataset.csv"
GEMINI_MODEL = "gemini-2.5-flash-lite"
OPENAI_MODEL = "gpt-4o-mini"

MAX_RETRIES = 5
INITIAL_BACKOFF = 2.0       # seconds
MAX_BACKOFF = 60.0
GENERATION_TEMPERATURE = 0.8

OUTPUT_FIELDS = [
    "id", "url", "title",
    "human_text", "ai_polished_text", "ai_pure_text",
    "ai_model",
]

# Initialise API clients up front so missing keys fail fast.
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")

if not GEMINI_API_KEY:
    sys.exit("ERROR: GEMINI_API_KEY environment variable is not set.")
if not OPENAI_API_KEY:
    sys.exit("ERROR: OPENAI_API_KEY environment variable is not set.")

_gemini_client = genai.Client(api_key=GEMINI_API_KEY)
_openai_client = OpenAI(api_key=OPENAI_API_KEY)


POLISHED_PROMPT_TMPL = """คุณคือบรรณาธิการข่าวเทคโนโลยีและข่าวต่างประเทศมืออาชีพระดับสำนักข่าวชั้นนำของไทย
ภารกิจ: เรียบเรียงและขัดเกลาข่าวต่อไปนี้ใหม่ ให้กระชับ อ่านง่าย และมีโทนเป็นทางการมากขึ้น

ข้อกำหนด:
- คงข้อเท็จจริง ตัวเลข วันเวลา ชื่อบุคคล ชื่อบริษัท และศัพท์เทคนิคให้ตรงกับต้นฉบับทุกประการ
- ห้ามเพิ่มข้อมูลใหม่ที่ไม่ได้อยู่ในต้นฉบับ
- ใช้ภาษาไทยที่เป็นธรรมชาติของผู้สื่อข่าวมืออาชีพ ใช้ศัพท์ภาษาอังกฤษเฉพาะส่วนเทคนิคได้ตามความเหมาะสม
- ห้ามใส่คำนำหน้า เช่น "นี่คือข่าวที่เรียบเรียงใหม่" หรือคำอธิบายใดๆ ส่งคืนเฉพาะเนื้อข่าวที่ขัดเกลาแล้ว
- ห้ามใช้สัญลักษณ์ Markdown ในการจัดรูปแบบข้อความเด็ดขาด (เช่น ห้ามใช้ ** หรือ *)

ต้นฉบับ:
\"\"\"
{human_text}
\"\"\"
"""

PURE_PROMPT_TMPL = """คุณคือผู้สื่อข่าวเทคโนโลยีและข่าวต่างประเทศชาวไทยมืออาชีพ
ภารกิจ: เขียนบทความข่าวขึ้นใหม่ทั้งหมดเป็นภาษาไทย โดยใช้เพียงหัวข้อข่าวด้านล่างเป็นแรงบันดาลใจ

ข้อกำหนด:
- เขียนเป็นภาษาไทยธรรมชาติแบบสำนักข่าว ใช้ศัพท์ภาษาอังกฤษทางเทคนิคได้ตามความเหมาะสม
- โครงสร้างแบบข่าว: ย่อหน้าเปิด สรุปประเด็นหลัก รายละเอียดเพิ่มเติม และย่อหน้าปิด
- ความยาวประมาณ 200-400 คำ
- ห้ามใส่หัวข้อซ้ำ ห้ามใส่คำนำหน้าหรือคำอธิบายนอกตัวบทข่าว ส่งคืนเฉพาะเนื้อข่าว
- ห้ามใช้สัญลักษณ์ Markdown ในการจัดรูปแบบข้อความเด็ดขาด (เช่น ห้ามใช้ ** หรือ *)

หัวข้อข่าว: {title}
"""


def call_gemini(prompt: str) -> str:
    resp = _gemini_client.models.generate_content(
        model=GEMINI_MODEL,
        contents=prompt,
    )
    return (resp.text or "").strip()


def call_openai(prompt: str) -> str:
    resp = _openai_client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=GENERATION_TEMPERATURE,
    )
    content = resp.choices[0].message.content or ""
    return content.strip()


def with_retry(call_fn: Callable[[], str], label: str, identifier: str) -> Optional[str]:
    """Run call_fn with exponential backoff. Empty results count as failure."""
    backoff = INITIAL_BACKOFF
    last_err = "unknown"
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            result = call_fn()
            if result:
                return result
            last_err = "empty response"
        except Exception as e:
            last_err = f"{type(e).__name__}: {e}"

        if attempt == MAX_RETRIES:
            break
        sleep_for = min(backoff, MAX_BACKOFF) + random.uniform(0, 1.0)
        tqdm.write(
            f"  [retry {attempt}/{MAX_RETRIES}] {label} id={identifier} "
            f"err={last_err} sleep={sleep_for:.1f}s"
        )
        time.sleep(sleep_for)
        backoff *= 2

    tqdm.write(f"  [FAIL] {label} id={identifier}: {last_err}")
    return None


def load_done_ids() -> set[int]:
    done: set[int] = set()
    if not os.path.exists(OUTPUT_CSV):
        return done
    try:
        with open(OUTPUT_CSV, "r", encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                rid_raw = row.get("id")
                if rid_raw is None:
                    continue
                try:
                    done.add(int(rid_raw))
                except (TypeError, ValueError):
                    continue
    except Exception as e:
        print(f"Warning: could not read existing output CSV ({e}). Starting fresh tracking.")
    return done


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate twin-bucket AI dataset (polished + pure) via Gemini/OpenAI."
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Process only the first N pending rows. Useful for pilot testing before the full run.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    if not os.path.exists(INPUT_CSV):
        sys.exit(f"ERROR: input file not found: {INPUT_CSV}")

    df = pd.read_csv(INPUT_CSV)
    required = {"id", "url", "title", "human_text"}
    missing = required - set(df.columns)
    if missing:
        sys.exit(f"ERROR: input CSV missing required columns: {sorted(missing)}")

    df["id"] = df["id"].astype(int)
    done_ids = load_done_ids()
    pending = df[~df["id"].isin(done_ids)].reset_index(drop=True)

    if args.limit is not None and args.limit > 0:
        pending = pending.head(args.limit).copy()
        print(f"--limit {args.limit} applied: capping pending rows to {len(pending)}")

    print(
        f"Source rows: {len(df)} | already generated: {len(done_ids)} | "
        f"pending: {len(pending)}"
    )
    if pending.empty:
        print("Nothing to do.")
        return

    file_exists = os.path.exists(OUTPUT_CSV)
    fout = open(OUTPUT_CSV, "a", encoding="utf-8-sig", newline="")
    writer = csv.DictWriter(fout, fieldnames=OUTPUT_FIELDS)
    if not file_exists:
        writer.writeheader()
        fout.flush()

    pbar = tqdm(total=len(pending), desc="Generating", unit="row")
    written = 0
    skipped = 0

    try:
        for _, row in pending.iterrows():
            rid = int(row["id"])
            human_text = str(row["human_text"])
            title = str(row["title"])
            url = str(row["url"])

            if rid % 2 == 1:
                provider_label = "gemini"
                model_name = GEMINI_MODEL
                api_call = call_gemini
            else:
                provider_label = "openai"
                model_name = OPENAI_MODEL
                api_call = call_openai

            polished_prompt = POLISHED_PROMPT_TMPL.format(human_text=human_text)
            pure_prompt = PURE_PROMPT_TMPL.format(title=title)

            polished = with_retry(
                lambda p=polished_prompt: api_call(p),
                f"{provider_label}/polished",
                str(rid),
            )
            if polished is None:
                skipped += 1
                pbar.update(1)
                continue

            pure = with_retry(
                lambda p=pure_prompt: api_call(p),
                f"{provider_label}/pure",
                str(rid),
            )
            if pure is None:
                skipped += 1
                pbar.update(1)
                continue

            writer.writerow({
                "id": rid,
                "url": url,
                "title": title,
                "human_text": human_text,
                "ai_polished_text": polished,
                "ai_pure_text": pure,
                "ai_model": model_name,
            })
            fout.flush()
            written += 1
            pbar.update(1)

    except KeyboardInterrupt:
        tqdm.write("\nInterrupted by user. Progress saved.")
    finally:
        pbar.close()
        fout.close()
        print(f"Done. Wrote {written} rows. Skipped {skipped} rows. Total in CSV: {len(done_ids) + written}.")


if __name__ == "__main__":
    main()
