"""Demucs four-stem audio separation: vocals, drums, bass and other."""
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZipFile, ZIP_DEFLATED
import subprocess
import sys

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from generated_storage import save_generated

router = APIRouter()
SUPPORTED = {".mp3", ".wav", ".flac", ".m4a", ".ogg", ".aac"}
STEMS = ("vocals", "drums", "bass", "other")
MAX_BYTES = 200 * 1024 * 1024


@router.post("/api/stem-splitter")
def split_stems(song: UploadFile = File(...)):
    filename = Path(song.filename or "audio").name
    ext = Path(filename).suffix.lower()
    if ext not in SUPPORTED:
        raise HTTPException(400, "Unsupported audio format.")
    temp = TemporaryDirectory(prefix="mixmaster_stems_")
    root = Path(temp.name)
    try:
        source = root / ("input" + ext)
        size = 0
        with source.open("wb") as out:
            while chunk := song.file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_BYTES:
                    raise HTTPException(413, "Maximum file size is 200 MiB.")
                out.write(chunk)
        if size == 0:
            raise HTTPException(400, "Audio file is empty.")
        command = [sys.executable, "-m", "demucs", "-n", "htdemucs",
                   "--out", str(root / "separated"), str(source)]
        try:
            process = subprocess.run(command, capture_output=True, text=True,
                                     timeout=1800, check=False)
        except subprocess.TimeoutExpired:
            raise HTTPException(504, "Stem splitting timed out after 30 minutes.")
        if process.returncode:
            if "No module named demucs" in process.stderr:
                raise HTTPException(503, "Install Demucs with: python -m pip install demucs")
            raise HTTPException(422, "Unable to split audio. Check FFmpeg, memory and model download.")
        stem_dir = root / "separated" / "htdemucs" / source.stem
        archive = root / "stems.zip"
        with ZipFile(archive, "w", ZIP_DEFLATED, compresslevel=3) as zip_file:
            for stem in STEMS:
                path = stem_dir / (stem + ".wav")
                if not path.is_file() or path.stat().st_size == 0:
                    raise HTTPException(500, f"Missing stem: {stem}.")
                zip_file.write(path, stem + ".wav")
        save_generated(archive, "stem_splitter", Path(filename).stem + "_stems.zip", "application/zip")
        return FileResponse(archive, media_type="application/zip",
                            filename=Path(filename).stem + "_stems.zip",
                            background=BackgroundTask(temp.cleanup))
    except Exception:
        temp.cleanup()
        raise
