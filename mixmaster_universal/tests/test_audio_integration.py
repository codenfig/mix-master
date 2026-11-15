"""Synthetic-audio integration checks for MixMaster's analysis and MP3 rendering.

Requires FFmpeg and the project's Python dependencies. Generates original test tones;
no copyrighted tracks or external fixtures are required.
"""
from pathlib import Path
import shutil
import subprocess

import numpy as np
import pytest
import soundfile as sf

from engine import analyze, arrange, render

SR = 22050


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="FFmpeg is required")
def test_synthetic_mix_exports_stereo_mp3(tmp_path: Path):
    # 5 short original tone tracks, long enough for 4-second transitions.
    tracks = []
    for index in range(5):
        duration = 10
        t = np.arange(SR * duration, dtype=np.float32) / SR
        tone = (0.06 + index * 0.02) * np.sin(
            2 * np.pi * (220 + index * 35) * t
        )
        path = tmp_path / f"tone_{index}.wav"
        sf.write(path, tone, SR)
        info = analyze(path)
        assert info["duration"] >= 9.9
        assert info["bpm"] >= 0
        assert info["key"]
        tracks.append(info)

    output = tmp_path / "test_mix.mp3"
    render(arrange(tracks), output, transition=4)
    assert output.is_file()
    assert output.stat().st_size > 1000

    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "a:0",
         "-show_entries", "stream=channels,codec_name",
         "-of", "default=noprint_wrappers=1", str(output)],
        capture_output=True, text=True, check=True,
    )
    assert "codec_name=mp3" in probe.stdout
    assert "channels=2" in probe.stdout


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="FFmpeg is required")
def test_disk_backed_decode_and_chunked_export(tmp_path: Path):
    from engine import decode_stereo_disk, _write_audio
    sr = 22050
    t = np.arange(sr * 2, dtype=np.float32) / sr
    stereo = np.stack([0.1 * np.sin(2 * np.pi * 220 * t),
                       0.1 * np.sin(2 * np.pi * 330 * t)], axis=1)
    source = tmp_path / "stereo.wav"
    sf.write(source, stereo, sr)
    decoded_dir = tmp_path / "decoded"
    decoded_dir.mkdir()
    audio = decode_stereo_disk(source, decoded_dir, sr)
    assert isinstance(audio, np.memmap)
    assert audio.shape == stereo.shape
    output = tmp_path / "chunked.raw"
    with output.open("wb") as sink:
        _write_audio(sink, audio, chunk_frames=257)
    restored = np.fromfile(output, dtype="<f4").reshape(-1, 2)
    np.testing.assert_allclose(restored, audio, atol=1e-6)


def test_audio_signal_evaluation(tmp_path: Path):
    from engine import evaluate_raw_mix
    audio = np.full((44100, 2), 0.25, dtype="<f4")
    path = tmp_path / "signal.raw"
    audio.tofile(path)
    report = evaluate_raw_mix(path, chunk_frames=257)
    assert abs(report["peak"] - 0.25) < 1e-6
    assert abs(report["rms"] - 0.25) < 1e-6
    assert report["near_silence_fraction"] == 0
    assert report["clipping_risk"] is False
    assert report["duration_seconds"] == 1.0


def test_audio_signal_evaluation_rejects_empty_mix(tmp_path: Path):
    from engine import evaluate_raw_mix
    path = tmp_path / "empty.raw"
    path.write_bytes(b"")
    with pytest.raises(ValueError, match="Empty mix"):
        evaluate_raw_mix(path)
