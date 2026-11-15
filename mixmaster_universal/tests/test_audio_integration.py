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
