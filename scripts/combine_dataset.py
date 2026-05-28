"""Melt the twin-bucket AI dataset into a binary classification corpus.

Reads `ai_generated_dataset.csv` (one row per source article, three text
variants per row) and produces three flat `text,label` splits under
`<project_root>/data/`. Markdown artefacts are stripped so the classifier
cannot overfit on formatting symbols.

Label scheme: 0 = human, 1 = AI (both polished + pure).
Splits: 80% train / 10% val / 10% test, shuffled with random_state=42.
"""

import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd

INPUT_CSV = "ai_generated_dataset.csv"
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "data"
RANDOM_STATE = 42
TRAIN_FRAC = 0.8
VAL_FRAC = 0.1
# TEST_FRAC implied = 1 - TRAIN_FRAC - VAL_FRAC = 0.1

# Markdown artefacts to strip. Applied in order; ## before # so multi-char
# markers don't leave orphan hashes behind.
MARKDOWN_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\*\*"), ""),              # bold markers
    (re.compile(r"\*"), ""),                # italic / leftover
    (re.compile(r"`"), ""),                 # backticks (code spans)
    (re.compile(r"^\s*#{1,6}\s*", re.MULTILINE), ""),  # heading markers (#, ##, ###)
    (re.compile(r"#{1,6}"), ""),            # inline stray hashes
]


def strip_markdown(text: str) -> str:
    if not isinstance(text, str):
        return ""
    for pattern, repl in MARKDOWN_PATTERNS:
        text = pattern.sub(repl, text)
    return text.strip()


def subset(df: pd.DataFrame, text_col: str, label: int) -> pd.DataFrame:
    """Extract one (text, label) view from the source dataframe."""
    if text_col not in df.columns:
        sys.exit(f"ERROR: required column '{text_col}' missing from {INPUT_CSV}")
    out = df[[text_col]].rename(columns={text_col: "text"}).copy()
    out["label"] = label
    out = out.dropna(subset=["text"])
    out["text"] = out["text"].astype(str).str.strip()
    out = out[out["text"] != ""]
    return out


def main() -> None:
    in_path = Path(INPUT_CSV)
    if not in_path.exists():
        sys.exit(f"ERROR: input file not found: {INPUT_CSV}")

    try:
        df = pd.read_csv(in_path)
    except Exception as e:
        sys.exit(f"ERROR: failed to read {INPUT_CSV}: {e}")

    original_rows = len(df)
    print(f"Source rows: {original_rows}")

    human = subset(df, "human_text", 0)
    polished = subset(df, "ai_polished_text", 1)
    pure = subset(df, "ai_pure_text", 1)

    print(
        f"  human_text rows       : {len(human)}"
        f"\n  ai_polished_text rows : {len(polished)}"
        f"\n  ai_pure_text rows     : {len(pure)}"
    )

    combined = pd.concat([human, polished, pure], ignore_index=True)
    pre_clean_rows = len(combined)

    # Strip Markdown artefacts from every text row.
    combined["text"] = combined["text"].map(strip_markdown)

    # Drop empties that the regex turned into pure whitespace.
    combined = combined[combined["text"].str.len() > 0]

    # Exact-duplicate dedupe on cleaned text.
    pre_dedupe_rows = len(combined)
    combined = combined.drop_duplicates(subset=["text"]).reset_index(drop=True)
    post_dedupe_rows = len(combined)
    print(
        f"After concat        : {pre_clean_rows}"
        f"\nAfter markdown clean: {pre_dedupe_rows}  (dropped {pre_clean_rows - pre_dedupe_rows} empty)"
        f"\nAfter dedupe        : {post_dedupe_rows}  (dropped {pre_dedupe_rows - post_dedupe_rows} dupes)"
    )

    # Global shuffle for reproducibility.
    combined = combined.sample(frac=1.0, random_state=RANDOM_STATE).reset_index(drop=True)

    # 80/10/10 split via pandas iloc slicing.
    n = len(combined)
    total_rows = len(combined)
    train_end = int(0.8 * total_rows)
    val_end = int(0.9 * total_rows)
    train_df = combined.iloc[:train_end]
    val_df = combined.iloc[train_end:val_end]
    test_df = combined.iloc[val_end:]

    # Write splits.
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    train_path = OUTPUT_DIR / "train.csv"
    val_path = OUTPUT_DIR / "val.csv"
    test_path = OUTPUT_DIR / "test.csv"
    try:
        train_df.to_csv(train_path, index=False, encoding="utf-8-sig")
        val_df.to_csv(val_path, index=False, encoding="utf-8-sig")
        test_df.to_csv(test_path, index=False, encoding="utf-8-sig")
    except Exception as e:
        sys.exit(f"ERROR: failed to write split files: {e}")

    def label_dist(part: pd.DataFrame) -> str:
        counts = part["label"].value_counts().to_dict()
        n_human = int(counts.get(0, 0))
        n_ai = int(counts.get(1, 0))
        return f"label=0 (human): {n_human}  |  label=1 (AI): {n_ai}"

    print("\n=== Split statistics ===")
    print(f"Total rows           : {n}")
    print(f"Train  ({len(train_df):>6})  -> {train_path}")
    print(f"  {label_dist(train_df)}")
    print(f"Val    ({len(val_df):>6})  -> {val_path}")
    print(f"  {label_dist(val_df)}")
    print(f"Test   ({len(test_df):>6})  -> {test_path}")
    print(f"  {label_dist(test_df)}")


if __name__ == "__main__":
    main()
