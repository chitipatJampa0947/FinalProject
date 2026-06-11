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
    EarlyStoppingCallback
)
from sklearn.metrics import accuracy_score, precision_recall_fscore_support

# Configuration
MODEL_NAME = "airesearch/wangchanberta-base-att-spm-uncased"
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(SCRIPT_DIR)
DATA_DIR = os.path.join(ROOT_DIR, "data")
OUTPUT_DIR = os.path.join(ROOT_DIR, "model_output")

# Hyperparameters (Optimized for 6GB VRAM RTX 4050)
BATCH_SIZE = 8
GRAD_ACCUM_STEPS = 2
EPOCHS = 4
LEARNING_RATE = 1e-5      # V3: lowered from 2e-5 to reduce overfitting
WARMUP_RATIO = 0.1        # V3: 10% LR warmup for stabler early training
MAX_LENGTH = 400  # WangchanBERTa max is 416, 400 is safe and fast

# 4-class vendor classification (V3)
ID2LABEL = {0: "Human", 1: "GPT", 2: "Gemini", 3: "Other"}
LABEL2ID = {v: k for k, v in ID2LABEL.items()}
NUM_LABELS = len(ID2LABEL)

def compute_metrics(pred):
    labels = pred.label_ids
    preds = pred.predictions.argmax(-1)
    precision, recall, f1, _ = precision_recall_fscore_support(labels, preds, average='macro')
    acc = accuracy_score(labels, preds)
    return {
        'accuracy': acc,
        'f1': f1,
        'precision': precision,
        'recall': recall
    }

def load_and_prepare_data(tokenizer):
    print("Loading datasets...")

    # Load CSVs
    train_df = pd.read_csv(os.path.join(DATA_DIR, "train.csv"))
    val_df = pd.read_csv(os.path.join(DATA_DIR, "val.csv"))
    test_df = pd.read_csv(os.path.join(DATA_DIR, "test.csv"))

    # Check for NaN and drop
    train_df = train_df.dropna(subset=['text'])
    val_df = val_df.dropna(subset=['text'])
    test_df = test_df.dropna(subset=['text'])

    # Ensure text is string
    train_df['text'] = train_df['text'].astype(str)
    val_df['text'] = val_df['text'].astype(str)
    test_df['text'] = test_df['text'].astype(str)

    print(f"Train size: {len(train_df)}, Val size: {len(val_df)}, Test size: {len(test_df)}")

    # Convert to HuggingFace Datasets
    train_dataset = Dataset.from_pandas(train_df[['text', 'label']])
    val_dataset = Dataset.from_pandas(val_df[['text', 'label']])
    test_dataset = Dataset.from_pandas(test_df[['text', 'label']])

    # Tokenization function
    def tokenize_function(examples):
        return tokenizer(
            examples["text"],
            padding=False, # We pad dynamically using DataCollator
            truncation=True,
            max_length=MAX_LENGTH
        )

    print("Tokenizing datasets (this might take a minute)...")
    tokenized_train = train_dataset.map(tokenize_function, batched=True, desc="Tokenizing Train")
    tokenized_val = val_dataset.map(tokenize_function, batched=True, desc="Tokenizing Val")
    tokenized_test = test_dataset.map(tokenize_function, batched=True, desc="Tokenizing Test")

    # Remove text column as model only needs input_ids, attention_mask, label
    tokenized_train = tokenized_train.remove_columns(["text"])
    tokenized_val = tokenized_val.remove_columns(["text"])
    tokenized_test = tokenized_test.remove_columns(["text"])

    # In case there's an __index_level_0__ column from pandas
    if "__index_level_0__" in tokenized_train.column_names:
        tokenized_train = tokenized_train.remove_columns(["__index_level_0__"])
        tokenized_val = tokenized_val.remove_columns(["__index_level_0__"])
        tokenized_test = tokenized_test.remove_columns(["__index_level_0__"])

    return tokenized_train, tokenized_val, tokenized_test

