"""Compare decoded MusicGen WAV with exported WAV without changing either file.

Usage: python diagnose_musicgen_audio.py RAW.wav EXPORTED.wav
"""
import argparse
import json
from pathlib import Path

import numpy as np
import soundfile as sf


def analyze(path):
    data, rate = sf.read(str(path), dtype="float32", always_2d=True)
    if data.size == 0:
        raise ValueError(f"{path}: empty audio")
    mono = data.mean(axis=1, dtype=np.float64)
    rms = float(np.sqrt(np.mean(mono ** 2)))
    peak = float(np.max(np.abs(data)))
    clip_fraction = float(np.mean(np.abs(data) >= 0.999))
    # A high zero-crossing rate can indicate noise, but is not definitive.
    zcr = float(np.mean((mono[1:] >= 0) != (mono[:-1] >= 0))) if len(mono) > 1 else 0.0
    return {
        "file": str(path),
        "sample_rate": rate,
        "channels": int(data.shape[1]),
        "duration_seconds": round(len(data) / rate, 3),
        "rms": round(rms, 6),
        "peak": round(peak, 6),
        "clipped_sample_fraction": round(clip_fraction, 6),
        "zero_crossing_rate": round(zcr, 6),
    }


def compare(raw_path, exported_path):
    raw = analyze(raw_path)
    exported = analyze(exported_path)
    return {
        "raw": raw,
        "exported": exported,
        "interpretation": (
            "These metrics cannot establish musical quality. Listen to both WAVs. "
            "If both sound distorted, investigate MusicGen inference, model weights, "
            "and decoding. If only the exported file sounds distorted, investigate "
            "post-processing, storage, and playback."
        ),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("raw", type=Path)
    parser.add_argument("exported", type=Path)
    args = parser.parse_args()
    print(json.dumps(compare(args.raw, args.exported), indent=2))


if __name__ == "__main__":
    main()
