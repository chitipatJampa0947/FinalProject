"""
WangchanBERTa Fine-tuning + ONNX INT8 Export
Dataset: cleaned_dataset.csv (text, label: 0=Human, 1=AI)
Target: RTX 4050 (6GB VRAM), fp16, 5 epochs
"""

import os
import numpy as np
import pandas as pd
import torch
from datasets import Dataset
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, f1_score
from transformers import (
    AutoTokenizer,
    AutoModelForSequenceClassification,
    TrainingArguments,
    Trainer,
    DataCollatorWithPadding,
    EarlyStoppingCallback,
)

# ─── Config ───────────────────────────────────────────────────────────────────
MODEL_NAME = "airesearch/wangchanberta-base-att-spm-uncased"
DATA_PATH = os.path.join(os.path.dirname(__file__), "cleaned_dataset.csv")
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "wangchanberta-ai-detector")
ONNX_PATH = os.path.join(os.path.dirname(__file__), "model.onnx")
ONNX_QUANT_PATH = os.path.join(os.path.dirname(__file__), "model_int8.onnx")

MAX_LENGTH = 416
BATCH_SIZE = 8          # 6GB VRAM safe with fp16 + max_length=416
GRAD_ACCUM = 2          # effective batch = 16
NUM_EPOCHS = 5
LR = 2e-5
SEED = 42

# ─── 1. Load & Split Data ─────────────────────────────────────────────────────
print("Loading dataset...")
df = pd.read_csv(DATA_PATH)
df = df[["text", "label"]].dropna()
df["label"] = df["label"].astype(int)
print(f"Total samples: {len(df)}  |  label dist:\n{df['label'].value_counts().to_string()}")

train_df, eval_df = train_test_split(
    df, test_size=0.15, random_state=SEED, stratify=df["label"]
)
train_ds = Dataset.from_pandas(train_df.reset_index(drop=True))
eval_ds = Dataset.from_pandas(eval_df.reset_index(drop=True))

# ─── 2. Tokenizer ─────────────────────────────────────────────────────────────
print("Loading tokenizer...")
tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME, use_fast=False)

def tokenize(batch):
    return tokenizer(
        batch["text"],
        max_length=MAX_LENGTH,
        truncation=True,
        padding=False,  # DataCollator handles padding
    )

train_ds = train_ds.map(tokenize, batched=True, remove_columns=["text"])
eval_ds = eval_ds.map(tokenize, batched=True, remove_columns=["text"])

data_collator = DataCollatorWithPadding(tokenizer=tokenizer, pad_to_multiple_of=8)

# ─── 3. Model ─────────────────────────────────────────────────────────────────
print("Loading model...")
model = AutoModelForSequenceClassification.from_pretrained(
    MODEL_NAME,
    num_labels=2,
    id2label={0: "Human", 1: "AI"},
    label2id={"Human": 0, "AI": 1},
)

# ─── 4. Metrics ───────────────────────────────────────────────────────────────
def compute_metrics(eval_pred):
    logits, labels = eval_pred
    preds = np.argmax(logits, axis=-1)
    return {
        "accuracy": accuracy_score(labels, preds),
        "f1": f1_score(labels, preds, average="weighted"),
    }

# ─── 5. Training ──────────────────────────────────────────────────────────────
training_args = TrainingArguments(
    output_dir=OUTPUT_DIR,
    num_train_epochs=NUM_EPOCHS,
    per_device_train_batch_size=BATCH_SIZE,
    per_device_eval_batch_size=BATCH_SIZE,
    gradient_accumulation_steps=GRAD_ACCUM,
    learning_rate=LR,
    weight_decay=0.01,
    warmup_steps=50,
    fp16=True,                          # RTX 4050 CUDA fp16
    eval_strategy="epoch",
    save_strategy="epoch",
    load_best_model_at_end=True,
    metric_for_best_model="f1",
    greater_is_better=True,
    logging_steps=10,
    seed=SEED,
    report_to="none",
)

trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=train_ds,
    eval_dataset=eval_ds,
    data_collator=data_collator,
    compute_metrics=compute_metrics,
    callbacks=[EarlyStoppingCallback(early_stopping_patience=2)],
)

