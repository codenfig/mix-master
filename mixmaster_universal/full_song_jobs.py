"""Single-worker local full-song jobs with cooperative cancellation.

In-process jobs are intentionally development-only; restart loses job state.
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Event, Lock
import os
import signal
from time import monotonic
from uuid import uuid4
import json
import logging
import subprocess
import wave

from fastapi import APIRouter, HTTPException
from generated_storage import save_generated

logger = logging.getLogger(__name__)
router = APIRouter()
_pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="mixmaster-song")
_lock = Lock()
_jobs = {}
MAX_JOBS = 100
ENGINE_TIMEOUT = min(max(int(os.environ.get("FULL_SONG_JOB_TIMEOUT_SECONDS", "1200")), 60), 7200)


def _snapshot(job):
    return {k: v for k, v in job.items() if k not in {"cancel", "process", "started"}}


def submit(project, executable, arrangement):
    with _lock:
        # Reject concurrent jobs rather than queue unlimited memory-heavy models.
        if any(j["status"] in {"queued", "running", "cancelling"} for j in _jobs.values()):
            raise HTTPException(429, "Another song is being generated. Wait or cancel it first.")
        if len(_jobs) >= MAX_JOBS:
            for key in list(_jobs):
                if _jobs[key]["status"] not in {"queued", "running", "cancelling"}:
                    del _jobs[key]
                    break
        job_id = uuid4().hex
        job = {"id": job_id, "status": "queued", "stage": "waiting", "elapsed_seconds": 0,
               "error": None, "file": None, "download_url": None,
               "cancel": Event(), "process": None, "started": None}
        _jobs[job_id] = job
    try:
        _pool.submit(_execute, job_id, project, executable, arrangement)
    except RuntimeError as exc:
        with _lock:
            _jobs.pop(job_id, None)
        raise HTTPException(503, "Song worker is shutting down.") from exc
    return _snapshot(job)


def _execute(job_id, project, executable, arrangement):
    with _lock:
        job = _jobs[job_id]
        if job["cancel"].is_set():
            job.update(status="cancelled", stage="cancelled")
            return
        job.update(status="running", stage="generating", started=monotonic())
    try:
        with TemporaryDirectory(prefix="mixmaster_song_job_") as temp:
            root = Path(temp)
            input_file, output_file = root / "project.json", root / "output.wav"
            payload = dict(project)
            payload["arrangement"] = arrangement
            input_file.write_text(json.dumps(payload), encoding="utf-8")
            log_file = root / "engine.log"
            with log_file.open("wb") as log:
                proc = subprocess.Popen([str(executable), str(input_file), str(output_file)],
                                        cwd=str(root), stdout=log, stderr=subprocess.STDOUT,
                                        start_new_session=True)
            with _lock:
                job["process"] = proc
                cancelled_before_launch = job["cancel"].is_set()
            try:
                if cancelled_before_launch:
                    _stop_process(proc)
                    raise InterruptedError("Generation cancelled.")
                while proc.poll() is None:
                    if job["cancel"].wait(0.25):
                        _stop_process(proc)
                        raise InterruptedError("Generation cancelled.")
                    if monotonic() - job["started"] > (int(os.environ.get("FULL_SONG_VOCAL_TIMEOUT_SECONDS", str(ENGINE_TIMEOUT))) if project.get("output") != "instrumental" else ENGINE_TIMEOUT):
                        _stop_process(proc)
                        raise TimeoutError("Music engine exceeded the configured generation time limit.")
                if job["cancel"].is_set():
                    raise InterruptedError("Generation cancelled.")
                if proc.returncode:
                    details = log_file.read_text(encoding="utf-8", errors="replace")[-1200:].strip()
                    raise RuntimeError("Local engine failed: " + (details or "Check your model installation."))
                with _lock:
                    job["stage"] = "validating"
                if not output_file.is_file() or output_file.stat().st_size < 100:
                    raise RuntimeError("Engine did not produce audio.")
                with wave.open(str(output_file), "rb") as wav:
                    if wav.getnframes() <= 0 or wav.getframerate() < 8000 or wav.getnchannels() not in (1, 2) or wav.getcomptype() != "NONE":
                        raise RuntimeError("Engine must produce uncompressed PCM WAV.")
                if job["cancel"].is_set():
                    raise InterruptedError("Generation cancelled.")
                with _lock:
                    job["stage"] = "saving"
                saved = save_generated(output_file, "full_song", "MixMaster_Full_Song.wav", "audio/wav")
                with _lock:
                    job.update(status="completed", stage="completed", file=saved,
                               download_url=f"/api/generated-files/{saved['id']}/download")
            finally:
                with _lock:
                    job["process"] = None
    except InterruptedError:
        with _lock:
            job.update(status="cancelled", stage="cancelled")
    except Exception as exc:
        logger.exception("Full song job %s failed at stage %s", job_id, job["stage"])
        with _lock:
            job.update(status="failed", stage="failed", error=str(exc) if isinstance(exc, (RuntimeError, TimeoutError)) else "Song generation failed. See backend logs for details.")
    finally:
        with _lock:
            if job["started"] is not None:
                job["elapsed_seconds"] = round(monotonic() - job["started"], 1)


def _stop_process(proc):
    """Stop the entire model process group, including child workers."""
    if proc.poll() is not None:
        return
    try:
        os.killpg(proc.pid, signal.SIGTERM)
    except ProcessLookupError:
        return
    try:
        proc.wait(timeout=3)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        proc.wait()


def status(job_id):
    with _lock:
        job = _jobs.get(job_id)
        if job is None:
            raise HTTPException(404, "Job not found or server restarted.")
        result = _snapshot(job)
        if job["started"] is not None and job["status"] in {"running", "cancelling"}:
            result["elapsed_seconds"] = round(monotonic() - job["started"], 1)
        return result


def cancel(job_id):
    with _lock:
        job = _jobs.get(job_id)
        if job is None:
            raise HTTPException(404, "Job not found or server restarted.")
        if job["status"] in {"queued", "running", "cancelling"}:
            job["cancel"].set()
            if job["status"] == "queued":
                job.update(status="cancelled", stage="cancelled")
            else:
                job.update(status="cancelling", stage="cancelling")
        return _snapshot(job)
