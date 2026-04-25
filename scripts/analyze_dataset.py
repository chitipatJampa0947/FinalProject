import pandas as pd
import re
import json

INPUT_CSV = "cleaned_dataset.csv"
OUTPUT_JSON = "analysis_results.json"

# Label mapping from combine_dataset.py
# 0 = Human (pantip_dataset.csv)
# 1 = AI    (ai_generated_dataset_full.csv)
LABEL_MAP = {0: "Human", 1: "AI"}


def count_eng_words(text):
    return len(re.findall(r"[a-zA-Z]+", str(text)))


def count_thai_chars(text):
    return len(re.findall(r"[฀-๿]", str(text)))


df = pd.read_csv(INPUT_CSV, encoding="utf-8-sig")

df["char_len"] = df["text"].str.len()
df["eng_count"] = df["text"].apply(count_eng_words)
df["thai_count"] = df["text"].apply(count_thai_chars)
df["cs_ratio"] = df["eng_count"] / (df["eng_count"] + df["thai_count"] + 0.001)

# ---- Stats per class ----
print("=== Dataset Statistics ===")
print(f"Total rows: {len(df)}")
print()

stats = {}
for lbl, name in LABEL_MAP.items():
    sub = df[df["label"] == lbl]
    n = len(sub)
    avg_chars = round(sub["char_len"].mean(), 1)
    med_chars = round(sub["char_len"].median(), 1)
    avg_eng = round(sub["eng_count"].mean(), 2)
    avg_cs = round(sub["cs_ratio"].mean() * 100, 2)
    stats[name] = {
        "count": n,
        "avg_chars": avg_chars,
        "median_chars": med_chars,
        "avg_eng_words": avg_eng,
        "avg_cs_ratio_pct": avg_cs,
    }
    print(f"[{name}] n={n}  avg_chars={avg_chars}  median_chars={med_chars}  avg_eng={avg_eng}  cs%={avg_cs}")

# ---- Train/Val/Test split (70:15:15) ----
total = len(df)
train = round(total * 0.70)
val = round(total * 0.15)
test = total - train - val

split_overall = {"train": train, "val": val, "test": test}

split_per_class = {}
print()
print("=== Train/Val/Test Split (70:15:15) ===")
print(f"Overall — train={train}, val={val}, test={test}")
for lbl, name in LABEL_MAP.items():
    sub = df[df["label"] == lbl]
    n = len(sub)
    t = round(n * 0.70)
    v = round(n * 0.15)
    te = n - t - v
    split_per_class[name] = {"train": t, "val": v, "test": te}
    print(f"[{name}] train={t}, val={v}, test={te}")

# ---- Code-switching examples ----
print()
print("=== Best Code-switching Examples ===")
examples = {}
for lbl, name in LABEL_MAP.items():
    sub = df[
        (df["label"] == lbl)
        & (df["char_len"] > 150)
        & (df["char_len"] < 1200)
        & (df["eng_count"] >= 4)
        & (df["cs_ratio"] > 0.04)
        & (df["cs_ratio"] < 0.50)
    ].copy()
    # Closest to 15% English = natural code-switching
    sub["naturalness_score"] = abs(sub["cs_ratio"] - 0.15)
    best = sub.nsmallest(5, "naturalness_score")
    examples[name] = []
    print(f"\n--- {name} ---")
    for i, (_, row) in enumerate(best.iterrows(), 1):
        entry = {
            "text": row["text"][:500],
            "char_len": int(row["char_len"]),
            "eng_words": int(row["eng_count"]),
            "cs_ratio_pct": round(float(row["cs_ratio"]) * 100, 1),
        }
        examples[name].append(entry)
        print(f"  [{i}] cs={entry['cs_ratio_pct']}% | eng={entry['eng_words']} words | len={entry['char_len']}")
        print(f"      {entry['text'][:120]}...")

# ---- Save JSON ----
result = {
    "stats_per_class": stats,
    "split_overall": split_overall,
    "split_per_class": split_per_class,
    "codeswitching_examples": examples,
}
with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
    json.dump(result, f, ensure_ascii=False, indent=2)

print()
print(f"Saved results to {OUTPUT_JSON}")
