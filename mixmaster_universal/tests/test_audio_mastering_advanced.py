"""Advanced mastering parameter validation and preset behavior."""
from io import BytesIO
from unittest.mock import patch

from fastapi.testclient import TestClient

from server import app

client = TestClient(app)


def submit(**fields):
    data = {"preset": "balanced", **fields}
    return client.post(
        "/api/mastering/jobs",
        data=data,
        files={"song": ("test.wav", BytesIO(b"RIFFfake-format"), "audio/wav")},
    )


def test_supported_mastering_presets():
    from audio_mastering import PRESETS
    assert {"balanced", "club", "streaming", "warm", "dynamic"} <= set(PRESETS)


def test_export_formats_reject_unknown():
    assert submit(output_format="ogg").status_code == 400


def test_invalid_advanced_settings_are_rejected():
    assert submit(mid_db="7").status_code == 400
    assert submit(presence_db="-7").status_code == 400
    assert submit(stereo_width="160").status_code == 400
    assert submit(highpass_hz="999").status_code == 400
    assert submit(compression_style="extreme").status_code == 400


def test_missing_audio_fails_validation():
    assert client.post("/api/mastering/jobs", data={"preset": "warm"}).status_code == 422


def test_job_status_provides_export_format(tmp_path):
    from audio_mastering import _jobs, _lock
    with patch("audio_mastering._prune"):
        with _lock:
            _jobs["example"] = {
                "status": "queued", "error": None, "measurements": None,
                "output_format": "mp3",
            }
        try:
            response = client.get("/api/mastering/jobs/example")
            assert response.status_code == 200
            assert response.json()["output_format"] == "mp3"
        finally:
            with _lock:
                _jobs.pop("example", None)
