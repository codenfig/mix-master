"""Pure arrangement planner tests; no model download required."""
from song_arrangement import arrangement


def test_explicit_sections_and_duration():
    result = arrangement("[Verse 1]\nHello\n[Pre-Chorus]\nRise\n[Chorus]\nI see you", 110, 3)
    assert [s["name"] for s in result["sections"]] == ["Verse 1", "Pre-Chorus", "Chorus"]
    assert result["total_bars"] == round(180 * 110 / 240)
    assert abs(result["estimated_seconds"] - 180) < 240 / 110
    assert result["sections"][0]["start_bar"] == 1
    assert result["sections"][1]["start_bar"] == result["sections"][0]["bars"] + 1


def test_default_sections():
    result = arrangement("Just lyrics without headings", 120, 2)
    assert len(result["sections"]) >= 5
    assert result["total_bars"] == 60
    assert all(s["bars"] > 0 for s in result["sections"])


def test_no_unrecognized_headings():
    result = arrangement("[Not A Section]\nHi\n[Chorus]\nSing", 100, 3)
    assert len(result["sections"]) == 1
    assert result["sections"][0]["name"] == "Chorus"
