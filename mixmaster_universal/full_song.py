"""Local full-song project pipeline. Audio generation requires a separately installed model."""
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4
import json
import os
import re
import subprocess
from tempfile import TemporaryDirectory
import wave

from generated_storage import save_generated
from song_arrangement import arrangement
from full_song_jobs import router as job_router, submit as submit_job, status as job_status, cancel as cancel_job

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()
router.include_router(job_router)
PROJECT_ROOT = Path(os.environ.get("FULL_SONG_PROJECT_ROOT", "~/MixMasterAI/Storage/full_song_projects")).expanduser().resolve()
GENRES = {"Afro-pop", "Rumba", "Dancehall", "Bongo Flava", "Pop", "Afrobeat", "Country Pop"}


class SongProject(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    description: str = Field(min_length=1, max_length=2000)
    lyrics: str = Field(min_length=1, max_length=12000)
    voice: str = "female"
    genre: str = "Afro-pop"
    output: str = "full_song"
    bpm: int = Field(default=110, ge=60, le=180)
    minutes: int = Field(default=3, ge=2, le=4)


def validate_project(project: SongProject):
    if not all((project.title.strip(), project.description.strip(), project.lyrics.strip())):
        raise HTTPException(422, "Title, description and lyrics must not be blank.")
    if project.voice not in {"female", "male", "duet"}:
        raise HTTPException(422, "Unsupported singing voice.")
    if project.genre not in GENRES:
        raise HTTPException(422, "Unsupported music genre.")
    if project.output not in {"full_song", "instrumental", "vocals"}:
        raise HTTPException(422, "Unsupported output type.")


def _engine_command(output='instrumental'):
    if output != 'instrumental':
        configured = os.environ.get('FULL_SONG_VOCAL_EXECUTABLE', '').strip()
        if not configured and output == 'full_song' and os.environ.get('ACESTEP_API_URL', '').strip() and os.environ.get('ACESTEP_API_KEY', '').strip():
            configured = str(Path(__file__).with_name('run_ace_step_gpu.sh'))
        if not configured:
            return None
        executable = Path(configured).expanduser().resolve()
        return executable if executable.is_file() and os.access(executable, os.X_OK) else None

    """Only an explicitly configured local executable is permitted."""
    configured = os.environ.get("FULL_SONG_ENGINE_EXECUTABLE", "").strip()
    if not configured:
        return None
    executable = Path(configured).expanduser().resolve()
    if not executable.is_file() or not os.access(executable, os.X_OK):
        return None
    return executable


@router.post("/api/full-song/arrangement")
def plan_arrangement(project: SongProject):
    validate_project(project)
    return arrangement(project.lyrics, project.bpm, project.minutes)


@router.get("/api/full-song/engine")
def engine_status():
    instrumental = _engine_command('instrumental') is not None
    vocal = _engine_command('vocals') is not None
    return {"backend": "ready", "generation_available": instrumental or vocal,
            "capabilities": {"instrumental": instrumental, "vocals": vocal, "full_song": vocal,
                             "voices": ["female", "male", "duet"] if vocal else []},
            "engine": "local-executable" if instrumental or vocal else None,
            "reason": None if instrumental or vocal else "Configure FULL_SONG_ENGINE_EXECUTABLE for instrumentals or FULL_SONG_VOCAL_EXECUTABLE for singing."}


@router.post("/api/full-song/projects", status_code=201)
def save_project(project: SongProject):
    validate_project(project)
    PROJECT_ROOT.mkdir(parents=True, exist_ok=True)
    project_id = uuid4().hex
    record = {"id": project_id, "created_at": datetime.now(timezone.utc).isoformat(),
              "status": "draft", "project": project.model_dump() if hasattr(project, "model_dump") else project.dict(),
              "arrangement": arrangement(project.lyrics, project.bpm, project.minutes)}
    path = PROJECT_ROOT / (project_id + ".json")
    # Exclusive creation avoids accidentally overwriting an existing project.
    with path.open("x", encoding="utf-8") as output:
        json.dump(record, output, ensure_ascii=False, indent=2)
    return {"id": project_id, "status": "draft", "created_at": record["created_at"]}


@router.get("/api/full-song/projects/{project_id}")
def read_project(project_id: str):
    if not re.fullmatch(r"[a-f0-9]{32}", project_id):
        raise HTTPException(404, "Project not found.")
    path = PROJECT_ROOT / (project_id + ".json")
    if not path.is_file():
        raise HTTPException(404, "Project not found.")
    return json.loads(path.read_text(encoding="utf-8"))



@router.post("/api/full-song/jobs", status_code=202)
def start_song_job(project: SongProject):
    validate_project(project)
    executable = _engine_command(project.output)
    if executable is None:
        raise HTTPException(503, "No compatible local music engine is configured for this output.")
    payload = project.model_dump() if hasattr(project, "model_dump") else project.dict()
    return submit_job(payload, executable, arrangement(project.lyrics, project.bpm, project.minutes))


@router.get("/api/full-song/jobs/{job_id}")
def get_song_job(job_id: str):
    return job_status(job_id)


@router.post("/api/full-song/jobs/{job_id}/cancel")
def cancel_song_job(job_id: str):
    return cancel_job(job_id)


@router.post("/api/full-song/generate")
def generate_song(project: SongProject):
    """Run a locally installed engine with a hard process timeout.

    Engine contract: executable receives a project JSON path and output WAV path
    as positional arguments. It must exit 0 and write a valid nonempty WAV.
    No network service or shell is invoked by MixMaster.
    """
    validate_project(project)
    executable = _engine_command(project.output)
    if executable is None:
        setting = 'FULL_SONG_ENGINE_EXECUTABLE' if project.output == 'instrumental' else 'FULL_SONG_VOCAL_EXECUTABLE'
        raise HTTPException(503, f'No compatible offline engine is installed for {project.output}. Configure {setting}.')
    with TemporaryDirectory(prefix="mixmaster_full_song_") as directory:
        work = Path(directory)
        request_path, output_path = work / "project.json", work / "song.wav"
        payload = project.model_dump() if hasattr(project, "model_dump") else project.dict()
        payload["arrangement"] = arrangement(project.lyrics, project.bpm, project.minutes)
        request_path.write_text(json.dumps(payload), encoding="utf-8")
        try:
            result = subprocess.run([str(executable), str(request_path), str(output_path)],
                                    cwd=str(work), capture_output=True, text=True, timeout=300, check=False)
        except subprocess.TimeoutExpired as exc:
            raise HTTPException(504, "Local music engine exceeded the five-minute limit.") from exc
        except OSError as exc:
            raise HTTPException(503, "Could not start the configured local music engine.") from exc
        if result.returncode != 0:
            raise HTTPException(502, "Local music engine failed. Check its terminal logs.")
        if not output_path.is_file() or output_path.stat().st_size < 100:
            raise HTTPException(502, "Local music engine did not produce a usable WAV file.")
        try:
            with wave.open(str(output_path), "rb") as wav:
                if wav.getnframes() == 0 or wav.getframerate() < 8000 or wav.getnchannels() not in (1, 2):
                    raise ValueError("Invalid WAV format")
        except (wave.Error, ValueError, EOFError) as exc:
            raise HTTPException(502, "Local engine output must be a valid PCM WAV.") from exc
        saved = save_generated(output_path, "full_song", "MixMaster_Full_Song.wav", "audio/wav")
        return {"file": saved, "download_url": f"/api/generated-files/{saved['id']}/download"}
