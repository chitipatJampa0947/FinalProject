import pandas as pd
import re

INPUT_CSV = "combined_dataset.csv"
OUTPUT_CSV = "cleaned_dataset.csv"

df = pd.read_csv(INPUT_CSV)


def clean_text(text: str) -> str:
    if not isinstance(text, str):
        return text

    # Remove "สวัสดี gang!" variants at the start of text
    # Covers: สวัสดี gang! / สวัสดีค่ะ gang! / สวัสดีค่า gang! / สวัสดีgang! etc.
    text = re.sub(
        r'^สวัสดี(?:ค่ะ|ค่า|ครับ)?\s*(?:gang|crew|everyone|friends|fans)[!\！]\s*',
        '',
        text,
        flags=re.IGNORECASE,
    )

    # Remove English AI preambles at the start
    text = re.sub(
        r'^(?:Here(?:\s+is|\s+are)\b[^.\n]*[.\n]|'
        r'Certainly[!,]?\s*|'
        r'Sure[!,]\s*|'
        r'Of\s+course[!,]?\s*|'
        r'Absolutely[!,]?\s*|'
        r'Below\s+(?:is|are)\b[^.\n]*[.\n]|'
        r'As\s+requested[,.]?\s*)',
        '',
        text,
        flags=re.IGNORECASE,
    )

    # Remove translation sections: (Translation: ...) — single or multi-line
    text = re.sub(r'\n*\(Translation:[^)]*\)', '', text)

    # Remove standalone Translation: header lines
    text = re.sub(
        r'\n*(?:Translation|Thai Translation|English Translation)\s*:\s*\n',
        '\n',
        text,
        flags=re.IGNORECASE,
    )

    # Strip leading/trailing whitespace
    text = text.strip()

    return text


before_count = len(df)
df['text'] = df['text'].apply(clean_text)

# Drop rows that became empty after cleaning
df = df[df['text'].str.strip().ne('')]
after_count = len(df)

df.to_csv(OUTPUT_CSV, index=False, encoding='utf-8-sig')

print(f"Input rows  : {before_count}")
print(f"Output rows : {after_count}")
print(f"Dropped     : {before_count - after_count}")
print(f"Saved to    : {OUTPUT_CSV}")
