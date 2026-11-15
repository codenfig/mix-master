"""Tests for phrase grid and automatic transition candidate evaluation."""
import numpy as np
from transitions import phrase_trim, transition_metrics, optimize_transition

def test_phrase_grid_4_bars():
    assert abs(phrase_trim(180, 120, 0.25) - 8.25) < 0.001
    assert phrase_trim(20, 120, 0.25) == 0
    assert phrase_trim(180, 0, None) == 0

def test_transition_metrics_prefer_similar_loudness():
    t = np.arange(44100, dtype=np.float32) / 44100
    tone = np.stack([0.15 * np.sin(2 * np.pi * 220 * t)] * 2, axis=1)
    similar = transition_metrics(tone, tone)
    quiet = transition_metrics(tone, tone * 0.02)
    assert similar["score"] > quiet["score"]
    assert similar["loudness_gap_db"] < 0.1

def test_optimizer_tries_multiple_candidates_and_returns_valid_offset():
    sr = 1000
    t = np.arange(6000, dtype=np.float32) / sr
    outgoing = np.stack([0.2 * np.sin(2 * np.pi * 50 * t)] * 2, axis=1)
    incoming = outgoing.copy()
    offset, metrics, attempts = optimize_transition(outgoing[-1000:], incoming, 1000, sr=sr)
    assert 0 <= offset <= 750
    assert attempts >= 2
    assert 0 <= metrics["score"] <= 100

def test_optimizer_handles_short_audio():
    audio = np.zeros((100, 2), dtype=np.float32)
    offset, metrics, attempts = optimize_transition(audio, audio, 100, sr=1000)
    assert offset == 0
    assert attempts == 1

def test_optimizer_can_choose_later_beat_aligned_entry():
    sr = 1000
    fade = 1000
    t = np.arange(fade, dtype=np.float32) / sr
    outgoing_mono = 0.3 * np.sin(2 * np.pi * 30 * t)
    outgoing = np.stack([outgoing_mono, outgoing_mono], axis=1)
    incoming = np.zeros((24000, 2), dtype=np.float32)
    # At 120 BPM, a four-bar boundary occurs at 8 seconds.
    incoming[8000:9000] = outgoing
    offset, metrics, attempts = optimize_transition(
        outgoing, incoming, fade, sr=sr, bpm=120, beat_offset=0)
    assert offset == 8000
    assert attempts > 4
    assert metrics["score"] > 90
