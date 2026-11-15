"""MixMaster AI HTTP API. Processing is synchronous in this MVP."""
from pathlib import Path
from tempfile import TemporaryDirectory
import shutil
import tempfile
import uuid

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.background import BackgroundTask

from engine import analyze, render
from planner import plan
from jobs import allocate_directory, create_job, get_job, get_download
from vocal_remover import router as vocal_remover_router
from stem_splitter import router as stem_splitter_router

ROOT = Path(__file__).resolve().parent
app = FastAPI(title="MixMaster AI Universal", version="0.2.0")
app.include_router(vocal_remover_router)
app.include_router(stem_splitter_router)
app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")
SUPPORTED = {".mp3", ".wav", ".flac", ".m4a", ".ogg", ".aac"}
MAX_FILE_BYTES = 200 * 1024 * 1024
VALID_COUNTS = {5, 10, 20}
MASTERING_PRESETS = {"off", "balanced", "club"}
KICK_STYLES = {"soft", "club"}

def validate_mastering_options(preset, target_lufs, true_peak, bass_db, treble_db):
    if preset not in {"off", "balanced", "club", "custom"}:
        raise HTTPException(400, "Unknown mastering preset.")
    if not (-20 <= target_lufs <= -9 and -3 <= true_peak <= -0.5 and -6 <= bass_db <= 6 and -6 <= treble_db <= 6):
        raise HTTPException(400, "Invalid mastering settings.")


def validate_kick(style: str, level: float):
    if style not in KICK_STYLES or not 0 <= level <= 0.35:
        raise HTTPException(400, "Invalid kick style or level.")


@app.get("/")
def index():
    return FileResponse(ROOT / "static" / "index.html")


@app.get("/health")
def health():
    return {"ok": True, "version": "0.2.0"}


def validate_settings(count: int, transition: int):
    if count not in VALID_COUNTS:
        raise HTTPException(400, "Song count must be 5, 10 or 20.")
    if not 4 <= transition <= 32:
        raise HTTPException(400, "Transition must be between 4 and 32 seconds.")


def save_uploads(songs: list[UploadFile], directory: Path, count: int):
    if len(songs) != count:
        raise HTTPException(400, f"Select exactly {count} audio files.")
    tracks, names = [], []
    for idx, song in enumerate(songs):
        name = Path(song.filename or f"Track {idx + 1}").name
        ext = Path(name).suffix.lower()
        if ext not in SUPPORTED:
            raise HTTPException(400, f"Unsupported audio format: {name}")
        dest = directory / f"{idx:02d}{ext}"
        size = 0
        with dest.open("wb") as output:
            while chunk := song.file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_FILE_BYTES:
                    raise HTTPException(413, f"File too large: {name}")
                output.write(chunk)
        if not size:
            raise HTTPException(400, f"Empty audio file: {name}")
        tracks.append(dest)
        names.append(name)
    return tracks, names


def inspect_tracks(tracks, names):
    try:
        results = [analyze(path) for path in tracks]
        for result, name in zip(results, names):
            result["name"] = name
        return results
    except Exception as exc:
        raise HTTPException(422, "Unable to decode or analyze one or more tracks.") from exc


@app.post("/api/analyze")
def analyze_songs(songs: list[UploadFile] = File(...), count: int = Form(10)):
    validate_settings(count, 12)
    with TemporaryDirectory(prefix="mixmaster_analysis_") as temp:
        tracks, names = save_uploads(songs, Path(temp), count)
        results = inspect_tracks(tracks, names)
        mix_plan = plan(results)
        return {"tracks": [{k: v for k, v in t.items() if k != "path"} for t in results], "order": mix_plan["order"], "plan": mix_plan}


