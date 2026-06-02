"""
Standalone evaluation: load fine-tuned model from <root>/model_output/ and
score it on <root>/data/test.csv. No retraining.

Reproduces the exact eval path of train_model.py (same MAX_LENGTH, same
compute_metrics) so the numbers match the original training run, then dumps
them to <root>/model_output/metrics.json for a permanent on-disk record.

Run from scripts/ cwd:  python evaluate_model.py
"""

import os
import json
import datetime

import torch
import pandas as pd
from datasets import Dataset
from transformers import (
    AutoTokenizer,
    AutoModelForSequenceClassification,
    TrainingArguments,
    Trainer,
    DataCollatorWithPadding,
)
from sklearn.metrics import accuracy_score, precision_recall_fscore_support

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(SCRIPT_DIR)
MODEL_DIR = os.path.join(ROOT_DIR, "model_output")
DATA_DIR = os.path.join(ROOT_DIR, "data")
METRICS_PATH = os.path.join(MODEL_DIR, "metrics.json")

MAX_LENGTH = 400  # MUST match train_model.py so metrics are comparable


def compute_metrics(pred):
    labels = pred.label_ids
    preds = pred.predictions.argmax(-1)
    precision, recall, f1, _ = precision_recall_fscore_support(
        labels, preds, average="macro"
    )
    acc = accuracy_score(labels, preds)
    return {"accuracy": acc, "f1": f1, "precision": precision, "recall": recall}


def main():
    print("=" * 50)
    print("AI Detect-Thai: Evaluating model_output/ on test.csv")
    print("=" * 50)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Device: {device.upper()}")

    print(f"\nLoading model + tokenizer from {MODEL_DIR}")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_DIR)
    model = AutoModelForSequenceClassification.from_pretrained(MODEL_DIR)

    test_path = os.path.join(DATA_DIR, "test.csv")
    print(f"Loading test set: {test_path}")
    test_df = pd.read_csv(test_path).dropna(subset=["text"])
    test_df["text"] = test_df["text"].astype(str)
    print(f"Test size: {len(test_df)}")

    test_dataset = Dataset.from_pandas(test_df[["text", "label"]])

    def tokenize_function(examples):
        return tokenizer(
            examples["text"], padding=False, truncation=True, max_length=MAX_LENGTH
        )

    print("Tokenizing...")
    tokenized_test = test_dataset.map(
        tokenize_function, batched=True, desc="Tokenizing Test"
    )
    tokenized_test = tokenized_test.remove_columns(["text"])
    if "__index_level_0__" in tokenized_test.column_names:
        tokenized_test = tokenized_test.remove_columns(["__index_level_0__"])

    data_collator = DataCollatorWithPadding(tokenizer=tokenizer)

    eval_args = TrainingArguments(
        output_dir=os.path.join(ROOT_DIR, "logs"),
        per_device_eval_batch_size=16,
        fp16=True if device == "cuda" else False,
        report_to="none",
    )

    trainer = Trainer(
        model=model,
        args=eval_args,
        processing_class=tokenizer,
        data_collator=data_collator,
        compute_metrics=compute_metrics,
    )

    print("\nRunning evaluation on test set...")
    results = trainer.evaluate(eval_dataset=tokenized_test, metric_key_prefix="test")

    print("\nFinal Test Metrics:")
    for key, value in results.items():
        if isinstance(value, float):
            print(f"  {key}: {value:.4f}")
        else:
            print(f"  {key}: {value}")

    # Build a clean, slide-ready record.
    record = {
        "model": "airesearch/wangchanberta-base-att-spm-uncased (fine-tuned)",
        "model_dir": "model_output/",
        "dataset": "data/test.csv",
        "test_size": len(test_df),
        "max_length": MAX_LENGTH,
        "evaluated_at": datetime.datetime.now().isoformat(timespec="seconds"),
        "accuracy": results.get("test_accuracy"),
        "f1": results.get("test_f1"),
        "precision": results.get("test_precision"),
        "recall": results.get("test_recall"),
        "raw": results,
    }

    with open(METRICS_PATH, "w", encoding="utf-8") as f:
        json.dump(record, f, ensure_ascii=False, indent=2)
    print(f"\nMetrics written -> {METRICS_PATH}")


if __name__ == "__main__":
    main()
