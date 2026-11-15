"""Single-song audio mastering using FFmpeg with background jobs."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Lock
from time import time
from uuid import uuid4
import math
import json
import re
import subprocess

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

router = APIRouter()
ALLOWED = {".mp3", ".wav", ".flac", ".m4a", ".ogg", ".aac"}
MAX_BYTES = 200 * 1024 * 1024
PRESETS = {"balanced": (-14.0, -1.5, 0.0, 0.0, False),
           "club": (-10.0, -1.0, 1.0, 0.5, True)}
_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="audio-master")
_jobs = {}
_lock = Lock()
TTL = 7200


def _prune():
    expired = []
    with _lock:
        for key, job in list(_jobs.items()):
            if job["status"] in {"complete", "failed"} and time() - job["updated"] > TTL:
                expired.append(_jobs.pop(key))
    for job in expired:
        job["temp"].cleanup()


def _measure(path: Path) -> dict:
    """Measure full-track EBU R128 loudness and true peak, not preset targets."""
    command = ["ffmpeg", "-hide_banner", "-nostdin", "-i", str(path),
               "-vn", "-af", "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json",
               "-f", "null", "-"]
    process = subprocess.run(command, capture_output=True, text=True, timeout=900)
    if process.returncode:
        raise RuntimeError("Unable to analyze audio loudness.")
    blocks = re.findall(r'\{[^{}]*"input_i"[^{}]*\}', process.stderr, re.S)
    if not blocks:
        raise RuntimeError("FFmpeg did not report audio loudness measurements.")
    values = json.loads(blocks[-1])
    def number(key):
        try:
            value = float(values[key])
            return round(value, 2) if math.isfinite(value) else None
        except (KeyError, ValueError, TypeError):
            return None
    return {"integrated_lufs": number("input_i"), "true_peak_dbtp": number("input_tp"),
            "loudness_range_lu": number("input_lra")}


def _run(job_id):
    with _lock:
        job = _jobs[job_id]
        job["status"] = "processing"
        job["updated"] = time()
    source = job["source"]
    target, peak, bass, treble, compression = job["options"]
    output = Path(job["temp"].name) / "mastered.wav"
    # Apply gentle tone shaping, optional dynamics, then EBU R128 normalization.
    filters = []
    if bass:
        filters.append(f"bass=g={bass:.2f}:f=110")
    if treble:
        filters.append(f"treble=g={treble:.2f}:f=4500")
    if compression:
        filters.append("acompressor=threshold=0.12:ratio=2.5:attack=15:release=180:makeup=1")
    filters.append(f"loudnorm=I={target:.1f}:TP={peak:.1f}:LRA=9")
    filters.append("aresample=44100")
    command = ["ffmpeg", "-hide_banner", "-nostdin", "-y", "-i", str(source),
               "-vn", "-af", ",".join(filters), "-ac", "2", "-c:a", "pcm_s24le", str(output)]
    try:
        process = subprocess.run(command, capture_output=True, text=True, timeout=1800)
        if process.returncode or not output.is_file() or not output.stat().st_size:
            raise RuntimeError("FFmpeg mastering failed. Check audio format, disk space and server logs.")
        before = _measure(source)
        after = _measure(output)
        with _lock:
            job["measurements"] = {"before": before, "after": after}
            job["output"] = output
            job["status"] = "complete"
            job["updated"] = time()
    except Exception as exc:
        with _lock:
            job["status"] = "failed"
            job["error"] = str(exc) if isinstance(exc, RuntimeError) else "Mastering timed out or failed."
            job["updated"] = time()


@router.post("/api/mastering/jobs", status_code=202)
def create_mastering_job(song: UploadFile = File(...), preset: str = Form("balanced"),
                         target_lufs: float = Form(-14), true_peak: float = Form(-1.5),
                         bass_db: float = Form(0), treble_db: float = Form(0),
                         compression: bool = Form(False)):
    _prune()
    filename = Path(song.filename or "song").name
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED:
        raise HTTPException(400, "Unsupported audio format.")
    if preset not in {"balanced", "club", "custom"}:
        raise HTTPException(400, "Invalid mastering preset.")
    if not all(math.isfinite(v) for v in (target_lufs, true_peak, bass_db, treble_db)):
        raise HTTPException(400, "Mastering values must be finite.")
    if preset == "custom":
        if not (-20 <= target_lufs <= -9 and -3 <= true_peak <= -0.5 and -6 <= bass_db <= 6 and -6 <= treble_db <= 6):
            raise HTTPException(400, "Mastering settings are out of range.")
        options = (target_lufs, true_peak, bass_db, treble_db, compression)
    else:
        options = PRESETS[preset]
    temp = TemporaryDirectory(prefix="mixmaster_mastering_")
    try:
        source = Path(temp.name) / ("source" + ext)
        size = 0
        with source.open("wb") as out:
            while chunk := song.file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_BYTES:
                    raise HTTPException(413, "Audio file exceeds 200 MiB.")
                out.write(chunk)
        if not size:
            raise HTTPException(400, "Empty audio file.")
        job_id = uuid4().hex
        with _lock:
            _jobs[job_id] = {"status": "queued", "updated": time(), "temp": temp,
                             "source": source, "options": options, "output": None, "measurements": None,
                             "filename": Path(filename).stem, "error": None}
        _executor.submit(_run, job_id)
        return {"id": job_id, "status": "queued"}
    except Exception:
        temp.cleanup()
        raise


@router.get("/api/mastering/jobs/{job_id}")
def mastering_status(job_id: str):
    _prune()
    with _lock:
        job = _jobs.get(job_id)
        if job is None:
            raise HTTPException(404, "Job not found or expired.")
        return {"id": job_id, "status": job["status"], "error": job["error"],
                "measurements": job["measurements"]}


@router.get("/api/mastering/jobs/{job_id}/download")
def mastering_download(job_id: str):
    _prune()
    with _lock:
        job = _jobs.get(job_id)
        if job is None or job["status"] != "complete":
            raise HTTPException(404, "Mastered audio is not ready or job expired.")
        path = job["output"]
        filename = job["filename"] + "_mastered.wav"
    return FileResponse(path, media_type="audio/wav", filename=filename)
