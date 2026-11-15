"""Local full-song project pipeline. Audio generation requires a separately installed model."""
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4
import json
import os
import re

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()
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


@router.get("/api/full-song/engine")
def engine_status():
    return {"backend": "ready", "generation_available": False,
            "engine": None, "reason": "No local full-song and singing model is configured yet."}


@router.post("/api/full-song/projects", status_code=201)
def save_project(project: SongProject):
    validate_project(project)
    PROJECT_ROOT.mkdir(parents=True, exist_ok=True)
    project_id = uuid4().hex
    record = {"id": project_id, "created_at": datetime.now(timezone.utc).isoformat(),
              "status": "draft", "project": project.model_dump() if hasattr(project, "model_dump") else project.dict()}
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


@router.post("/api/full-song/generate", status_code=503)
def generate_song(project: SongProject):
    validate_project(project)
    raise HTTPException(503, "Offline full-song generation is not installed. Your project can be saved as a draft.")
