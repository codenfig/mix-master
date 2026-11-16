"""Offline songwriter-review regression tests: no Ollama or paid API needed."""
import unittest

from lyrics_quality import inspect_lyrics, build_refinement_prompt


class LyricsQualityTests(unittest.TestCase):
    def test_missing_sections_are_reported(self):
        result = inspect_lyrics("We will find our way\nUnder the stars", "standard")
        self.assertTrue(any("[Chorus]" in issue for issue in result["issues"]))
        self.assertTrue(any("[Verse]" in issue for issue in result["issues"]))
        self.assertEqual(result["line_count"], 2)

    def test_structured_draft_is_recognized(self):
        lyrics = (
            "[Verse 1]\nThe city wakes in amber light\nThe rivers find a way\n"
            "We walk together through the night\nWe greet another day\n"
            "[Chorus]\nOur hearts are beating side by side\n"
            "The dawn is on our side\nWe sing until the shadows fade\n"
            "And let our hopes be made\n[Bridge]\nWe learn to begin again"
        )
        result = inspect_lyrics(lyrics)
        self.assertEqual(result["sections"], ["Verse 1", "Chorus", "Bridge"])
        self.assertEqual(result["line_count"], 9)
        self.assertEqual(result["issues"], [])

    def test_short_structure_does_not_require_bridge(self):
        result = inspect_lyrics("[Verse 1]\nA\n[Chorus]\nB", "short")
        self.assertFalse(any("Bridge" in issue for issue in result["issues"]))

    def test_long_lines_are_flagged(self):
        long_line = " ".join(["melody"] * 19)
        result = inspect_lyrics(f"[Verse 1]\n{long_line}\n[Chorus]\nHello", "short")
        self.assertTrue(any("15 words" in issue for issue in result["issues"]))

    def test_refinement_prompt_preserves_language_and_draft(self):
        prompt = build_refinement_prompt(
            lyrics="[Chorus]\nNakuona", topic="Hope", genre="Bongo Flava",
            mood="Joyful", language="Swahili", feedback="Needs more verses",
        )
        self.assertIn("Language: Swahili", prompt)
        self.assertIn("[Chorus]\nNakuona", prompt)
        self.assertIn("Needs more verses", prompt)
        self.assertIn("Respond ONLY", prompt)


if __name__ == "__main__":
    unittest.main()
