"""Offline MusicGen Small instrumental preview generator.

CLI: python musicgen_adapter.py project.json output.wav
Runs with local model weights only. Does not synthesize vocals or full songs.
"""
import json
import os
import sys
from pathlib import Path


def build_prompt(project):
    """Describe the actual musical ingredients instead of asking for an entire song."""
    genre = str(project.get("genre") or "pop").strip()[:80]
    description = str(project.get("description") or "").strip()[:1200]
    bpm = max(60, min(180, int(project.get("bpm") or 110)))
    return (
        f"High quality instrumental {genre} music, around {bpm} BPM. "
        "A clear steady drum groove, defined bass line, melodic instrumental hook, "
        "harmonically coherent chords, and a consistent rhythm. "
        f"{description}. "
        "Instrumental recording with drums, bass, and musical instruments only. "
        "No vocals, no speech, no crowd noise, no sound effects."
    )[:1800]


def audio_to_samples(audio, np):
    """Convert MusicGen's [batch, channels, samples] tensor to soundfile layout."""
    samples = audio[0].detach().cpu().float().numpy()
    if samples.ndim == 1:
        samples = samples[:, None]
    elif samples.ndim == 2:
        samples = samples.T
    else:
        raise ValueError("MusicGen returned an unsupported audio tensor shape.")
    if samples.shape[1] not in (1, 2) or not samples.shape[0]:
        raise ValueError("MusicGen returned invalid audio channels or length.")
    if not np.isfinite(samples).all():
        raise ValueError("MusicGen produced non-finite audio samples.")
    return samples


def finish_audio(samples, rate, np):
    """Gentle gain and short edge fades; do not compress or hide model artifacts."""
    peak = float(np.max(np.abs(samples)))
    if peak < 1e-6:
        raise ValueError("MusicGen produced silent audio.")
    # Avoid clipping while retaining dynamics; never boost extremely quiet noise.
    if peak > 0.95:
        samples = samples * (0.95 / peak)
    fade_frames = min(int(rate * 0.08), len(samples) // 2)
    if fade_frames:
        fade = np.linspace(0.0, 1.0, fade_frames, dtype=np.float32)
        samples[:fade_frames] *= fade[:, None]
        samples[-fade_frames:] *= fade[::-1, None]
    return np.clip(samples, -1.0, 1.0)


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

    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    processor = AutoProcessor.from_pretrained(str(model_dir), local_files_only=True)
    model = MusicgenForConditionalGeneration.from_pretrained(str(model_dir), local_files_only=True)
    requested_device = os.environ.get("MIXMASTER_MUSICGEN_DEVICE", "auto").strip().lower()
    if requested_device not in {"auto", "cpu", "mps"}:
        raise SystemExit("MIXMASTER_MUSICGEN_DEVICE must be auto, cpu or mps.")
    if requested_device == "mps" and not torch.backends.mps.is_available():
        raise SystemExit("MPS was requested but is unavailable on this Mac.")
    device = ("mps" if torch.backends.mps.is_available() else "cpu") if requested_device == "auto" else requested_device
    try:
        model = model.to(device)
    except (RuntimeError, NotImplementedError):
        device = "cpu"
        model = model.to(device)
    model.eval()
    inputs = processor(text=[build_prompt(project)], padding=True, return_tensors="pt").to(device)

    # ~50 tokens/second. 512 tokens (~10 s) is a reasonable initial quality check
    # on a slower Mac; 1000 tokens (~20 s) takes significantly longer.
    tokens = max(128, min(1500, int(os.environ.get("MIXMASTER_MUSICGEN_MAX_TOKENS", "512"))))
    guidance = max(1.0, min(5.0, float(os.environ.get("MIXMASTER_MUSICGEN_GUIDANCE_SCALE", "3.0"))))
    print(f"MusicGen: device={device}, tokens={tokens}, guidance={guidance}", flush=True)
    with torch.inference_mode():
        audio = model.generate(
            **inputs, do_sample=True, guidance_scale=guidance, max_new_tokens=tokens
        )
    rate = int(model.config.audio_encoder.sampling_rate)
    raw_samples = audio_to_samples(audio, np)
    raw_peak = float(np.max(np.abs(raw_samples)))
    raw_rms = float(np.sqrt(np.mean(np.square(raw_samples, dtype=np.float64))))
    print(f"MusicGen decoded audio: {len(raw_samples) / rate:.2f}s, channels={raw_samples.shape[1]}, peak={raw_peak:.4f}, rms={raw_rms:.4f}", flush=True)
    if os.environ.get("MIXMASTER_MUSICGEN_SAVE_RAW", "0") == "1":
        raw_path = Path(os.environ.get("MIXMASTER_MUSICGEN_RAW_PATH", "~/MixMasterAI/musicgen_raw_diagnostic.wav")).expanduser()
        raw_path.parent.mkdir(parents=True, exist_ok=True)
        sf.write(raw_path, raw_samples, rate, subtype="FLOAT")
        print(f"MusicGen raw diagnostic: {raw_path}", flush=True)
    samples = finish_audio(raw_samples, rate, np)
    sf.write(sys.argv[2], samples, rate, subtype="PCM_16")
    print(f"MusicGen: wrote {len(samples) / rate:.1f}s of audio", flush=True)


if __name__ == "__main__":
    main()
