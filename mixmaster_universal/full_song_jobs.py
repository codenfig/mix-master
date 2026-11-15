"""Single-worker local full-song jobs with cooperative cancellation.

In-process jobs are intentionally development-only; restart loses job state.
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Event, Lock
from time import monotonic
from uuid import uuid4
import json
import subprocess
import wave

from fastapi import APIRouter, HTTPException
from generated_storage import save_generated

router = APIRouter()
_pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="mixmaster-song")
_lock = Lock()
_jobs = {}
MAX_JOBS = 100


def _snapshot(job):
    return {k: v for k, v in job.items() if k not in {"cancel", "process"}}


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
    _pool.submit(_execute, job_id, project, executable, arrangement)
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
            proc = subprocess.Popen([str(executable), str(input_file), str(output_file)],
                                    cwd=str(root), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            with _lock:
                job["process"] = proc
            try:
                while proc.poll() is None:
                    if job["cancel"].wait(0.25):
                        proc.terminate()
                        try:
                            proc.wait(timeout=3)
                        except subprocess.TimeoutExpired:
                            proc.kill()
                            proc.wait()
                        raise InterruptedError("Generation cancelled.")
                    if monotonic() - job["started"] > 300:
                        proc.kill()
                        proc.wait()
                        raise TimeoutError("Local music engine exceeded five minutes.")
                if job["cancel"].is_set():
                    raise InterruptedError("Generation cancelled.")
                if proc.returncode:
                    raise RuntimeError("Local engine failed. Check your model installation.")
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
        with _lock:
            job.update(status="failed", stage="failed", error=str(exc) if isinstance(exc, (RuntimeError, TimeoutError)) else "Song generation failed.")
    finally:
        with _lock:
            if job["started"] is not None:
                job["elapsed_seconds"] = round(monotonic() - job["started"], 1)


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
            job["status"] = "cancelling"
            job["stage"] = "cancelling"
        return _snapshot(job)
