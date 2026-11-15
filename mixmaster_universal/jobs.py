"""Bounded in-process mix job queue for single-instance local development.

Not a distributed job system: restarts lose jobs and temporary output.
"""
from __future__ import annotations
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path
from threading import Lock
from time import time
from uuid import uuid4
import shutil
import tempfile

from engine import render
from planner import plan

MAX_JOBS = 8
JOB_TTL = 3600
_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="mixmaster")
_lock = Lock()
_jobs: dict[str, "Job"] = {}

@dataclass
class Job:
    id: str
    directory: Path
    status: str = "queued"
    completed_tracks: int = 0
    total_tracks: int = 0
    error: str | None = None
    metrics: dict | None = None
    created: float = field(default_factory=time)
    updated: float = field(default_factory=time)

    def public(self):
        return {
            "id": self.id, "status": self.status,
            "completed_tracks": self.completed_tracks,
            "total_tracks": self.total_tracks,
            "error": self.error, "metrics": self.metrics,
        }

def _prune():
    now = time()
    for key, job in list(_jobs.items()):
        if job.status in {"done", "failed"} and now - job.updated > JOB_TTL:
            shutil.rmtree(job.directory, ignore_errors=True)
            del _jobs[key]

def create_job(analysis: list[dict], transition: int, directory: Path, mastering: str = "balanced") -> str:
    with _lock:
        _prune()
        if len(_jobs) >= MAX_JOBS:
            raise RuntimeError("Mix queue is full; try again later.")
        job_id = uuid4().hex
        job = Job(id=job_id, directory=directory, total_tracks=len(analysis))
        _jobs[job_id] = job
    _executor.submit(_run, job_id, analysis, transition, mastering)
    return job_id

def _run(job_id: str, analysis: list[dict], transition: int, mastering: str = "balanced"):
    with _lock:
        job = _jobs[job_id]
        job.status = "processing"
        job.updated = time()
    def progress(done, total):
        with _lock:
            job.completed_tracks = done
            job.total_tracks = total
            job.updated = time()
    try:
        ordered = [analysis[i] for i in plan(analysis, transition)["order_indices"]]
        metrics = render(ordered, job.directory / "mix.mp3", transition=transition, progress=progress, mastering=mastering)
        with _lock:
            job.metrics = metrics
            job.status = "done"
            job.updated = time()
    except Exception:
        with _lock:
            job.error = "Audio processing failed; verify the tracks and FFmpeg installation."
            job.status = "failed"
            job.updated = time()
        shutil.rmtree(job.directory, ignore_errors=True)

def get_job(job_id: str) -> dict | None:
    with _lock:
        _prune()
        job = _jobs.get(job_id)
        return job.public() if job else None

def get_download(job_id: str) -> Path | None:
    with _lock:
        _prune()
        job = _jobs.get(job_id)
        if job and job.status == "done":
            path = job.directory / "mix.mp3"
            return path if path.is_file() else None
    return None

def allocate_directory() -> Path:
    return Path(tempfile.mkdtemp(prefix="mixmaster_job_"))
