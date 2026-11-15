"""AI Voice Studio: local voice profiles and opt-in external SVC engine.

Requires configured training/conversion executables; never claims a profile is trained
until the configured training process successfully produces a model artifact.
"""
from __future__ import annotations
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Lock
from time import time
from uuid import uuid4
import os
import shutil
import subprocess
import tempfile

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

router = APIRouter()
ROOT = Path(os.environ.get("MIXMASTER_VOICE_DATA", str(Path.home() / ".mixmaster_ai" / "voices"))).expanduser()
MAX_SIZE = 200 * 1024 * 1024
EXT = {".wav", ".mp3", ".flac", ".m4a"}
pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="voice-studio")
lock = Lock()
jobs: dict[str, dict] = {}
profiles: dict[str, dict] = {}


def _save(file: UploadFile, target: Path):
    if Path(file.filename or "").suffix.lower() not in EXT:
        raise HTTPException(400, "Use WAV, MP3, FLAC or M4A audio.")
    target.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with target.open("wb") as out:
        while chunk := file.file.read(1024 * 1024):
            count += len(chunk)
            if count > MAX_SIZE:
                target.unlink(missing_ok=True)
                raise HTTPException(413, "Audio exceeds 200 MiB.")
            out.write(chunk)
    if not count:
        raise HTTPException(400, "Audio file is empty.")


def _public(job_id):
    j = jobs[job_id]
    return {"id": job_id, "status": j["status"], "error": j.get("error"),
            "kind": j["kind"], "profile_id": j["profile_id"]}


def _execute(job_id: str, command: list[str], expected: Path, kind: str):
    with lock:
        jobs[job_id]["status"] = "processing"
    try:
        proc = subprocess.run(command, capture_output=True, text=True, timeout=14400)
        if proc.returncode or not expected.is_file() or not expected.stat().st_size:
            raise RuntimeError((proc.stderr or "Engine did not produce an output.")[-800:])
        with lock:
            jobs[job_id]["status"] = "complete"
            if kind == "train":
                profiles[jobs[job_id]["profile_id"]]["ready"] = True
    except (OSError, subprocess.TimeoutExpired, RuntimeError) as exc:
        with lock:
            jobs[job_id]["status"] = "failed"
            jobs[job_id]["error"] = str(exc)[-800:]


@router.get("/api/voice-studio/capabilities")
def capabilities():
    return {"training_available": bool(os.environ.get("MIXMASTER_VOICE_TRAIN_CMD")),
            "conversion_available": bool(os.environ.get("MIXMASTER_VOICE_CONVERT_CMD")),
            "note": "Configure external SVC training and conversion executables for actual voice learning."}


@router.get("/api/voice-studio/profiles")
def list_profiles():
    with lock:
        return [{"id": k, "name": v["name"], "ready": v["ready"]} for k, v in profiles.items()]


@router.post("/api/voice-studio/profiles", status_code=201)
def add_profile(name: str = Form(...), sample: UploadFile = File(...), consent: bool = Form(False)):
    if not consent:
        raise HTTPException(400, "Confirm that this is your voice or you have permission.")
    if not name.strip() or len(name) > 80:
        raise HTTPException(400, "Profile name must be 1–80 characters.")
    pid = uuid4().hex
    ext = Path(sample.filename or "").suffix.lower()
    directory = ROOT / pid
    try:
        _save(sample, directory / ("sample" + ext))
    except Exception:
        shutil.rmtree(directory, ignore_errors=True)
        raise
    with lock:
        profiles[pid] = {"name": name.strip(), "ready": False, "sample": directory / ("sample" + ext),
                         "model": directory / "model.pth"}
    return {"id": pid, "name": name.strip(), "ready": False}


@router.post("/api/voice-studio/profiles/{profile_id}/train", status_code=202)
def train(profile_id: str):
    template = os.environ.get("MIXMASTER_VOICE_TRAIN_CMD")
    if not template:
        raise HTTPException(503, "Voice training engine not configured. Set MIXMASTER_VOICE_TRAIN_CMD.")
    with lock:
        profile = profiles.get(profile_id)
        if not profile:
            raise HTTPException(404, "Voice profile not found.")
        if any(j["profile_id"] == profile_id and j["kind"] == "train" and j["status"] in {"queued", "processing"} for j in jobs.values()):
            raise HTTPException(409, "Training already in progress.")
        job_id = uuid4().hex
        jobs[job_id] = {"status": "queued", "error": None, "kind": "train", "profile_id": profile_id, "output": None}
        sample, model = profile["sample"], profile["model"]
    # Executable is a trusted local program. No shell interpolation of uploaded names.
    pool.submit(_execute, job_id, [template, str(sample), str(model)], model, "train")
    return _public(job_id)


@router.post("/api/voice-studio/convert", status_code=202)
def convert(profile_id: str = Form(...), song: UploadFile = File(...)):
    template = os.environ.get("MIXMASTER_VOICE_CONVERT_CMD")
    if not template:
        raise HTTPException(503, "Voice conversion engine not configured. Set MIXMASTER_VOICE_CONVERT_CMD.")
    with lock:
        profile = profiles.get(profile_id)
        if not profile or not profile["ready"]:
            raise HTTPException(400, "Select a trained voice profile.")
        model = profile["model"]
    job_id = uuid4().hex
    directory = Path(tempfile.mkdtemp(prefix="mixmaster_voice_"))
    source = directory / ("source" + Path(song.filename or "").suffix.lower())
    try:
        _save(song, source)
    except Exception:
        shutil.rmtree(directory, ignore_errors=True)
        raise
    output = directory / "converted.wav"
    with lock:
        jobs[job_id] = {"status": "queued", "error": None, "kind": "convert",
                        "profile_id": profile_id, "output": output}
    pool.submit(_execute, job_id, [template, str(source), str(model), str(output)], output, "convert")
    return _public(job_id)


@router.get("/api/voice-studio/jobs/{job_id}")
def status(job_id: str):
    with lock:
        if job_id not in jobs:
            raise HTTPException(404, "Job not found.")
        return _public(job_id)


@router.get("/api/voice-studio/jobs/{job_id}/download")
def download(job_id: str):
    with lock:
        job = jobs.get(job_id)
        if not job or job["kind"] != "convert" or job["status"] != "complete":
            raise HTTPException(404, "Converted audio is not ready.")
        output = job["output"]
    return FileResponse(output, media_type="audio/wav", filename="MixMaster_Voice_Converted.wav")
