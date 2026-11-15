"""Optional AI vocal removal powered by Demucs (install separately)."""
from pathlib import Path
from tempfile import TemporaryDirectory
import shutil
import subprocess
import sys

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

router = APIRouter()
ALLOWED = {".mp3", ".wav", ".flac", ".m4a", ".ogg", ".aac"}
MAX_BYTES = 200 * 1024 * 1024


@router.post("/api/vocal-remover")
def remove_vocals(song: UploadFile = File(...)):
    """Separate vocals from accompaniment and return the instrumental WAV."""
    filename = Path(song.filename or "song").name
    extension = Path(filename).suffix.lower()
    if extension not in ALLOWED:
        raise HTTPException(400, "Upload an MP3, WAV, FLAC, M4A, OGG or AAC audio file.")

    temp = TemporaryDirectory(prefix="mixmaster_vocal_")
    root = Path(temp.name)
    try:
        source = root / ("input" + extension)
        size = 0
        with source.open("wb") as target:
            while chunk := song.file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_BYTES:
                    raise HTTPException(413, "Audio file exceeds the 200 MiB limit.")
                target.write(chunk)
        if not size:
            raise HTTPException(400, "The uploaded file is empty.")

        # Run the isolated subprocess with no shell and a bounded runtime.
        command = [sys.executable, "-m", "demucs", "--two-stems", "vocals",
                   "-n", "htdemucs", "--out", str(root / "separated"), str(source)]
        try:
            process = subprocess.run(command, capture_output=True, text=True, timeout=1800, check=False)
        except subprocess.TimeoutExpired:
            raise HTTPException(504, "Vocal separation exceeded the 30-minute processing limit.")
        if process.returncode != 0:
            if "No module named demucs" in process.stderr:
                raise HTTPException(503, "Vocal Remover requires Demucs. Install it with: python -m pip install demucs")
            raise HTTPException(422, "Vocal separation failed. Check FFmpeg, model download and available memory.")

        output = root / "separated" / "htdemucs" / source.stem / "no_vocals.wav"
        if not output.is_file() or output.stat().st_size == 0:
            raise HTTPException(500, "The instrumental track was not generated.")
        return FileResponse(output, media_type="audio/wav",
                            filename=Path(filename).stem + "_instrumental.wav",
                            background=BackgroundTask(temp.cleanup))
    except Exception:
        temp.cleanup()
        raise
