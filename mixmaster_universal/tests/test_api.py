"""API validation smoke tests; no audio fixtures required."""
from fastapi.testclient import TestClient
from server import app

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["ok"] is True


def test_missing_uploads():
    response = client.post("/api/mix", data={"count": 10, "transition": 12})
    assert response.status_code == 422


def test_song_count_validation():
    from server import validate_settings
    from fastapi import HTTPException
    for count in (5, 10, 20):
        validate_settings(count, 12)
    try:
        validate_settings(7, 12)
        assert False, "Expected validation failure"
    except HTTPException as exc:
        assert exc.status_code == 400


def test_transition_validation():
    from server import validate_settings
    from fastapi import HTTPException
    for transition in (4, 12, 32):
        validate_settings(10, transition)
    try:
        validate_settings(10, 33)
        assert False, "Expected validation failure"
    except HTTPException as exc:
        assert exc.status_code == 400
