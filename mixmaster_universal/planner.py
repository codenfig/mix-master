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
    # Search for a coherent complete set rather than forcing the quietest song
    # to open. Evaluate every possible opener and use a bounded two-step
    # lookahead to avoid an attractive transition that creates a dead end.
    energies = [max(0.0, float(t.get("energy", 0))) for t in tracks]
    sorted_energy = sorted(energies)
    low_energy = sorted_energy[max(0, (len(tracks) - 1) // 4)]
    high_energy = sorted_energy[min(len(tracks) - 1, (3 * len(tracks)) // 4)]
    spread = max(high_energy - low_energy, 0.0001)

    def energy_value(index: int) -> float:
        return energies[index]

    def edge(a: int, b: int) -> float:
        compatibility = transition_score(tracks[a], tracks[b])
        change = (energy_value(b) - energy_value(a)) / spread
        # Prefer smooth rises; allow modest drops for a natural DJ journey.
        arc = 9.0 * max(-1.0, min(1.0, change))
        drop_penalty = 17.0 * max(0.0, -change - 0.25)
        jump_penalty = 12.0 * max(0.0, abs(change) - 0.85)
        return compatibility + arc - drop_penalty - jump_penalty

    def build(start_index: int) -> list[int]:
        order = [start_index]
        remaining = set(range(len(tracks))) - {start_index}
        while remaining:
            current = order[-1]
            def candidate_value(candidate: int) -> tuple[float, float, int]:
                immediate = edge(current, candidate)
                later = [edge(candidate, next_index) for next_index in remaining if next_index != candidate]
                # Look ahead without making the immediate transition irrelevant.
                future = max(later) if later else 0.0
                return (immediate + 0.30 * future, immediate, -candidate)
            chosen = max(sorted(remaining), key=candidate_value)
            order.append(chosen)
            remaining.remove(chosen)
        return order

    def route_score(order: list[int]) -> float:
        if len(order) == 1:
            return 0.0
        transitions_total = sum(edge(a, b) for a, b in zip(order, order[1:]))
        # A warm-up opening is preferred but never mandatory.
        opener_penalty = 5.0 * max(0.0, (energy_value(order[0]) - low_energy) / spread)
        return transitions_total - opener_penalty

    best_order = max((build(i) for i in range(len(tracks))),
                     key=lambda order: (route_score(order), -order[0]))
    # Refine each full route with deterministic pairwise swaps. Keep the first
    # song flexible: a better opener may emerge during optimization.
    for _ in range(2):
        improved = False
        baseline = route_score(best_order)
        for i in range(len(best_order)):
            for j in range(i + 1, len(best_order)):
                candidate = best_order.copy()
                candidate[i], candidate[j] = candidate[j], candidate[i]
                score = route_score(candidate)
                if score > baseline + 0.0001:
                    best_order, baseline, improved = candidate, score, True
        if not improved:
            break
    ordered = [(i, tracks[i]) for i in best_order]
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
        "strategy": "autonomous opening-track and transition selection",
        "note": "The opening song and all subsequent songs are selected automatically using tempo, key, energy arc and lookahead. Compatibility scores are metadata estimates, not audible quality ratings.",
    }
