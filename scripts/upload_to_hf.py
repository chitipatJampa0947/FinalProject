"""
Upload fine-tuned ONNX model to Hugging Face Hub.
Run: python upload_to_hf.py
Requires: pip install huggingface_hub
          huggingface-cli login
"""

import os
from huggingface_hub import HfApi, create_repo

HF_USERNAME = "Chitipat0947"
REPO_NAME = "wangchanberta-ai-detector"
REPO_ID = f"{HF_USERNAME}/{REPO_NAME}"
FOLDER = os.path.join(os.path.dirname(__file__), "onnx_model_int8")

api = HfApi()

print(f"Creating repo: {REPO_ID}")
create_repo(REPO_ID, exist_ok=True, private=False)

files = os.listdir(FOLDER)
print(f"Uploading {len(files)} files from {FOLDER}...")

for filename in files:
    filepath = os.path.join(FOLDER, filename)
    size_mb = os.path.getsize(filepath) / 1e6
    print(f"  → {filename} ({size_mb:.1f} MB)...")
    api.upload_file(
        path_or_fileobj=filepath,
        path_in_repo=filename,
        repo_id=REPO_ID,
    )

print(f"\nDone! Model available at:")
print(f"  https://huggingface.co/{REPO_ID}")
