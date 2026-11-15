"""Persistent generated-file storage, outside the source tree by default.

Local mode stores bytes under ~/MixMasterAI/Storage. S3 mode uses private
objects and short-lived signed URLs; metadata stays in local SQLite (use a
persistent shared database in a multi-instance deployment).
"""
from __future__ import annotations
import os
import shutil
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, RedirectResponse

router = APIRouter()
ROOT = Path(os.environ.get("STORAGE_LOCAL_ROOT", "~/MixMasterAI/Storage")).expanduser().resolve()
BACKEND = os.environ.get("STORAGE_BACKEND", "local").lower()
if BACKEND not in {"local", "s3"}:
    raise RuntimeError("STORAGE_BACKEND must be local or s3")
DB = Path(os.environ.get("STORAGE_METADATA_DB", str(ROOT / "metadata" / "files.sqlite3"))).expanduser().resolve()
CATEGORIES = {"dj_mixes", "stem_splitter", "vocal_remover", "audio_mastering", "voice_studio", "text_to_song"}
_lock = RLock()


def _connect():
    DB.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("""CREATE TABLE IF NOT EXISTS generated_files (
        id TEXT PRIMARY KEY, category TEXT NOT NULL, name TEXT NOT NULL,
        storage_key TEXT NOT NULL, size INTEGER NOT NULL, mime TEXT NOT NULL,
        created_at TEXT NOT NULL)""")
    conn.commit()
    return conn


def _s3():
    try:
        import boto3
    except ImportError as exc:
        raise RuntimeError("S3 storage requires: pip install boto3") from exc
    return boto3.client("s3", region_name=os.environ.get("STORAGE_S3_REGION") or None,
                        endpoint_url=os.environ.get("STORAGE_S3_ENDPOINT_URL") or None)


def _bucket():
    bucket = os.environ.get("STORAGE_S3_BUCKET")
    if not bucket:
        raise RuntimeError("STORAGE_S3_BUCKET is required in S3 mode")
    return bucket


def save_generated(source: Path, category: str, name: str, mime: str) -> dict:
    """Copy a completed output into durable storage and register it."""
    if category not in CATEGORIES:
        raise ValueError("Invalid output category")
    if not source.is_file():
        raise FileNotFoundError(source)
    name = Path(name).name[:200]
    if not name or name in {".", ".."}:
        raise ValueError("Invalid filename")
    file_id = uuid4().hex
    key = f"{category}/{file_id}/{name}"
    size = source.stat().st_size
    if not size:
        raise ValueError("Cannot save empty output")
    if BACKEND == "local":
        dest = ROOT / key
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, dest)
    else:
        _s3().upload_file(str(source), _bucket(), key, ExtraArgs={"ContentType": mime})
    item = {"id": file_id, "category": category, "name": name,
            "storage_key": key, "size": size, "mime": mime,
            "created_at": datetime.now(timezone.utc).isoformat()}
    try:
        with _lock, _connect() as conn:
            conn.execute("""INSERT INTO generated_files
                (id,category,name,storage_key,size,mime,created_at)
                VALUES (:id,:category,:name,:storage_key,:size,:mime,:created_at)""", item)
    except Exception:
        _delete_object(key)
        raise
    return {k: v for k, v in item.items() if k != "storage_key"}


def _delete_object(key: str):
    if BACKEND == "local":
        (ROOT / key).unlink(missing_ok=True)
    else:
        _s3().delete_object(Bucket=_bucket(), Key=key)


def _get(file_id: str):
    with _connect() as conn:
        row = conn.execute("SELECT * FROM generated_files WHERE id=?", (file_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "Generated file not found.")
    return dict(row)


@router.get("/api/generated-files")
def list_generated_files(category: str | None = None):
    if category and category not in CATEGORIES:
        raise HTTPException(400, "Unknown category.")
    with _connect() as conn:
        rows = conn.execute(
            "SELECT id,category,name,size,mime,created_at FROM generated_files "
            + ("WHERE category=? " if category else "")
            + "ORDER BY created_at DESC LIMIT 500", (category,) if category else ()
        ).fetchall()
    return {"files": [dict(row) for row in rows], "backend": BACKEND}


@router.get("/api/generated-files/{file_id}/download")
def download_generated_file(file_id: str):
    item = _get(file_id)
    if BACKEND == "s3":
        url = _s3().generate_presigned_url("get_object",
            Params={"Bucket": _bucket(), "Key": item["storage_key"],
                    "ResponseContentDisposition": f'attachment; filename="{item["name"]}"'},
            ExpiresIn=300)
        return RedirectResponse(url, status_code=307)
    path = ROOT / item["storage_key"]
    if not path.is_file():
        raise HTTPException(404, "Stored file is missing.")
    return FileResponse(path, media_type=item["mime"], filename=item["name"])


@router.delete("/api/generated-files/{file_id}", status_code=204)
def delete_generated_file(file_id: str):
    item = _get(file_id)
    _delete_object(item["storage_key"])
    with _lock, _connect() as conn:
        conn.execute("DELETE FROM generated_files WHERE id=?", (file_id,))
