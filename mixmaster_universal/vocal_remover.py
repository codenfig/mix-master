"""Background vocal separation with status polling and streaming download."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Lock
from time import time
from uuid import uuid4
import subprocess
import sys

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

router = APIRouter()
ALLOWED = {".mp3", ".wav", ".flac", ".m4a", ".ogg", ".aac"}
MAX_BYTES = 200 * 1024 * 1024
TTL_SECONDS = 2 * 60 * 60
_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="vocal-remover")
_jobs: dict[str, dict] = {}
_lock = Lock()


def _cleanup_expired():
    now = time()
    expired = []
    with _lock:
        for key, job in list(_jobs.items()):
            if job["status"] in {"complete", "failed"} and now - job["updated"] > TTL_SECONDS:
                expired.append(_jobs.pop(key))
    for job in expired:
        job["temp"].cleanup()


def _run(job_id: str):
    with _lock:
        job = _jobs[job_id]
        job["status"] = "processing"
        job["updated"] = time()
    root = Path(job["temp"].name)
    source = job["source"]
    command = [sys.executable, "-m", "demucs", "--two-stems", "vocals",
               "-n", "htdemucs", "--out", str(root / "separated"), str(source)]
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=1800, check=False)
        if result.returncode:
            message = ("Install Demucs with: python -m pip install demucs"
                       if "No module named demucs" in result.stderr
                       else "AI separation failed. Check the server logs, FFmpeg and available memory.")
            raise RuntimeError(message)
        output = root / "separated" / "htdemucs" / source.stem / "no_vocals.wav"
        if not output.is_file() or output.stat().st_size == 0:
            raise RuntimeError("Demucs did not generate an instrumental WAV.")
        with _lock:
            job["status"] = "complete"
            job["output"] = output
            job["updated"] = time()
    except Exception as exc:
        with _lock:
            job["status"] = "failed"
            job["error"] = str(exc) if isinstance(exc, RuntimeError) else "Vocal removal failed or timed out."
            job["updated"] = time()


@router.post("/api/vocal-remover/jobs", status_code=202)
def create_vocal_job(song: UploadFile = File(...)):
    _cleanup_expired()
    filename = Path(song.filename or "song").name
    extension = Path(filename).suffix.lower()
    if extension not in ALLOWED:
        raise HTTPException(400, "Unsupported audio format.")
    temp = TemporaryDirectory(prefix="mixmaster_vocal_")
    try:
        source = Path(temp.name) / ("input" + extension)
        size = 0
        with source.open("wb") as target:
            while chunk := song.file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_BYTES:
                    raise HTTPException(413, "Audio exceeds the 200 MiB limit.")
                target.write(chunk)
        if not size:
            raise HTTPException(400, "Audio file is empty.")
        job_id = uuid4().hex
        with _lock:
            _jobs[job_id] = {"status": "queued", "updated": time(), "temp": temp,
                             "source": source, "filename": Path(filename).stem,
                             "output": None, "error": None}
        _executor.submit(_run, job_id)
        return {"id": job_id, "status": "queued"}
    except Exception:
        temp.cleanup()
        raise


@router.get("/api/vocal-remover/jobs/{job_id}")
def vocal_job_status(job_id: str):
    _cleanup_expired()
    with _lock:
        job = _jobs.get(job_id)
        if job is None:
            raise HTTPException(404, "Job not found or expired.")
        return {"id": job_id, "status": job["status"], "error": job["error"]}


@router.get("/api/vocal-remover/jobs/{job_id}/download")
def vocal_job_download(job_id: str):
    _cleanup_expired()
    with _lock:
        job = _jobs.get(job_id)
        if job is None or job["status"] != "complete":
            raise HTTPException(404, "Instrumental not ready or job expired.")
        path = job["output"]
        name = job["filename"] + "_instrumental.wav"
    return FileResponse(path, media_type="audio/wav", filename=name)


@router.post("/api/vocal-remover")
def remove_vocals(song: UploadFile = File(...)):
    """Legacy synchronous endpoint for compatibility with older clients."""
    created = create_vocal_job(song)
    from time import sleep
    while True:
        status = vocal_job_status(created["id"])
        if status["status"] == "complete":
            return vocal_job_download(created["id"])
        if status["status"] == "failed":
            raise HTTPException(422, status["error"])
        sleep(1)