def main():
    print("="*50)
    print("AI Detect-Thai: Training WangchanBERTa")
    print("="*50)
    
    # 1. Check Hardware
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Device: {device.upper()}")
    if device == "cuda":
        print(f"GPU Name: {torch.cuda.get_device_name(0)}")
    else:
        print("WARNING: Training on CPU. This will be very slow!")
        
    # 2. Load Tokenizer and Model
    print(f"\nLoading tokenizer and model: {MODEL_NAME}")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    
    # 4-class vendor classification (0: Human, 1: GPT, 2: Gemini, 3: Other)
    model = AutoModelForSequenceClassification.from_pretrained(
        MODEL_NAME,
        num_labels=NUM_LABELS,
        id2label=ID2LABEL,
        label2id=LABEL2ID,
    )
    
    # 3. Prepare Data
    train_dataset, val_dataset, test_dataset = load_and_prepare_data(tokenizer)
    
    # Dynamically pad sentences to the longest one in the batch
    data_collator = DataCollatorWithPadding(tokenizer=tokenizer)
    
    # 4. Define Training Arguments
    training_args = TrainingArguments(
        output_dir=OUTPUT_DIR,
        learning_rate=LEARNING_RATE,
        per_device_train_batch_size=BATCH_SIZE,
        per_device_eval_batch_size=BATCH_SIZE * 2, # Eval can take larger batches
        gradient_accumulation_steps=GRAD_ACCUM_STEPS,
        num_train_epochs=EPOCHS,
        weight_decay=0.01,
        warmup_ratio=WARMUP_RATIO,      # V3: LR warmup
        eval_strategy="epoch",          # Evaluate at the end of every epoch
        save_strategy="epoch",          # Save model at the end of every epoch
        save_total_limit=2,             # Keep only the 2 best models
        load_best_model_at_end=True,    # Load the best model based on metric
        metric_for_best_model="f1",     # Use F1 score to determine the best
        greater_is_better=True,
        fp16=True if device == "cuda" else False, # Enable Mixed Precision if GPU
        logging_dir=os.path.join(ROOT_DIR, "logs"),
        logging_steps=100,
        report_to="none"                # Disable wandb/tensorboard for simplicity
    )
    
    # 5. Initialize Trainer
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=val_dataset,
        processing_class=tokenizer,
        data_collator=data_collator,
        compute_metrics=compute_metrics,
        callbacks=[EarlyStoppingCallback(early_stopping_patience=2)] # Stop if no improvement
    )
    
    # 6. Train!
    print("\nStarting training...")
    trainer.train()
    
    # 7. Evaluate on validation set
    print("\nFinal Evaluation on Validation Set:")
    val_results = trainer.evaluate()
    for key, value in val_results.items():
        if isinstance(value, float):
            print(f"  {key}: {value:.4f}")
        else:
            print(f"  {key}: {value}")

    # 8. Evaluate on held-out test set
    print("\nFinal Evaluation on Test Set:")
    test_results = trainer.evaluate(eval_dataset=test_dataset, metric_key_prefix="test")
    for key, value in test_results.items():
        if isinstance(value, float):
            print(f"  {key}: {value:.4f}")
        else:
            print(f"  {key}: {value}")

    # 9. Persist metrics to disk so every run keeps a permanent record.
    metrics_path = os.path.join(OUTPUT_DIR, "model_metrics.json")
    metrics_record = {
        "model": MODEL_NAME,
        "model_dir": "model_output/",
        "trained_at": datetime.datetime.now().isoformat(timespec="seconds"),
        "hyperparameters": {
            "batch_size": BATCH_SIZE,
            "grad_accum_steps": GRAD_ACCUM_STEPS,
            "effective_batch_size": BATCH_SIZE * GRAD_ACCUM_STEPS,
            "epochs": EPOCHS,
            "learning_rate": LEARNING_RATE,
            "warmup_ratio": WARMUP_RATIO,
            "max_length": MAX_LENGTH,
        },
        "validation": val_results,
        "test": test_results,
    }
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    with open(metrics_path, "w", encoding="utf-8") as f:
        json.dump(metrics_record, f, ensure_ascii=False, indent=2)
    print(f"Metrics saved to {metrics_path}")

    # 10. Save the final model
    print(f"\nSaving final model to {OUTPUT_DIR}")
    trainer.save_model(OUTPUT_DIR)
    tokenizer.save_pretrained(OUTPUT_DIR)
    print("Training Complete!")

if __name__ == "__main__":
    main()
