import pandas as pd

HUMAN_CSV = "pantip_dataset.csv"
AI_CSV = "ai_generated_dataset_full.csv"
OUTPUT_CSV = "combined_dataset.csv"

df_human = pd.read_csv(HUMAN_CSV)
df_ai = pd.read_csv(AI_CSV)

# Keep only text column, assign numeric label
df_human = df_human[["text"]].copy()
df_human["label"] = 0

df_ai = df_ai[["text"]].copy()
df_ai["label"] = 1

df_combined = pd.concat([df_human, df_ai], ignore_index=True)
df_combined = df_combined.sample(frac=1, random_state=42).reset_index(drop=True)

df_combined.to_csv(OUTPUT_CSV, index=False, encoding="utf-8-sig")

print(f"Human rows : {len(df_human)}")
print(f"AI rows    : {len(df_ai)}")
print(f"Total rows : {len(df_combined)}")
print(f"Saved to   : {OUTPUT_CSV}")
