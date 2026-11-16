"""Offline MusicGen Small adapter for MixMaster Full Song Studio.

CLI: python musicgen_adapter.py project.json output.wav
Requires locally downloaded model weights; never fetches during inference.
Produces an instrumental preview of at most 25 seconds, not singing.
"""
import json
import os
import sys
from pathlib import Path


def main():
    if len(sys.argv) != 3:
        raise SystemExit("Usage: musicgen_adapter.py project.json output.wav")
    model_dir = Path(os.environ.get("MIXMASTER_MUSICGEN_MODEL_DIR", "~/MixMasterAI/Models/musicgen-small")).expanduser()
    if not model_dir.is_dir() or not (model_dir / "config.json").is_file():
        raise SystemExit("MusicGen model is missing. Download weights using setup_musicgen.py first.")
    project = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    if project.get("output") != "instrumental":
        raise SystemExit("MusicGen Small supports instrumental preview only; choose Instrumental.")
    try:
        import numpy as np
        import soundfile as sf
        import torch
        from transformers import AutoProcessor, MusicgenForConditionalGeneration
    except ImportError as exc:
        raise SystemExit("Install local MusicGen dependencies (see FULL_SONG_ENGINE.md).") from exc
    # Local-only loading; prevent accidental remote requests.
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    processor = AutoProcessor.from_pretrained(str(model_dir), local_files_only=True)
    model = MusicgenForConditionalGeneration.from_pretrained(str(model_dir), local_files_only=True)
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    try:
        model = model.to(device)
    except (RuntimeError, NotImplementedError):
        device = "cpu"
        model = model.to(device)
    model.eval()
    prompt = (f"Instrumental {project['genre']} music, {project['bpm']} BPM. "
              f"{project['description']}. No singing, no spoken words.")[:1800]
    inputs = processor(text=[prompt], padding=True, return_tensors="pt").to(device)
    with torch.inference_mode():
        # A shorter preview is useful on Intel Macs where generation can be slow.
        # MusicGen is limited to 30 seconds; 1000 tokens is roughly 20 seconds.
        tokens = max(64, min(1500, int(os.environ.get("MIXMASTER_MUSICGEN_MAX_TOKENS", "1000"))))
        audio = model.generate(**inputs, do_sample=True, guidance_scale=3.0, max_new_tokens=tokens)
    samples = audio[0].detach().cpu().float().numpy()
    if samples.ndim == 2:
        samples = samples.T
    samples = np.clip(samples, -1.0, 1.0)
    rate = int(model.config.audio_encoder.sampling_rate)
    sf.write(sys.argv[2], samples, rate, subtype="PCM_16")


if __name__ == "__main__":
    main()
