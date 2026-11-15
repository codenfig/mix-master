"""Deterministic, explainable autonomous DJ transition planner.

No chatbot or external model API. Plans are advisory until a renderer supports
beat-grid alignment and audible quality evaluation.
"""
from __future__ import annotations
import math

CIRCLE = {
    "C major": 0, "A minor": 0, "G major": 1, "E minor": 1,
    "D major": 2, "B minor": 2, "A major": 3, "F# minor": 3,
    "E major": 4, "C# minor": 4, "B major": 5, "G# minor": 5,
    "F# major": 6, "D# minor": 6, "C# major": 7, "A# minor": 7,
    "G# major": 8, "F minor": 8, "D# major": 9, "C minor": 9,
    "A# major": 10, "G minor": 10, "F major": 11, "D minor": 11,
}

def tempo_distance(a: float, b: float) -> float:
    """Smallest fractional tempo distance allowing half/double-time readings."""
    if a <= 0 or b <= 0:
        return 1.0
    return min(abs(math.log2(a / b) - shift) for shift in (-1, 0, 1))

def harmonic_score(a: str, b: str) -> float:
    if a == b:
        return 1.0
    if a not in CIRCLE or b not in CIRCLE:
        return 0.5
    distance = abs(CIRCLE[a] - CIRCLE[b])
    distance = min(distance, 12 - distance)
    return 0.92 if distance == 0 else 0.82 if distance == 1 else 0.5 if distance == 2 else 0.15

def transition_score(left: dict, right: dict) -> float:
    tempo = max(0.0, 1.0 - tempo_distance(float(left.get("bpm", 0)), float(right.get("bpm", 0))) / 0.22)
    harmonic = harmonic_score(str(left.get("key", "")), str(right.get("key", "")))
    e1, e2 = max(0.0, float(left.get("energy", 0))), max(0.0, float(right.get("energy", 0)))
    energy = max(0.0, 1.0 - abs(math.log1p(e1) - math.log1p(e2)) / 0.4)
    return round(100 * (0.43 * tempo + 0.37 * harmonic + 0.20 * energy), 1)

def plan(tracks: list[dict], transition: int = 12) -> dict:
    """Choose a gradually rising energy path with transition compatibility.

    Uses a bounded greedy lookahead rather than factorial search. A stable
    original index keeps duplicate filenames distinct internally.
    """
    if not tracks:
        return {"order": [], "transitions": [], "quality_score": 0, "strategy": "energy-aware harmonic planning"}
    remaining = list(enumerate(tracks))
    remaining.sort(key=lambda item: (float(item[1].get("energy", 0)), item[0]))
    ordered = [remaining.pop(0)]
    while remaining:
        prev = ordered[-1][1]
        low = float(remaining[0][1].get("energy", 0))
        # Maintain a rising energy arc; prioritize compatible transitions within a small energy window.
        threshold = low * 1.25 + 0.0001
        candidates = [item for item in remaining if float(item[1].get("energy", 0)) <= threshold]
        best = max(candidates, key=lambda item: (transition_score(prev, item[1]), -item[0]))
        ordered.append(best)
        remaining.remove(best)
    transitions = []
    for i in range(len(ordered) - 1):
        a, b = ordered[i][1], ordered[i + 1][1]
        score = transition_score(a, b)
        duration = min(float(a.get("duration", transition * 3)), float(b.get("duration", transition * 3)))
        safe_transition = max(1, min(transition, int(duration / 2) - 1))
        transitions.append({
            "from_index": ordered[i][0], "to_index": ordered[i + 1][0],
            "from": a.get("name", ""), "to": b.get("name", ""),
            "compatibility": score, "crossfade_seconds": safe_transition,
            "tempo_distance": round(tempo_distance(float(a.get("bpm", 0)), float(b.get("bpm", 0))), 3),
            "harmonic_score": round(harmonic_score(str(a.get("key", "")), str(b.get("key", ""))), 2),
            "warning": "Low compatibility; preview transition" if score < 45 else None,
        })
    return {
        "order": [item[1].get("name", "") for item in ordered],
        "order_indices": [item[0] for item in ordered],
        "transitions": transitions,
        "quality_score": round(sum(t["compatibility"] for t in transitions) / len(transitions), 1) if transitions else 100.0,
        "strategy": "energy-aware harmonic planning",
        "note": "Scores estimate metadata compatibility, not audible mix quality. Rendering uses crossfades and bounded tempo matching; beat-grid synchronization is not implemented.",
    }
