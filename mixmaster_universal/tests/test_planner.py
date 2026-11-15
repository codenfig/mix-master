"""Unit tests for autonomous DJ planning without audio dependencies."""
from planner import harmonic_score, plan, tempo_distance, transition_score

def track(name, bpm, key, energy):
    return {"name": name, "bpm": bpm, "key": key, "energy": energy, "duration": 120}

def test_tempo_handles_half_and_double_time():
    assert tempo_distance(70, 140) == 0
    assert tempo_distance(120, 120) == 0
    assert tempo_distance(0, 120) == 1

def test_harmonic_relationships():
    assert harmonic_score("C major", "C major") == 1
    assert harmonic_score("C major", "A minor") > harmonic_score("C major", "F# major")

def test_planner_preserves_all_tracks_and_creates_transitions():
    tracks = [
        track("warmup", 118, "A minor", 0.1),
        track("peak", 128, "G major", 0.5),
        track("middle", 122, "C major", 0.2),
        track("bridge", 124, "G major", 0.3),
        track("late", 126, "D major", 0.4),
    ]
    result = plan(tracks, transition=12)
    assert result["order"][0] == "warmup"
    assert sorted(result["order"]) == sorted(t["name"] for t in tracks)
    assert sorted(result["order_indices"]) == list(range(len(tracks)))
    assert len(result["transitions"]) == 4
    assert all(0 <= t["compatibility"] <= 100 for t in result["transitions"])
    assert all(t["crossfade_seconds"] == 12 for t in result["transitions"])
    assert 0 <= result["quality_score"] <= 100

def test_duplicate_names_remain_distinct():
    result = plan([track("same", 120, "C major", 0.1), track("same", 125, "G major", 0.2)])
    assert sorted(result["order_indices"]) == [0, 1]

def test_empty_and_single_track():
    assert plan([])["order"] == []
    assert plan([track("one", 120, "C major", 0.1)])["quality_score"] == 100

def test_score_is_stable():
    a = track("a", 120, "C major", 0.1)
    assert transition_score(a, a) == 100
