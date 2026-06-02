"""Melt the twin-bucket AI dataset into a 3-CLASS vendor classification corpus.

Reads `ai_generated_dataset.csv` (one row per source article: the original
`human_text`, two AI variants `ai_polished_text` + `ai_pure_text`, and an
`ai_model` vendor tag) and produces three flat `text,label` splits under
`<project_root>/data/`.

Label scheme (3-class):
    0 = Human   -> human_text
    1 = GPT     -> ai_polished_text + ai_pure_text where ai_model is GPT-4o-mini
    2 = Gemini  -> ai_polished_text + ai_pure_text where ai_model is Gemini 2.5 Flash-Lite

Pipeline: melt -> strip Markdown -> drop empty -> dedupe (within + across
classes) -> downsample every class to equal size (perfect balance) ->
stratified 80/10/10 split (each split keeps the balance) -> shuffle.
"""

import re
import sys
from pathlib import Path

import pandas as pd

INPUT_CSV = "ai_generated_dataset.csv"
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "data"
RANDOM_STATE = 42
TRAIN_FRAC = 0.8
VAL_FRAC = 0.1
# TEST_FRAC implied = 1 - TRAIN_FRAC - VAL_FRAC = 0.1

LABEL_HUMAN = 0
LABEL_GPT = 1
LABEL_GEMINI = 2
LABEL_NAMES = {0: "Human", 1: "GPT", 2: "Gemini"}

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


def vendor_label(model: object) -> int | None:
    """Map the ai_model string to a vendor class. None = unrecognised."""
    m = str(model).lower()
    if "gpt" in m:
        return LABEL_GPT
    if "gemini" in m:
        return LABEL_GEMINI
    return None


def melt_human(df: pd.DataFrame) -> pd.DataFrame:
    if "human_text" not in df.columns:
        sys.exit(f"ERROR: required column 'human_text' missing from {INPUT_CSV}")
    out = df[["human_text"]].rename(columns={"human_text": "text"}).copy()
    out["label"] = LABEL_HUMAN
    return out


def melt_ai(df: pd.DataFrame) -> pd.DataFrame:
    """One row per AI variant (polished + pure), labelled by its vendor."""
    for col in ("ai_polished_text", "ai_pure_text", "ai_model"):
        if col not in df.columns:
            sys.exit(f"ERROR: required column '{col}' missing from {INPUT_CSV}")

    df = df.copy()
    df["vendor"] = df["ai_model"].map(vendor_label)
    unknown = int(df["vendor"].isna().sum())
    if unknown:
        print(f"  WARNING: {unknown} rows had an unrecognised ai_model -> dropped")
    df = df.dropna(subset=["vendor"])
    df["vendor"] = df["vendor"].astype(int)

    parts = []
    for col in ("ai_polished_text", "ai_pure_text"):
        p = df[[col, "vendor"]].rename(columns={col: "text", "vendor": "label"})
        parts.append(p)
    return pd.concat(parts, ignore_index=True)


def clean(df: pd.DataFrame) -> pd.DataFrame:
    """Strip Markdown, drop empties, dedupe text, force int labels."""
    df = df.dropna(subset=["text"]).copy()
    df["text"] = df["text"].astype(str).map(strip_markdown)
    df = df[df["text"].str.len() > 0]
    df = df.drop_duplicates(subset=["text"])
    df["label"] = df["label"].astype(int)
    return df.reset_index(drop=True)


def split_class(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Shuffle one class and slice it 80/10/10 (stratified-by-construction)."""
    df = df.sample(frac=1.0, random_state=RANDOM_STATE).reset_index(drop=True)
    n = len(df)
    train_end = int(TRAIN_FRAC * n)
    val_end = int((TRAIN_FRAC + VAL_FRAC) * n)
    return df.iloc[:train_end], df.iloc[train_end:val_end], df.iloc[val_end:]


def label_dist(part: pd.DataFrame) -> str:
    counts = part["label"].value_counts().to_dict()
    return "  |  ".join(
        f"{LABEL_NAMES[k]}({k}): {int(counts.get(k, 0))}" for k in (0, 1, 2)
    )


def main() -> None:
    in_path = Path(INPUT_CSV)
    if not in_path.exists():
        sys.exit(f"ERROR: input file not found: {INPUT_CSV}")

    try:
        df = pd.read_csv(in_path, encoding="utf-8-sig")
    except Exception as e:
        sys.exit(f"ERROR: failed to read {INPUT_CSV}: {e}")

    print(f"Source rows (articles): {len(df)}")

    # 1. Melt + clean each class.
    human = clean(melt_human(df))
    ai = melt_ai(df)
    gpt = clean(ai[ai["label"] == LABEL_GPT])
    gemini = clean(ai[ai["label"] == LABEL_GEMINI])
    print(
        f"After melt + clean (within-class dedupe):"
        f"\n  Human (0) : {len(human)}"
        f"\n  GPT   (1) : {len(gpt)}"
        f"\n  Gemini(2) : {len(gemini)}"
    )

    # 2. Cross-class dedupe (a text must belong to exactly one class).
    combined = pd.concat([human, gpt, gemini], ignore_index=True)
    pre = len(combined)
    combined = combined.drop_duplicates(subset=["text"]).reset_index(drop=True)
    if pre != len(combined):
        print(f"Cross-class dedupe: dropped {pre - len(combined)} duplicate texts")

    by_class = {lbl: combined[combined["label"] == lbl] for lbl in (0, 1, 2)}
    counts = {lbl: len(part) for lbl, part in by_class.items()}
    print("After cross-class dedupe: "
          + "  |  ".join(f"{LABEL_NAMES[k]}({k}): {counts[k]}" for k in (0, 1, 2)))

    # 3. Perfect balance: downsample every class to the smallest class size.
    target = min(counts.values())
    print(f"\nBalancing all classes to {target} rows each (downsample to min).")
    balanced = {
        lbl: part.sample(n=target, random_state=RANDOM_STATE).reset_index(drop=True)
        for lbl, part in by_class.items()
    }

    # 4. Stratified 80/10/10: split each class, then concat per split.
    train_parts, val_parts, test_parts = [], [], []
    for lbl in (0, 1, 2):
        tr, va, te = split_class(balanced[lbl])
        train_parts.append(tr)
        val_parts.append(va)
        test_parts.append(te)

    def assemble(parts: list[pd.DataFrame]) -> pd.DataFrame:
        out = pd.concat(parts, ignore_index=True)
        return out.sample(frac=1.0, random_state=RANDOM_STATE).reset_index(drop=True)

    train_df = assemble(train_parts)
    val_df = assemble(val_parts)
    test_df = assemble(test_parts)

    # 5. Write splits.
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

    total = len(train_df) + len(val_df) + len(test_df)
    print("\n=== Split statistics (3-class) ===")
    print(f"Total rows           : {total}")
    print(f"Train  ({len(train_df):>6})  -> {train_path}")
    print(f"  {label_dist(train_df)}")
    print(f"Val    ({len(val_df):>6})  -> {val_path}")
    print(f"  {label_dist(val_df)}")
    print(f"Test   ({len(test_df):>6})  -> {test_path}")
    print(f"  {label_dist(test_df)}")


if __name__ == "__main__":
    main()
