"""Small unit checks for local MusicGen output handling (no model download)."""
import numpy as np
import pytest
from musicgen_adapter import build_prompt, audio_to_samples, finish_audio


class FakeTensor:
    def __init__(self, array):
        self.array = array

    def detach(self):
        return self

    def cpu(self):
        return self

    def float(self):
        return self

    def numpy(self):
        return self.array


def test_prompt_contains_musical_structure():
    prompt = build_prompt({"genre": "Afro-pop", "bpm": 110, "description": "warm guitar"})
    assert "steady drum groove" in prompt
    assert "warm guitar" in prompt
    assert "No vocals" in prompt


def test_stereo_tensor_layout():
    audio = [FakeTensor(np.ones((2, 320), dtype=np.float32) * 0.1)]
    assert audio_to_samples(audio, np).shape == (320, 2)


def test_mono_tensor_layout():
    audio = [FakeTensor(np.ones((1, 320), dtype=np.float32) * 0.1)]
    assert audio_to_samples(audio, np).shape == (320, 1)


def test_fades_and_peak_limit():
    samples = np.ones((1000, 1), dtype=np.float32)
    result = finish_audio(samples, 1000, np)
    assert result.shape == samples.shape
    assert result[0, 0] == 0
    assert result[-1, 0] == 0
    assert np.max(np.abs(result)) <= 0.95 + 1e-5


def test_nonfinite_audio_rejected():
    with pytest.raises(ValueError, match="non-finite"):
        audio_to_samples([FakeTensor(np.array([[np.nan, 0.1]]))], np)
