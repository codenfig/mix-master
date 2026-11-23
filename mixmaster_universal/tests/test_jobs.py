"""Local job queue API and lifecycle smoke tests."""
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from server import app
from jobs import Job, get_job

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

def test_internal_mix_job_status_lookup(tmp_path: Path):
    job = Job(id="sample", directory=tmp_path, status="processing", completed_tracks=2, total_tracks=5)
    with patch.dict("jobs._jobs", {"sample": job}):
        status = get_job("sample")
    assert status["completed_tracks"] == 2
    assert "directory" not in status
