"""MixMaster audio-processing API smoke tests. No model is required."""
from fastapi.testclient import TestClient
from server import app
import generated_storage

client = TestClient(app)

def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["ok"] is True

def test_music_mix_requires_audio():
    r = client.post("/api/music-mix/analyze", data={"progression": "build-up"})
    assert r.status_code == 422

def test_mastering_requires_audio():
    r = client.post("/api/mastering/jobs", data={"preset": "balanced"})
    assert r.status_code == 422

def test_music_generation_routes_are_removed():
    for path in ("/api/full-song/engine", "/api/lyrics/status"):
        assert client.get(path).status_code == 404
    assert client.post("/api/text-to-song", json={}).status_code == 404

def test_shared_processing_storage_retained():
    assert "audio_mastering" in generated_storage.CATEGORIES
    assert "stem_splitter" in generated_storage.CATEGORIES
    assert "vocal_remover" in generated_storage.CATEGORIES
    assert "full_song" not in generated_storage.CATEGORIES
    assert "text_to_song" not in generated_storage.CATEGORIES
