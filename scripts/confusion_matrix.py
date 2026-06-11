"""Compute the 4-class confusion matrix + per-class metrics on data/test.csv.

Loads the fine-tuned model from <root>/model_output/ (no retraining) and dumps
a permanent record to <root>/model_output/confusion_matrix.json — used by the
thesis report and CLAUDE.md performance section.

Run from scripts/ cwd:  python confusion_matrix.py
"""

import datetime
import json
import os

import numpy as np
import pandas as pd
import torch
from datasets import Dataset
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    precision_recall_fscore_support,
)
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    DataCollatorWithPadding,
    Trainer,
    TrainingArguments,
)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(SCRIPT_DIR)
MODEL_DIR = os.path.join(ROOT_DIR, "model_output")
DATA_DIR = os.path.join(ROOT_DIR, "data")
OUT_PATH = os.path.join(MODEL_DIR, "confusion_matrix.json")

MAX_LENGTH = 400  # MUST match train_model.py
LABEL_NAMES = ["Human", "GPT", "Gemini", "Other"]


def main():
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Device: {device.upper()}")

    tokenizer = AutoTokenizer.from_pretrained(MODEL_DIR)
    model = AutoModelForSequenceClassification.from_pretrained(MODEL_DIR)

    test_df = pd.read_csv(os.path.join(DATA_DIR, "test.csv")).dropna(subset=["text"])
    test_df["text"] = test_df["text"].astype(str)
    print(f"Test size: {len(test_df)}")

    ds = Dataset.from_pandas(test_df[["text", "label"]])
    ds = ds.map(
        lambda ex: tokenizer(ex["text"], padding=False, truncation=True, max_length=MAX_LENGTH),
        batched=True,
        desc="Tokenizing",
    )
    ds = ds.remove_columns([c for c in ("text", "__index_level_0__") if c in ds.column_names])

    trainer = Trainer(
        model=model,
        args=TrainingArguments(
            output_dir=os.path.join(ROOT_DIR, "logs"),
            per_device_eval_batch_size=16,
            fp16=device == "cuda",
            report_to="none",
        ),
        processing_class=tokenizer,
        data_collator=DataCollatorWithPadding(tokenizer=tokenizer),
    )

    pred = trainer.predict(ds)
    y_true = pred.label_ids
    y_pred = pred.predictions.argmax(-1)

    cm = confusion_matrix(y_true, y_pred, labels=[0, 1, 2, 3])
    prec, rec, f1, support = precision_recall_fscore_support(y_true, y_pred, labels=[0, 1, 2, 3])
    macro_p, macro_r, macro_f1, _ = precision_recall_fscore_support(y_true, y_pred, average="macro")
    acc = accuracy_score(y_true, y_pred)

    print("\nConfusion matrix (rows=true, cols=pred):")
    header = "          " + "".join(f"{n:>8}" for n in LABEL_NAMES)
    print(header)
    for i, name in enumerate(LABEL_NAMES):
        print(f"{name:>10}" + "".join(f"{int(v):>8}" for v in cm[i]))

    print("\nPer-class metrics:")
    for i, name in enumerate(LABEL_NAMES):
        print(f"  {name:>7}: precision={prec[i]:.4f} recall={rec[i]:.4f} f1={f1[i]:.4f} n={int(support[i])}")
    print(f"\nAccuracy={acc:.4f}  macro-F1={macro_f1:.4f}  macro-P={macro_p:.4f}  macro-R={macro_r:.4f}")

    record = {
        "model_dir": "model_output/",
        "dataset": "data/test.csv",
        "test_size": int(len(test_df)),
        "max_length": MAX_LENGTH,
        "evaluated_at": datetime.datetime.now().isoformat(timespec="seconds"),
        "labels": LABEL_NAMES,
        "confusion_matrix_rows_true_cols_pred": cm.tolist(),
        "per_class": {
            name: {
                "precision": float(prec[i]),
                "recall": float(rec[i]),
                "f1": float(f1[i]),
                "support": int(support[i]),
            }
            for i, name in enumerate(LABEL_NAMES)
        },
        "accuracy": float(acc),
        "macro_f1": float(macro_f1),
        "macro_precision": float(macro_p),
        "macro_recall": float(macro_r),
    }
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(record, f, ensure_ascii=False, indent=2)
    print(f"\nWritten -> {OUT_PATH}")


if __name__ == "__main__":
    main()
