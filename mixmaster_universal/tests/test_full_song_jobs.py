"""Background song job API smoke tests with a temporary offline WAV generator."""
import json
import os
import stat
import time
from pathlib import Path

from fastapi.testclient import TestClient
from server import app

client = TestClient(app)
PROJECT = {"title":"Test", "description":"Bright pop", "lyrics":"[Chorus]\nI see you",
           "voice":"female", "genre":"Pop", "output":"instrumental", "bpm":110, "minutes":2}


def test_engine_unavailable(monkeypatch):
    monkeypatch.delenv("FULL_SONG_ENGINE_EXECUTABLE", raising=False)
    response = client.post("/api/full-song/jobs", json=PROJECT)
    assert response.status_code == 503


def test_background_job_with_local_wav_engine(tmp_path, monkeypatch):
    executable = tmp_path / "make_wav"
    executable.write_text("#!/usr/bin/env python3\nimport sys,wave\nwith wave.open(sys.argv[2], 'wb') as w:\n w.setnchannels(1);w.setsampwidth(2);w.setframerate(22050);w.writeframes(b'\\x00\\x00'*22050)\n")
    executable.chmod(executable.stat().st_mode | stat.S_IXUSR)
    monkeypatch.setenv("FULL_SONG_ENGINE_EXECUTABLE", str(executable))
    monkeypatch.setenv("STORAGE_LOCAL_ROOT", str(tmp_path / "storage"))
    response = client.post("/api/full-song/jobs", json=PROJECT)
    assert response.status_code == 202
    job_id = response.json()["id"]
    for _ in range(100):
        status = client.get(f"/api/full-song/jobs/{job_id}").json()
        if status["status"] in {"completed", "failed", "cancelled"}:
            break
        time.sleep(.05)
    assert status["status"] == "completed", status
    assert status["file"]["id"]
