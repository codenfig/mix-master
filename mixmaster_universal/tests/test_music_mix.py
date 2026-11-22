"""Pure ordering tests for the separate Music Mix workflow."""
from music_mix import energy_order
import pytest


def tracks():
    return [
        {"name": "medium", "energy": 0.5},
        {"name": "high", "energy": 0.9},
        {"name": "low", "energy": 0.1},
        {"name": "middle", "energy": 0.6},
    ]


def test_build_up_is_default_and_ascending():
    assert energy_order(tracks()) == [2, 0, 3, 1]
    assert energy_order(tracks(), "build-up") == [2, 0, 3, 1]


def test_cool_down_descends():
    assert energy_order(tracks(), "cool-down") == [1, 3, 0, 2]


def test_other_modes_include_every_song_once():
    for mode in ("wave", "balanced"):
        assert sorted(energy_order(tracks(), mode)) == list(range(4))


def test_invalid_mode():
    with pytest.raises(ValueError):
        energy_order(tracks(), "invalid")
