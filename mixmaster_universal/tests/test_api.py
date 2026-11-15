"""Fast API validation smoke tests (no audio fixtures needed)."""
from fastapi.testclient import TestClient
from server import app

client = TestClient(app)

def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["ok"] is True

def test_invalid_song_count():
    response = client.post("/api/analyze", data={"count": 7})
    assert response.status_code == 422 or response.status_code == 400

def test_missing_uploads():
    response = client.post("/api/mix", data={"count": 10, "transition": 12})
    assert response.status_code == 422
