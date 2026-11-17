"""Audio-conditioned music extension jobs.

The configured executable receives (request.json, continuation.wav).
The JSON contains an absolute source_audio_path pointing at the actual original
PCM WAV and a start_seconds cutoff. It MUST condition on that audio.
No text-to-music fallback is provided.
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Lock
from time import monotonic
from uuid import uuid4
import json
import os
import shutil
import subprocess
import wave

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from generated_storage import _get, ROOT, BACKEND, _s3, _bucket, save_generated, song_identity

router = APIRouter()
_jobs = {}
_lock = Lock()
_pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="mixmaster-extend")


class ExtensionRequest(BaseModel):
    source_file_id: str = Field(min_length=1, max_length=100)
    start_seconds: float = Field(ge=0)
    duration_seconds: int = Field(default=30, ge=10, le=180)
    prompt: str = Field(min_length=1, max_length=2000)
    lyrics: str = Field(default="", max_length=12000)
    title: str = Field(min_length=1, max_length=120)


def _executable():
    configured = os.environ.get("FULL_SONG_EXTENSION_EXECUTABLE", "").strip()
    if not configured:
        return None
    path = Path(configured).expanduser().resolve()
    return path if path.is_file() and os.access(path, os.X_OK) else None


def _ffmpeg():
    return shutil.which("ffmpeg")


def _audio_info(path):
    try:
        with wave.open(str(path), "rb") as audio:
            if audio.getcomptype() != "NONE" or audio.getnframes() <= 0 or audio.getframerate() < 8000:
                raise ValueError("Invalid PCM WAV")
            if audio.getnchannels() not in (1, 2):
                raise ValueError("Mono or stereo PCM WAV required")
            return audio.getnframes() / audio.getframerate()
    except (wave.Error, EOFError, ValueError) as exc:
        raise RuntimeError("Extension engine requires valid PCM WAV audio.") from exc


def _snapshot(job):
    return dict(job)


@router.get("/api/full-song/extensions/capabilities")
def capabilities():
    available = _executable() is not None
    return {"available": available, "merge_available": _ffmpeg() is not None,
            "reason": None if available else "Configure FULL_SONG_EXTENSION_EXECUTABLE with an audio-conditioned continuation engine."}


@router.post("/api/full-song/extensions", status_code=202)
def start_extension(request: ExtensionRequest):
    executable = _executable()
    if executable is None:
        raise HTTPException(503, "No audio-conditioned extension engine configured. Set FULL_SONG_EXTENSION_EXECUTABLE.")
    source = _get(request.source_file_id)
    if source["category"] not in {"full_song", "text_to_song"} or not source["mime"].startswith("audio/"):
        raise HTTPException(422, "Select a saved music track.")
    with _lock:
        if any(job["status"] in {"queued", "running"} for job in _jobs.values()):
            raise HTTPException(429, "An extension is already running.")
        job_id = uuid4().hex
        job = {"id": job_id, "status": "queued", "stage": "waiting", "error": None,
               "file": None, "extension_file": None, "download_url": None, "elapsed_seconds": 0}
        _jobs[job_id] = job
    _pool.submit(_run, job_id, request, source, executable)
    return _snapshot(job)


def _run(job_id, request, source, executable):
    started = monotonic()
    def update(**changes):
        with _lock:
            _jobs[job_id].update(changes)
    try:
        update(status="running", stage="preparing")
        with TemporaryDirectory(prefix="mixmaster_extend_") as temp:
            work = Path(temp)
            original = work / "original.wav"
            if BACKEND == "local":
                source_path = ROOT / source["storage_key"]
                if not source_path.is_file():
                    raise RuntimeError("Original song is missing.")
                shutil.copyfile(source_path, original)
            else:
                _s3().download_file(_bucket(), source["storage_key"], str(original))
            total = _audio_info(original)
            if not 0 <= request.start_seconds < total:
                raise RuntimeError("Extension point must be inside the original song.")
            continuation = work / "continuation.wav"
            payload = request.model_dump() if hasattr(request, "model_dump") else request.dict()
            payload["source_audio_path"] = str(original)
            payload["source_duration_seconds"] = total
            payload["output_audio_path"] = str(continuation)
            request_file = work / "request.json"
            request_file.write_text(json.dumps(payload), encoding="utf-8")
            update(stage="generating")
            timeout = min(max(int(os.environ.get("FULL_SONG_EXTENSION_TIMEOUT_SECONDS", "1200")), 60), 7200)
            with (work / "engine.log").open("wb") as log:
                try:
                    subprocess.run([str(executable), str(request_file), str(continuation)],
                                   cwd=str(work), stdout=log, stderr=subprocess.STDOUT,
                                   timeout=timeout, check=True)
                except subprocess.TimeoutExpired as exc:
                    raise RuntimeError("Extension engine timed out.") from exc
                except subprocess.CalledProcessError as exc:
                    raise RuntimeError("Extension engine failed; inspect backend engine logs.") from exc
            if not continuation.is_file() or continuation.stat().st_size < 100:
                raise RuntimeError("Extension engine produced no WAV.")
            _audio_info(continuation)
            update(stage="saving")
            extension_title = request.title.strip() + " (Extension)"
            _, art = song_identity(extension_title, request.prompt, "", request.lyrics)
            extension_saved = save_generated(continuation, "full_song", "Extension_" + job_id[:8] + ".wav",
                                             "audio/wav", song_title=extension_title, artwork_svg=art)
            result = extension_saved
            if _ffmpeg():
                update(stage="merging")
                combined = work / "combined.wav"
                # Preserve original through the chosen cutoff and crossfade a short seam.
                seam = min(0.5, request.start_seconds, _audio_info(continuation) / 3)
                if seam > 0:
                    filters = ("[0:a]atrim=0:" + str(request.start_seconds) +
                               ",asetpts=PTS-STARTPTS[a];[1:a]asetpts=PTS-STARTPTS[b];"
                               "[a][b]acrossfade=d=" + str(seam) + ":c1=tri:c2=tri[out]")
                else:
                    filters = ("[0:a]atrim=0:" + str(request.start_seconds) +
                               ",asetpts=PTS-STARTPTS[a];[1:a]asetpts=PTS-STARTPTS[b];"
                               "[a][b]concat=n=2:v=0:a=1[out]")
                process = subprocess.run([_ffmpeg(), "-hide_banner", "-loglevel", "error", "-y",
                                          "-i", str(original), "-i", str(continuation),
                                          "-filter_complex", filters, "-map", "[out]",
                                          "-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le",
                                          str(combined)], capture_output=True, text=True, timeout=120)
                if process.returncode:
                    raise RuntimeError("Could not merge extension: " + process.stderr[-350:])
                _audio_info(combined)
                result = save_generated(combined, "full_song", "Extended_" + job_id[:8] + ".wav",
                                        "audio/wav", song_title=request.title.strip(), artwork_svg=art)
            update(status="completed", stage="completed", file=result, extension_file=extension_saved,
                   download_url="/api/generated-files/" + result["id"] + "/download")
    except Exception as exc:
        update(status="failed", stage="failed", error=str(exc) if isinstance(exc, RuntimeError) else "Extension failed. Check server logs.")
    finally:
        update(elapsed_seconds=round(monotonic() - started, 1))


@router.get("/api/full-song/extensions/{job_id}")
def extension_status(job_id: str):
    with _lock:
        job = _jobs.get(job_id)
        if job is None:
            raise HTTPException(404, "Extension job not found or server restarted.")
        return _snapshot(job)
