"""Energy-based Music Mix API, independent of the DJ mixing workflow."""
from pathlib import Path
from tempfile import TemporaryDirectory
import shutil
import tempfile
import uuid

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from engine import render

router = APIRouter(prefix="/api/music-mix", tags=["Music Mix"])
MODES = {"build-up", "cool-down", "balanced", "wave"}


def energy_order(tracks, mode="build-up"):
    """Return stable indices; unlike DJ planning, energy controls the entire order."""
    if mode not in MODES:
        raise ValueError("Unknown energy progression.")
    ascending = sorted(range(len(tracks)), key=lambda i: (tracks[i]["energy"], i))
    if mode == "build-up":
        return ascending
    if mode == "cool-down":
        return ascending[::-1]
    if mode == "balanced":
        # Group similar-energy songs around the median, avoiding large jumps.
        median = sorted(float(t["energy"]) for t in tracks)[len(tracks) // 2]
        return sorted(range(len(tracks)), key=lambda i: (abs(tracks[i]["energy"] - median), i))
    # Alternate lower and higher energy while covering all songs exactly once.
    result = []
    low, high = 0, len(ascending) - 1
    while low <= high:
        result.append(ascending[low])
        low += 1
        if low <= high:
            result.append(ascending[high])
            high -= 1
    return result


def prepare(songs, mode, transition, directory):
    # Import at request time to reuse the established upload validation and analysis.
    from server import save_uploads, inspect_tracks
    if mode not in MODES:
        raise HTTPException(400, "Unknown energy progression.")
    if not 2 <= len(songs) <= 20:
        raise HTTPException(400, "Select between 2 and 20 songs.")
    if not 4 <= transition <= 32:
        raise HTTPException(400, "Transition must be between 4 and 32 seconds.")
    tracks, names = save_uploads(songs, directory, len(songs))
    analysis = inspect_tracks(tracks, names)
    indices = energy_order(analysis, mode)
    return analysis, indices


@router.post("/analyze")
def analyze_music_mix(songs: list[UploadFile] = File(...), progression: str = Form("build-up"), transition: int = Form(8)):
    with TemporaryDirectory(prefix="music_mix_analysis_") as temp:
        analysis, indices = prepare(songs, progression, transition, Path(temp))
        return {"tracks": [{k: v for k, v in t.items() if k != "path"} for t in analysis],
                "order_indices": indices, "progression": progression}


@router.post("/render")
def render_music_mix(songs: list[UploadFile] = File(...), progression: str = Form("build-up"), transition: int = Form(8)):
    with TemporaryDirectory(prefix="music_mix_") as temp:
        analysis, indices = prepare(songs, progression, transition, Path(temp))
        output = Path(temp) / "Music_Mix.mp3"
        try:
            # Music Mix preserves full songs and uses straightforward crossfades;
            # no beatmatching, phase alignment, kick overlays, or DJ optimization.
            render([analysis[i] for i in indices], output, transition=transition,
                   beatmatch=False, optimize=False, mastering="balanced")
        except Exception as exc:
            raise HTTPException(422, "Music Mix rendering failed; check track lengths and FFmpeg.") from exc
        saved = Path(tempfile.gettempdir()) / ("music_mix_" + uuid.uuid4().hex + ".mp3")
        shutil.copyfile(output, saved)
        return FileResponse(saved, media_type="audio/mpeg", filename="Music_Mix.mp3",
                            background=BackgroundTask(lambda: saved.unlink(missing_ok=True)))

