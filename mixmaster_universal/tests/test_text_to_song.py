"""Smoke tests for the offline text-to-song composer.

Run from mixmaster_universal/: python -m unittest discover -s tests
"""
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
import soundfile as sf

from text_to_song import SongRequest, compose


class TextToSongTests(unittest.TestCase):
    def test_afrobeat_wav_is_audible_and_deterministic(self):
        request = SongRequest(text="Tonight we dance beneath the stars\nFeel the rhythm in our hearts",
                              genre="afrobeat", bpm=110, key="A", bars=8)
        with tempfile.TemporaryDirectory() as temp:
            first, second = Path(temp) / "first.wav", Path(temp) / "second.wav"
            compose(request, first)
            compose(request, second)
            a, rate = sf.read(first)
            b, _ = sf.read(second)
            self.assertEqual(rate, 22050)
            self.assertGreater(float(np.max(np.abs(a))), .05)
            self.assertTrue(np.array_equal(a, b))
            self.assertGreater(len(a) / rate, 17)

    def test_invalid_genre_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaises(ValueError):
                compose(SongRequest(text="test", genre="unsupported"), Path(temp) / "song.wav")

    def test_all_genres_render(self):
        with tempfile.TemporaryDirectory() as temp:
            for genre in ("afrobeat", "amapiano", "bongo", "hiphop", "house", "pop"):
                with self.subTest(genre=genre):
                    path = Path(temp) / (genre + ".wav")
                    compose(SongRequest(text="test", genre=genre, bars=4), path)
                    self.assertTrue(path.stat().st_size > 1000)


if __name__ == "__main__":
    unittest.main()
