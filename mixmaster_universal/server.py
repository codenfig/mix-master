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

from engine import analyze
from vocal_remover import router as vocal_remover_router
from stem_splitter import router as stem_splitter_router
from audio_mastering import router as mastering_router
from voice_studio import router as voice_studio_router
from generated_storage import router as generated_files_router

ROOT = Path(__file__).resolve().parent
app = FastAPI(title="MixMaster AI Universal", version="0.2.0")
app.include_router(vocal_remover_router)
app.include_router(stem_splitter_router)
app.include_router(mastering_router)
app.include_router(voice_studio_router)
app.include_router(generated_files_router)
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


def save_cover(cover: UploadFile | None, directory: Path) -> Path | None:
    if cover is None or not cover.filename:
        return None
    extension = Path(cover.filename).suffix.lower()
    if extension not in {".jpg", ".jpeg", ".png"}:
        raise HTTPException(400, "Cover image must be JPG or PNG.")
    destination = directory / ("cover" + extension)
    size = 0
    with destination.open("wb") as out:
        while chunk := cover.file.read(1024 * 1024):
            size += len(chunk)
            if size > 10 * 1024 * 1024:
                raise HTTPException(413, "Cover image must be smaller than 10 MiB.")
            out.write(chunk)
    if not size:
        raise HTTPException(400, "Cover image is empty.")
    header = destination.read_bytes()[:8]
    if extension == ".png" and header != bytes.fromhex("89504e470d0a1a0a"):
        raise HTTPException(400, "Invalid PNG image.")
    if extension in {".jpg", ".jpeg"} and not header.startswith(bytes.fromhex("ffd8ff")):
        raise HTTPException(400, "Invalid JPEG image.")
    return destination


def validate_cover_metadata(title: str, artist: str, album: str, year: str):
    if any(len(value) > 120 for value in (title, artist, album)) or len(year) > 4:
        raise HTTPException(400, "Cover metadata is too long.")
    if year and (not year.isdigit() or not 1900 <= int(year) <= 2100):
        raise HTTPException(400, "Invalid release year.")


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
    results = []
    for index, (path, name) in enumerate(zip(tracks, names), start=1):
        try:
            result = analyze(path)
        except Exception as exc:
            # Identify the failed upload without leaking server filesystem paths.
            raise HTTPException(
                422,
                f"Track {index} ({name}) could not be decoded or analyzed. "
                "Check the audio file with FFmpeg or replace it with a valid MP3/WAV."
            ) from exc
        result["name"] = name
        results.append(result)
    return results


# Energy-based Music Mix is intentionally separate from DJ endpoints.
from music_mix import router as music_mix_router
app.include_router(music_mix_router)
