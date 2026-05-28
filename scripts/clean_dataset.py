"""Clean the raw human-text scrape from The Standard.

Drops duplicates / nulls / short articles, then strips trailing boilerplate
credit lines (image credits, references, proofreader, "read more"). Output is
the cleaned human-only dataset used as input to `generate_ai.py`.
"""

import re
import sys
from pathlib import Path

import pandas as pd

INPUT_CSV = "thestandard_dataset.csv"
OUTPUT_CSV = "cleaned_human_dataset.csv"
TEXT_COL = "human_text"
MIN_LEN = 200

# Boilerplate keywords that mark the start of trailing credit blocks.
# Truncate from the first match to end-of-string.
BOILERPLATE_RE = re.compile(
    r"(ภาพ:|ภาพประกอบ:|อ้างอิง:|พิสูจน์อักษร:|อ่านข่าวเพิ่มเติม).*$",
    flags=re.DOTALL | re.MULTILINE,
)


def strip_boilerplate(text: str) -> str:
    """Remove trailing boilerplate credit blocks and surrounding whitespace."""
    if not isinstance(text, str):
        return ""
    cleaned = BOILERPLATE_RE.sub("", text)
    return cleaned.strip()


def main() -> None:
    in_path = Path(INPUT_CSV)
    if not in_path.exists():
        sys.exit(f"ERROR: input file not found: {INPUT_CSV}")

    try:
        df = pd.read_csv(in_path)
    except Exception as e:
        sys.exit(f"ERROR: failed to read {INPUT_CSV}: {e}")

    original_rows = len(df)

    # Source CSV uses 'text' as the article body column. Normalise to
    # 'human_text' so the rest of the pipeline is consistent.
    if TEXT_COL not in df.columns and "text" in df.columns:
        df = df.rename(columns={"text": TEXT_COL})
    if TEXT_COL not in df.columns:
        sys.exit(
            f"ERROR: required column '{TEXT_COL}' (or fallback 'text') not "
            f"found in {INPUT_CSV}. Columns present: {list(df.columns)}"
        )

    # 1. Drop rows with missing/NaN text.
    df = df.dropna(subset=[TEXT_COL]).copy()
    after_nan = len(df)

    # 2. Drop exact duplicates on the text column.
    df = df.drop_duplicates(subset=[TEXT_COL]).copy()
    after_dedupe = len(df)

    # 3. Apply boilerplate regex cleanup.
    df[TEXT_COL] = df[TEXT_COL].astype(str).map(strip_boilerplate)

    # 4. Length filter: drop strictly < MIN_LEN chars (post-cleaning).
    df = df[df[TEXT_COL].str.len() >= MIN_LEN].copy()
    after_length = len(df)

    # 5. Save.
    try:
        df.to_csv(OUTPUT_CSV, index=False, encoding="utf-8-sig")
    except Exception as e:
        sys.exit(f"ERROR: failed to write {OUTPUT_CSV}: {e}")

    # 6. Sanity-check stats.
    print(f"Original rows       : {original_rows}")
    print(f"After drop NaN      : {after_nan}  (dropped {original_rows - after_nan})")
    print(f"After drop dupes    : {after_dedupe}  (dropped {after_nan - after_dedupe})")
    print(f"After length >= {MIN_LEN}: {after_length}  (dropped {after_dedupe - after_length})")
    print(f"Cleaned rows out    : {after_length}")
    print(f"Saved to            : {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
