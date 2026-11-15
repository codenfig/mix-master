"""Local job queue API and lifecycle smoke tests."""
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from server import app
from jobs import Job

client = TestClient(app)

def test_unknown_job_returns_404():
    assert client.get("/api/jobs/does-not-exist").status_code == 404
    assert client.get("/api/jobs/does-not-exist/download").status_code == 404

def test_job_public_status_has_no_file_paths(tmp_path: Path):
    job = Job(id="sample", directory=tmp_path, total_tracks=5)
    status = job.public()
    assert status["status"] == "queued"
    assert status["total_tracks"] == 5
    assert "directory" not in status

def test_job_status_endpoint(tmp_path: Path):
    job = Job(id="sample", directory=tmp_path, status="processing", completed_tracks=2, total_tracks=5)
    with patch("server.get_job", return_value=job.public()):
        response = client.get("/api/jobs/sample")
    assert response.status_code == 200
    assert response.json()["completed_tracks"] == 2
