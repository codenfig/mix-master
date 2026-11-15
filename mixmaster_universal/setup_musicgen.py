"""One-time online download of MusicGen Small to external local model storage.

Usage: python setup_musicgen.py
MusicGen Small weights are CC BY-NC 4.0 (noncommercial).
"""
import os
from pathlib import Path


def main():
    from huggingface_hub import snapshot_download
    target = Path(os.environ.get("MIXMASTER_MUSICGEN_MODEL_DIR", "~/MixMasterAI/Models/musicgen-small")).expanduser()
    target.mkdir(parents=True, exist_ok=True)
    snapshot_download(repo_id="facebook/musicgen-small", local_dir=str(target))
    print(f"Model downloaded to: {target}")
    print("Review the model's CC BY-NC 4.0 license before use.")


if __name__ == "__main__":
    main()