print("Starting training...")
trainer.train()

print("\nFinal evaluation:")
metrics = trainer.evaluate()
print(metrics)

# Save fine-tuned model
trainer.save_model(OUTPUT_DIR)
tokenizer.save_pretrained(OUTPUT_DIR)
print(f"Model saved → {OUTPUT_DIR}")

# ─── 6. ONNX Export ───────────────────────────────────────────────────────────
print("\nExporting to ONNX...")
model.eval()
model.to("cpu")  # export on CPU for compatibility

# Dummy inputs — WangchanBERTa is RoBERTa-based (no token_type_ids)
dummy_input_ids = torch.zeros(1, MAX_LENGTH, dtype=torch.long)
dummy_attention_mask = torch.ones(1, MAX_LENGTH, dtype=torch.long)

# Check if model uses token_type_ids
try:
    out = model(input_ids=dummy_input_ids, attention_mask=dummy_attention_mask)
    input_names = ["input_ids", "attention_mask"]
    dummy_inputs = (dummy_input_ids, dummy_attention_mask)
    dynamic_axes = {
        "input_ids": {0: "batch", 1: "seq"},
        "attention_mask": {0: "batch", 1: "seq"},
        "logits": {0: "batch"},
    }
except Exception:
    # fallback with token_type_ids
    dummy_token_type_ids = torch.zeros(1, MAX_LENGTH, dtype=torch.long)
    input_names = ["input_ids", "attention_mask", "token_type_ids"]
    dummy_inputs = (dummy_input_ids, dummy_attention_mask, dummy_token_type_ids)
    dynamic_axes = {
        "input_ids": {0: "batch", 1: "seq"},
        "attention_mask": {0: "batch", 1: "seq"},
        "token_type_ids": {0: "batch", 1: "seq"},
        "logits": {0: "batch"},
    }

torch.onnx.export(
    model,
    dummy_inputs,
    ONNX_PATH,
    input_names=input_names,
    output_names=["logits"],
    dynamic_axes=dynamic_axes,
    opset_version=14,
    do_constant_folding=True,
)
print(f"ONNX saved → {ONNX_PATH}  ({os.path.getsize(ONNX_PATH) / 1e6:.1f} MB)")

# ─── 7. Dynamic Quantization INT8 ─────────────────────────────────────────────
print("\nApplying INT8 dynamic quantization...")
try:
    from onnxruntime.quantization import quantize_dynamic, QuantType
    quantize_dynamic(
        ONNX_PATH,
        ONNX_QUANT_PATH,
        weight_type=QuantType.QInt8,
    )
    size_orig = os.path.getsize(ONNX_PATH) / 1e6
    size_quant = os.path.getsize(ONNX_QUANT_PATH) / 1e6
    print(f"INT8 ONNX saved → {ONNX_QUANT_PATH}")
    print(f"Size: {size_orig:.1f} MB → {size_quant:.1f} MB  ({100*(1-size_quant/size_orig):.0f}% reduction)")
except ImportError:
    print("onnxruntime-tools not found. Install: pip install onnxruntime")

# ─── 8. Sanity Check ──────────────────────────────────────────────────────────
print("\nRunning inference sanity check on quantized model...")
try:
    import onnxruntime as ort

    sess = ort.InferenceSession(ONNX_QUANT_PATH, providers=["CPUExecutionProvider"])
    input_name = sess.get_inputs()[0].name
    sample_text = "บทความนี้เขียนโดย AI เพื่อทดสอบระบบตรวจจับ"
    enc = tokenizer(sample_text, return_tensors="np", max_length=MAX_LENGTH, truncation=True, padding="max_length")

    feed = {inp.name: enc[inp.name] for inp in sess.get_inputs() if inp.name in enc}
    logits = sess.run(["logits"], feed)[0]
    pred = int(np.argmax(logits))
    label_map = {0: "Human", 1: "AI"}
    print(f"Sample: '{sample_text[:50]}...'")
    print(f"Prediction: {label_map[pred]}  (logits: {logits})")
    print("\nAll done. Ready for browser inference.")
except Exception as e:
    print(f"Sanity check error: {e}")