@app.post("/api/mix")
def mix(songs: list[UploadFile] = File(...), count: int = Form(10), transition: int = Form(12), mastering: str = Form("balanced"), kick_enabled: bool = Form(False), kick_style: str = Form("soft"), kick_level: float = Form(0.16), kick_source_index: int = Form(-1), target_lufs: float = Form(-14), true_peak: float = Form(-1.5), bass_db: float = Form(0), treble_db: float = Form(0), compression: bool = Form(False)):
    validate_settings(count, transition)
    validate_mastering_options(mastering, target_lufs, true_peak, bass_db, treble_db)
    validate_kick(kick_style, kick_level)
    if kick_enabled and kick_source_index >= count:
        raise HTTPException(400, "Kick source is not one of the uploaded songs.")
    if kick_source_index < -1:
        raise HTTPException(400, "Invalid kick source.")
    with TemporaryDirectory(prefix="mixmaster_") as temp:
        tmp = Path(temp)
        tracks, names = save_uploads(songs, tmp, count)
        analysis = inspect_tracks(tracks, names)
        mix_plan = plan(analysis, transition=transition)
        ordered = [analysis[i] for i in mix_plan['order_indices']]
        out = tmp / "MixMaster_AI_Nonstop.mp3"
        try:
            quality = render(ordered, out, transition=transition, mastering=mastering, kick_enabled=kick_enabled, kick_style=kick_style, kick_level=kick_level, mastering_options={"target_lufs": target_lufs, "true_peak": true_peak, "bass_db": bass_db, "treble_db": treble_db, "compression": compression}, kick_source_index=kick_source_index if kick_enabled and kick_source_index >= 0 else None, source_tracks=analysis)
        except Exception as exc:
            raise HTTPException(422, "Audio rendering failed. Check track lengths and FFmpeg installation.") from exc
        saved = Path(tempfile.gettempdir()) / f"mixmaster_{uuid.uuid4().hex}.mp3"
        shutil.copyfile(out, saved)
        return FileResponse(
            saved,
            media_type="audio/mpeg",
            filename="MixMaster_AI_Nonstop.mp3",
            background=BackgroundTask(lambda: saved.unlink(missing_ok=True)),
            headers={"X-MixMaster-Track-Count": str(count),
                     "X-MixMaster-Peak": str(quality["peak"]),
                     "X-MixMaster-RMS": str(quality["rms"]),
                     "X-MixMaster-Near-Silence": str(quality["near_silence_fraction"]),
                     "X-MixMaster-Clipping-Risk": str(quality["clipping_risk"]).lower()},
        )


@app.post("/api/jobs", status_code=202)
def queue_mix(songs: list[UploadFile] = File(...), count: int = Form(10), transition: int = Form(12), mastering: str = Form("balanced"), kick_enabled: bool = Form(False), kick_style: str = Form("soft"), kick_level: float = Form(0.16), kick_source_index: int = Form(-1), target_lufs: float = Form(-14), true_peak: float = Form(-1.5), bass_db: float = Form(0), treble_db: float = Form(0), compression: bool = Form(False)):
    """Accept uploads, analyze, then render asynchronously in one bounded worker."""
    validate_settings(count, transition)
    validate_mastering_options(mastering, target_lufs, true_peak, bass_db, treble_db)
    validate_kick(kick_style, kick_level)
    if kick_enabled and kick_source_index >= count:
        raise HTTPException(400, "Kick source is not one of the uploaded songs.")
    if kick_source_index < -1:
        raise HTTPException(400, "Invalid kick source.")
    directory = allocate_directory()
    try:
        tracks, names = save_uploads(songs, directory, count)
        analysis = inspect_tracks(tracks, names)
        job_id = create_job(analysis, transition, directory, mastering=mastering, kick_enabled=kick_enabled, kick_style=kick_style, kick_level=kick_level, mastering_options={"target_lufs": target_lufs, "true_peak": true_peak, "bass_db": bass_db, "treble_db": treble_db, "compression": compression}, kick_source_index=kick_source_index if kick_enabled and kick_source_index >= 0 else None, source_tracks=analysis)
        return {"id": job_id, "status": "queued", "status_url": f"/api/jobs/{job_id}"}
    except RuntimeError as exc:
        shutil.rmtree(directory, ignore_errors=True)
        raise HTTPException(503, str(exc)) from exc
    except Exception:
        shutil.rmtree(directory, ignore_errors=True)
        raise


@app.get("/api/jobs/{job_id}")
def job_status(job_id: str):
    job = get_job(job_id)
    if job is None:
        raise HTTPException(404, "Job not found or expired.")
    return job


@app.get("/api/jobs/{job_id}/download")
def job_download(job_id: str):
    path = get_download(job_id)
    if path is None:
        raise HTTPException(404, "Mix not ready or job expired.")
    return FileResponse(path, media_type="audio/mpeg", filename="MixMaster_AI_Nonstop.mp3")
