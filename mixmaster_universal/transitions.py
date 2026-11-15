"""Phrase-grid transition search and perceptual-proxy crossfade optimization.

Uses 4/4 beat/bar estimates, short-time loudness and spectral flux.
No learned listening model: proxy scores cannot certify musical quality.
"""
from __future__ import annotations
import numpy as np

def phrase_trim(duration, bpm, beat_offset, bars=4, max_trim=12.0):
    """Trim the intro to a plausible 4-bar phrase start, when safe."""
    if bpm is None or bpm <= 0 or beat_offset is None:
        return 0.0
    bar = 4 * 60.0 / bpm
    phrase = bars * bar
    start = float(beat_offset) + phrase
    return round(start, 4) if 0 <= start <= min(max_trim, duration * 0.12) else 0.0

def transition_metrics(outgoing, incoming, sr=44100):
    """Quantify short-time loudness discontinuity, clipping and spectral mismatch."""
    if not len(outgoing) or not len(incoming):
        return {"score": 0.0, "peak": 0.0}
    n = min(len(outgoing), len(incoming))
    a = np.asarray(outgoing[-n:], dtype=np.float32)
    b = np.asarray(incoming[:n], dtype=np.float32)
    # Bound evaluation cost to 32768 points per candidate.
    step = max(1, n // 32768)
    a, b = a[::step].mean(axis=1), b[::step].mean(axis=1)
    rms_a = float(np.sqrt(np.mean(a * a) + 1e-10))
    rms_b = float(np.sqrt(np.mean(b * b) + 1e-10))
    loudness_gap = abs(20 * np.log10(rms_a / rms_b))
    # Spectral centroid difference proxies timbral mismatch.
    def centroid(x):
        window = x[:min(len(x), 8192)]
        spec = np.abs(np.fft.rfft(window * np.hanning(len(window))))
        return float(np.dot(np.arange(len(spec)), spec) / (spec.sum() + 1e-9)) / max(1, len(spec))
    spectral_gap = abs(centroid(a) - centroid(b))
    theta = np.linspace(0, np.pi / 2, len(a), dtype=np.float32)
    overlap = a * np.cos(theta) + b * np.sin(theta)
    peak = float(np.max(np.abs(overlap)))
    score = 100 - min(60, loudness_gap * 4) - min(25, spectral_gap * 180) - (30 if peak > 0.99 else 0)
    return {"score": round(max(0, score), 1), "peak": round(peak, 4),
            "loudness_gap_db": round(loudness_gap, 2)}

def optimize_transition(outgoing, incoming, fade_frames, sr=44100, retries=3,
                        bpm=None, beat_offset=None, max_intro_seconds=24.0):
    """Find a musically plausible entry point in the incoming track.

    With reliable tempo, examine beat-aligned and 4-bar phrase candidates
    throughout a bounded intro, not just the first 750 milliseconds.
    Evaluate compatibility against the actual outgoing crossfade window.
    Without a beat grid, retain the conservative short-offset search.
    Returns (trim_frames, proxy_metrics, evaluated_candidates).
    """
    if len(outgoing) < fade_frames or len(incoming) < fade_frames + sr:
        return 0, transition_metrics(outgoing[-fade_frames:], incoming[:fade_frames], sr), 1

    maximum = min(
        len(incoming) - 2 * fade_frames,
        int(max_intro_seconds * sr),
        int(len(incoming) * 0.15),
    )
    if maximum <= 0:
        return 0, transition_metrics(outgoing[-fade_frames:], incoming[:fade_frames], sr), 1

    offsets = {0}
    valid_grid = (bpm is not None and beat_offset is not None
                  and np.isfinite(bpm) and np.isfinite(beat_offset)
                  and 50 <= bpm <= 210 and beat_offset >= 0)
    if valid_grid:
        beat = 60.0 / float(bpm)
        # Check downbeats of each bar and the 4-bar phrase boundaries.
        # Include the opening beat and avoid arbitrarily chopping mid-beat.
        for number in range(0, int(max_intro_seconds / beat) + 1, 4):
            seconds = float(beat_offset) + number * beat
            offset = round(seconds * sr)
            if 0 <= offset <= maximum:
                offsets.add(offset)
    else:
        offsets.update(int(sr * seconds) for seconds in (0.25, 0.5, 0.75)
                       if int(sr * seconds) <= maximum)
        offsets = set(sorted(offsets)[:max(1, min(retries + 1, 4))])

    candidates = []
    for offset in sorted(offsets):
        if len(incoming) - offset < 2 * fade_frames:
            continue
        metrics = transition_metrics(
            outgoing[-fade_frames:], incoming[offset:offset + fade_frames], sr)
        # Small preference for phrase boundaries; penalize cutting too deep
        # into a track unless it genuinely produces a better transition.
        phrase_bonus = 0.0
        if valid_grid and offset:
            beat_number = round((offset / sr - float(beat_offset)) / beat)
            phrase_bonus = 2.5 if beat_number % 16 == 0 else 0.7
        trim_penalty = 0.12 * offset / sr
        value = metrics["score"] + phrase_bonus - trim_penalty
        candidates.append((value, -offset, offset, metrics))

    if not candidates:
        return 0, transition_metrics(outgoing[-fade_frames:], incoming[:fade_frames], sr), 1
    best = max(candidates)
    return best[2], best[3], len(candidates)
