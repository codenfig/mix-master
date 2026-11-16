"""Test MusicGen's local EnCodec round trip independently of text generation.

Usage: python diagnose_musicgen_codec.py
Outputs an original reference WAV and an EnCodec reconstruction WAV.
Only uses locally installed MusicGen weights; no network calls.
"""
import os
from pathlib import Path


def main():
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    import numpy as np
    import soundfile as sf
    import torch
    from transformers import MusicgenForConditionalGeneration

    root = Path(os.environ.get("MIXMASTER_MUSICGEN_MODEL_DIR", "~/MixMasterAI/Models/musicgen-small")).expanduser()
    if not (root / "config.json").is_file():
        raise SystemExit(f"Missing local MusicGen model at {root}")
    output_dir = Path(os.environ.get("MIXMASTER_CODEC_DIAGNOSTIC_DIR", "~/MixMasterAI/codec-diagnostic")).expanduser()
    output_dir.mkdir(parents=True, exist_ok=True)
    print("Loading MusicGen audio codec on CPU...", flush=True)
    model = MusicgenForConditionalGeneration.from_pretrained(str(root), local_files_only=True)
    codec = model.audio_encoder.cpu().eval()
    rate = int(codec.config.sampling_rate)
    duration = 2.0
    times = np.arange(int(rate * duration), dtype=np.float32) / rate
    # A simple two-tone signal is easier to compare than generated music.
    signal = (0.18 * np.sin(2 * np.pi * 220 * times) +
              0.10 * np.sin(2 * np.pi * 440 * times)).astype(np.float32)
    channels = int(codec.config.audio_channels)
    source = np.tile(signal, (channels, 1))
    reference = output_dir / "reference.wav"
    reconstructed = output_dir / "codec_reconstructed.wav"
    sf.write(reference, source.T, rate, subtype="PCM_16")
    with torch.inference_mode():
        encoded = codec.encode(torch.from_numpy(source).unsqueeze(0))
        decoded = codec.decode(encoded.audio_codes, encoded.audio_scales).audio_values
    result = decoded[0].cpu().float().numpy().T
    result = result[:len(signal)]
    if result.ndim == 1:
        result = result[:, None]
    if not np.isfinite(result).all():
        raise RuntimeError("MusicGen EnCodec produced non-finite samples.")
    sf.write(reconstructed, result, rate, subtype="PCM_16")
    print(f"Reference: {reference}", flush=True)
    print(f"Codec reconstruction: {reconstructed}", flush=True)
    print(f"Codec rate={rate}, channels={channels}, frames={len(result)}", flush=True)
    print("Listen to both files. This isolates the codec from text-to-music generation.", flush=True)


if __name__ == "__main__":
    main()
