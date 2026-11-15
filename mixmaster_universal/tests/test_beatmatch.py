"""Tempo matching regression tests on original synthetic audio."""
import numpy as np
from engine import match_tempo

def test_matching_close_tempos_preserves_pitch():
    sr = 22050
    t = np.arange(sr * 2, dtype=np.float32) / sr
    audio = np.stack([np.sin(2 * np.pi * 440 * t), np.sin(2 * np.pi * 440 * t)], axis=1).astype(np.float32)
    matched, applied = match_tempo(audio, 120, 124)
    assert applied
    assert matched.shape[1] == 2
    assert len(matched) < len(audio)
    # FFT peak near original 440 Hz; time-stretch must not act as resampling.
    spectrum = np.abs(np.fft.rfft(matched[:, 0]))
    peak = np.fft.rfftfreq(len(matched), 1 / sr)[np.argmax(spectrum)]
    assert abs(peak - 440) < 12

def test_matching_skips_large_or_unknown_changes():
    audio = np.zeros((2000, 2), dtype=np.float32)
    assert match_tempo(audio, 90, 130)[1] is False
    assert match_tempo(audio, 0, 130)[1] is False

def test_matching_respects_double_time():
    sr = 22050
    t = np.arange(sr, dtype=np.float32) / sr
    audio = np.stack([np.sin(2 * np.pi * 220 * t)] * 2, axis=1).astype(np.float32)
    assert match_tempo(audio, 60, 123)[1] is True

def test_beat_phase_trim_aligns_next_beat():
    from engine import beat_aligned_trim
    bpm = 120
    # Crossfade begins at t=8, outgoing beats at 0.1, 0.6, ...
    # The next outgoing beat is 0.1 seconds into the crossfade.
    trim = beat_aligned_trim(12, 4, 0.1, 0.3, bpm)
    assert abs(trim - 0.2) < 1e-6

def test_beat_phase_trim_skips_unreliable_inputs():
    from engine import beat_aligned_trim
    assert beat_aligned_trim(12, 4, None, 0.2, 120) == 0
    assert beat_aligned_trim(12, 4, 0.1, None, 120) == 0
    assert beat_aligned_trim(12, 4, 0.1, 0.2, 0) == 0
