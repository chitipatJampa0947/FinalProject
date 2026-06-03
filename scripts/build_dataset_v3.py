"""Assemble the 4-class V3 corpus with leakage-safe group splitting.

Joins the human source with the three vendor generations by `gid`:

    generation_source.csv  (gid, source, title, human_text, mode)  -> label 0 (Human)
    gpt_results.csv        (gid, ai_text)                          -> label 1 (GPT)
    gemini_results.csv     (gid, ai_text)                          -> label 2 (Gemini)
    ollama_results.csv     (gid, ai_text)                          -> label 3 (Other AI)

Balance is automatic: we keep only gids that have ALL FOUR variants (after
Markdown-stripping and length filtering), so every kept article contributes
exactly one row per class -> perfectly balanced.

Leakage safety: the split is by `gid` (the source article), NOT by row. All 4
rows of an article land in the same split, so a model can never see an article's
human version in train and its AI rewrite in test. Equivalent to
sklearn GroupShuffleSplit, done by partitioning the unique gids 80/10/10.

Output: ../data/{train,val,test}.csv  (text,label)  -> WangchanBERTa pipeline.

Label scheme: 0=Human, 1=GPT, 2=Gemini, 3=Other AI (Ollama).
"""

import argparse
import re
import sys
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
OUTPUT_DIR = HERE.parent / "data"

SOURCE_CSV = HERE / "generation_source.csv"
GPT_CSV = HERE / "gpt_results.csv"
GEMINI_CSV = HERE / "gemini_results.csv"
OLLAMA_CSV = HERE / "ollama_results.csv"

RANDOM_STATE = 42
TRAIN_FRAC = 0.8
VAL_FRAC = 0.1
MIN_LEN = 200
MAX_LEN = 3_000

LABEL_NAMES = {0: "Human", 1: "GPT", 2: "Gemini", 3: "Other"}

MARKDOWN_PATTERNS = [
    (re.compile(r"\*\*"), ""),
    (re.compile(r"\*"), ""),
    (re.compile(r"`"), ""),
    (re.compile(r"^\s*#{1,6}\s*", re.MULTILINE), ""),
    (re.compile(r"#{1,6}"), ""),
]

# Small local models (label 3) sometimes emit meta scaffolding despite the
# prompt ("คำนำ:", "เนื้อข่าว:", "Here is ...:"). Strip it so it can't become a
# formatting tell. Harmless on clean GPT/Gemini text (rarely matches).
_SCAFFOLD_LABELS = [
    "คำตอบทั้งหมด", "คำตอบ", "คำนำ", "เนื้อข่าว", "เนื้อหาข่าว", "บทความ",
    "หัวข้อข่าว", "หัวข้อ", "สรุปข่าว", "บทสรุป", "สรุป", "ข่าว",
]
SCAFFOLD_LABEL_RE = re.compile(
    r"(?:^|\n)\s*(?:" + "|".join(_SCAFFOLD_LABELS) + r")\s*[:：]\s*", re.M)
SCAFFOLD_PREAMBLE_RE = re.compile(
    r"^\s*(?:sure|here(?:'s| is)|certainly|ได้เลย|นี่คือ)[^\n]*\n+", re.I)


def strip_markdown(text: str) -> str:
    if not isinstance(text, str):
        return ""
    text = SCAFFOLD_PREAMBLE_RE.sub("", text)
    text = SCAFFOLD_LABEL_RE.sub(" ", text)
    for pat, repl in MARKDOWN_PATTERNS:
        text = pat.sub(repl, text)
    return re.sub(r"\s+", " ", text).strip()


def load_variant(path: Path, label: int) -> pd.DataFrame:
    if not path.exists():
        sys.exit(f"ERROR: {path.name} not found. Generate it before combining.")
    df = pd.read_csv(path, encoding="utf-8-sig")
    df = df.rename(columns={"ai_text": "text"})
    df = df[["gid", "text"]].copy()
    df["label"] = label
    return df


