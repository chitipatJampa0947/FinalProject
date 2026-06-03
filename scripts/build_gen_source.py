"""Assemble the unified 10k generation source for the 4-class V3 corpus.

Combines:
  - Sanook       : sanook_dataset.csv        (columns id,url,title,text,label)
  - The Standard : ai_generated_dataset.csv  (columns id,url,title,human_text,...)

Produces generation_source.csv with one row per source article:
    gid, source, title, human_text, mode
where:
  - gid   : namespaced group key ('sanook_<id>' / 'ts_<id>') -> GroupShuffleSplit
            key later AND the batch custom_id for the API generators.
  - mode  : 'polish' or 'pure', assigned 50/50 within each source so every
            class ends up 5k polished + 5k pure.

Every downstream vendor generator (GPT / Gemini / DeepSeek+Qwen) reads THIS file, so
all vendors see identical articles, modes, and prompts.
"""

import argparse
import sys
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
SANOOK_CSV = HERE / "sanook_dataset.csv"
TS_CSV = HERE / "ai_generated_dataset.csv"
OUT_CSV = HERE / "generation_source.csv"

RANDOM_STATE = 42
PER_SOURCE = 5_000
MIN_LEN = 200  # human_text floor (chars)


def load_sanook() -> pd.DataFrame:
    if not SANOOK_CSV.exists():
        sys.exit(f"ERROR: {SANOOK_CSV.name} not found. Run sanook_scraper.py first.")
    df = pd.read_csv(SANOOK_CSV, encoding="utf-8-sig")
    df = df.rename(columns={"text": "human_text"})
    df = df.dropna(subset=["human_text", "title"])
    df = df[df["human_text"].astype(str).str.len() >= MIN_LEN]
    df = df.drop_duplicates(subset=["human_text"])
    df["gid"] = "sanook_" + df["id"].astype(str)
    df["source"] = "sanook"
    return df[["gid", "source", "title", "human_text"]]


def load_thestandard() -> pd.DataFrame:
    if not TS_CSV.exists():
        sys.exit(f"ERROR: {TS_CSV.name} not found (The Standard human source).")
    df = pd.read_csv(TS_CSV, encoding="utf-8-sig")
    if "human_text" not in df.columns:
        sys.exit("ERROR: ai_generated_dataset.csv missing 'human_text' column.")
    df = df.dropna(subset=["human_text", "title"])
    df = df[df["human_text"].astype(str).str.len() >= MIN_LEN]
    df = df.drop_duplicates(subset=["human_text"])
    df["gid"] = "ts_" + df["id"].astype(str)
    df["source"] = "thestandard"
    return df[["gid", "source", "title", "human_text"]]


def take(df: pd.DataFrame, n: int, label: str) -> pd.DataFrame:
    if len(df) < n:
        print(f"  WARNING: {label} has only {len(df)} usable rows (< {n}). Using all.")
        return df.copy()
    return df.sample(n=n, random_state=RANDOM_STATE).reset_index(drop=True)


def main() -> None:
    ap = argparse.ArgumentParser(description="Build unified 10k generation source.")
    ap.add_argument("--per-source", type=int, default=PER_SOURCE,
                    help=f"Articles per source (default {PER_SOURCE}).")
    args = ap.parse_args()
    n = args.per_source

    print("Loading sources...")
    sanook = take(load_sanook(), n, "Sanook")
    ts = take(load_thestandard(), n, "The Standard")
    print(f"  Sanook       : {len(sanook)}")
    print(f"  The Standard : {len(ts)}")

    combined = pd.concat([sanook, ts], ignore_index=True)
    # Shuffle, then within each source assign first half -> polish, rest -> pure.
    # Vectorized (preserves all columns; avoids groupby.apply dropping 'source').
    combined = combined.sample(frac=1.0, random_state=RANDOM_STATE).reset_index(drop=True)
    combined["_rank"] = combined.groupby("source").cumcount()
    combined["_half"] = combined.groupby("source")["gid"].transform("size") // 2
    combined["mode"] = "pure"
    combined.loc[combined["_rank"] < combined["_half"], "mode"] = "polish"
    combined = combined.drop(columns=["_rank", "_half"])

    combined.to_csv(OUT_CSV, index=False, encoding="utf-8-sig")

    print(f"\nWrote {len(combined)} rows -> {OUT_CSV.name}")
    print("Mode distribution:")
    print(combined.groupby(["source", "mode"]).size().to_string())
    print("\nColumns:", list(combined.columns))


if __name__ == "__main__":
    main()
