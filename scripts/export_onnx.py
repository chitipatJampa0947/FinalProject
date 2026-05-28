"""
Standalone ONNX export + INT8 quantization.
Loads fine-tuned model from <project_root>/model_output/ (train_model.py output) — no retraining.
Uses optimum (proper transformers ONNX exporter).
"""

import os
import shutil
import numpy as np

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(SCRIPT_DIR)
MODEL_DIR = os.path.join(ROOT_DIR, "model_output")
ONNX_DIR = os.path.join(SCRIPT_DIR, "onnx_model")
ONNX_QUANT_DIR = os.path.join(SCRIPT_DIR, "onnx_model_int8")

# ─── 1. Export to ONNX via optimum ────────────────────────────────────────────
print("Exporting fine-tuned model to ONNX via optimum...")
from optimum.onnxruntime import ORTModelForSequenceClassification
from transformers import AutoTokenizer

try:
    tokenizer = AutoTokenizer.from_pretrained(MODEL_DIR)
except Exception:
    print("Local tokenizer incomplete, loading from HF hub...")
    tokenizer = AutoTokenizer.from_pretrained("airesearch/wangchanberta-base-att-spm-uncased")
ort_model = ORTModelForSequenceClassification.from_pretrained(MODEL_DIR, export=True)

if os.path.isdir(ONNX_DIR):
    shutil.rmtree(ONNX_DIR, ignore_errors=True)
ort_model.save_pretrained(ONNX_DIR)
tokenizer.save_pretrained(ONNX_DIR)

onnx_file = os.path.join(ONNX_DIR, "model.onnx")
print(f"ONNX saved → {onnx_file}  ({os.path.getsize(onnx_file)/1e6:.1f} MB)")

# ─── 2. Dynamic Quantization INT8 ─────────────────────────────────────────────
print("\nApplying INT8 dynamic quantization...")
from optimum.onnxruntime import ORTQuantizer
from optimum.onnxruntime.configuration import AutoQuantizationConfig

quantizer = ORTQuantizer.from_pretrained(ONNX_DIR)
qconfig = AutoQuantizationConfig.avx2(is_static=False, per_channel=False)

if os.path.isdir(ONNX_QUANT_DIR):
    shutil.rmtree(ONNX_QUANT_DIR, ignore_errors=True)
quantizer.quantize(save_dir=ONNX_QUANT_DIR, quantization_config=qconfig)
tokenizer.save_pretrained(ONNX_QUANT_DIR)

# Find quantized file (optimum names it model_quantized.onnx)
quant_files = [f for f in os.listdir(ONNX_QUANT_DIR) if f.endswith(".onnx")]
quant_file = os.path.join(ONNX_QUANT_DIR, quant_files[0])
size_orig = os.path.getsize(onnx_file) / 1e6
size_quant = os.path.getsize(quant_file) / 1e6
print(f"INT8 saved → {quant_file}")
print(f"Size: {size_orig:.1f} MB → {size_quant:.1f} MB  ({100*(1-size_quant/size_orig):.0f}% reduction)")

# ─── 3. Sanity check via ONNX Runtime ─────────────────────────────────────────
print("\nSanity check on quantized model...")
import onnxruntime as ort

sess = ort.InferenceSession(quant_file, providers=["CPUExecutionProvider"])
input_names = [i.name for i in sess.get_inputs()]
print(f"Input names: {input_names}")

samples = [
    ("วันนี้อากาศดีมาก ไปเดินเล่นที่สวนกับครอบครัว สนุกมาก", "expect Human"),
    ("บทความนี้นำเสนอการวิเคราะห์เชิงลึกเกี่ยวกับแนวโน้มของเทคโนโลยีปัญญาประดิษฐ์ในอนาคต", "expect AI"),
]
label_map = {0: "Human", 1: "AI"}

for text, note in samples:
    enc = tokenizer(text, return_tensors="np", max_length=416, truncation=True, padding="max_length")
    feed = {n: enc[n].astype(np.int64) for n in input_names if n in enc}
    logits = sess.run(None, feed)[0]
    probs = np.exp(logits) / np.exp(logits).sum(-1, keepdims=True)
    pred = int(np.argmax(logits))
    print(f"  '{text[:50]}...' → {label_map[pred]} (p={probs[0][pred]:.3f}) [{note}]")

print("\nDone. Files for browser inference:")
print(f"  model: {quant_file}")
print(f"  tokenizer: {ONNX_QUANT_DIR}/sentencepiece.bpe.model + tokenizer.json")