def clean(df: pd.DataFrame) -> pd.DataFrame:
    df = df.dropna(subset=["text"]).copy()
    df["text"] = df["text"].astype(str).map(strip_markdown)
    df = df[(df["text"].str.len() >= MIN_LEN)]
    df["text"] = df["text"].str.slice(0, MAX_LEN)
    df = df.drop_duplicates(subset=["text"])
    df["label"] = df["label"].astype(int)
    return df


def main() -> None:
    ap = argparse.ArgumentParser(description="Build 4-class V3 dataset (group-split).")
    ap.add_argument("--max-groups", type=int, default=None,
                    help="Cap complete articles used (e.g. 10000 for 10k/class).")
    args = ap.parse_args()

    if not SOURCE_CSV.exists():
        sys.exit(f"ERROR: {SOURCE_CSV.name} not found. Run build_gen_source.py first.")

    # Human rows from the generation source.
    src = pd.read_csv(SOURCE_CSV, encoding="utf-8-sig")
    human = src[["gid", "human_text"]].rename(columns={"human_text": "text"}).copy()
    human["label"] = 0

    gpt = load_variant(GPT_CSV, 1)
    gemini = load_variant(GEMINI_CSV, 2)
    ollama = load_variant(OLLAMA_CSV, 3)

    # Clean every class independently.
    parts = {0: clean(human), 1: clean(gpt), 2: clean(gemini), 3: clean(ollama)}
    print("After clean (per class):")
    for lbl, p in parts.items():
        print(f"  {LABEL_NAMES[lbl]:7}({lbl}): {len(p):6} rows, {p['gid'].nunique()} gids")

    # Keep only gids present in ALL FOUR classes -> automatic balance.
    gid_sets = [set(p["gid"]) for p in parts.values()]
    complete = set.intersection(*gid_sets)
    print(f"\nComplete articles (all 4 variants survive): {len(complete)}")
    if not complete:
        sys.exit("ERROR: no gid has all four variants. Check the generation outputs.")

    complete_list = sorted(complete)
    rng = pd.Series(complete_list).sample(frac=1.0, random_state=RANDOM_STATE).tolist()
    if args.max_groups and args.max_groups < len(rng):
        rng = rng[: args.max_groups]
        complete = set(rng)
        print(f"Capped to {len(rng)} articles ({len(rng)} rows/class).")

    # Group-aware 80/10/10 split on the unique gids.
    n = len(rng)
    train_end = int(TRAIN_FRAC * n)
    val_end = int((TRAIN_FRAC + VAL_FRAC) * n)
    split_of = {}
    for g in rng[:train_end]:
        split_of[g] = "train"
    for g in rng[train_end:val_end]:
        split_of[g] = "val"
    for g in rng[val_end:]:
        split_of[g] = "test"

    # Assemble rows, filtered to complete gids, tagged by split.
    frames = []
    for lbl, p in parts.items():
        p = p[p["gid"].isin(complete)].copy()
        p["split"] = p["gid"].map(split_of)
        frames.append(p)
    allrows = pd.concat(frames, ignore_index=True)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    def dist(d: pd.DataFrame) -> str:
        vc = d["label"].value_counts().to_dict()
        return "  ".join(f"{LABEL_NAMES[k]}({k})={int(vc.get(k,0))}" for k in (0, 1, 2, 3))

    print("\n=== Split statistics (4-class, group-split) ===")
    for split in ("train", "val", "test"):
        part = allrows[allrows["split"] == split][["text", "label"]]
        part = part.sample(frac=1.0, random_state=RANDOM_STATE).reset_index(drop=True)
        path = OUTPUT_DIR / f"{split}.csv"
        part.to_csv(path, index=False, encoding="utf-8-sig")
        print(f"{split:5} ({len(part):6}) -> {path}")
        print(f"  {dist(allrows[allrows['split'] == split])}")

    # Leakage assertion: no gid spans two splits (guaranteed by construction).
    spans = allrows.groupby("gid")["split"].nunique()
    assert (spans == 1).all(), "LEAKAGE: a gid appears in multiple splits!"
    print("\nLeakage check passed: every article confined to a single split.")


if __name__ == "__main__":
    main()
