"""Persistent generated-file storage, outside the source tree by default.

Local mode stores bytes under ~/MixMasterAI/Storage. S3 mode uses private
objects and short-lived signed URLs; metadata stays in local SQLite (use a
persistent shared database in a multi-instance deployment).
"""
from __future__ import annotations
import os
import shutil
import re
import html
from hashlib import sha256
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
CATEGORIES = {"dj_mixes", "stem_splitter", "vocal_remover", "audio_mastering", "voice_studio", "text_to_song", "full_song"}
_lock = RLock()


def _connect():
    DB.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("""CREATE TABLE IF NOT EXISTS generated_files (
        id TEXT PRIMARY KEY, category TEXT NOT NULL, name TEXT NOT NULL,
        storage_key TEXT NOT NULL, size INTEGER NOT NULL, mime TEXT NOT NULL,
        created_at TEXT NOT NULL)""")
    columns = {row[1] for row in conn.execute("PRAGMA table_info(generated_files)")}
    for name, definition in (("song_title", "TEXT"), ("artwork_svg", "TEXT"), ("license_status", "TEXT NOT NULL DEFAULT 'not_licensed'")):
        if name not in columns:
            conn.execute(f"ALTER TABLE generated_files ADD COLUMN {name} {definition}")
    conn.execute("""CREATE TABLE IF NOT EXISTS commercial_license_requests (
        id TEXT PRIMARY KEY, file_id TEXT NOT NULL, contact_email TEXT NOT NULL,
        status TEXT NOT NULL, created_at TEXT NOT NULL)""")
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


def song_identity(title: str, description: str, genre: str, lyrics: str = ""):
    """Create a deterministic title and original SVG design from song metadata, not audio analysis."""
    first = next((line.strip() for line in lyrics.splitlines() if line.strip() and not line.lstrip().startswith("[")), "")
    candidate = first if first and len(first.split()) <= 7 else title.strip()
    if not candidate or candidate.lower() in {"untitled", "new song", "my song", "i see you"}:
        candidate = " ".join(re.findall(r"[A-Za-z]+", description)[:4]).title() or genre + " Journey"
    candidate = re.sub(r"[^\\w '-]", "", candidate)[:65].strip() or "New Creation"
    digest = sha256((candidate + description + genre + lyrics).encode()).hexdigest()
    hue = int(digest[:2], 16) * 360 // 256
    second = (hue + 70 + int(digest[2:4], 16) % 80) % 360
    rings = "".join(f'<circle cx="320" cy="285" r="{90+i*35}" fill="none" stroke="white" stroke-opacity=".16" stroke-width="5"/>' for i in range(5))
    artwork = (f'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">'
        f'<defs><linearGradient id="g"><stop stop-color="hsl({hue},70%,28%)"/><stop offset="1" stop-color="hsl({second},65%,42%)"/></linearGradient></defs>'
        f'<rect width="640" height="640" fill="url(#g)"/>{rings}'
        f'<text x="35" y="520" font-family="sans-serif" font-size="32" fill="white">{html.escape(candidate[:32])}</text>'
        f'<text x="35" y="560" font-family="sans-serif" font-size="20" fill="white">{html.escape(genre[:35])} · MixMaster AI</text></svg>')
    return candidate, artwork


def save_generated(source: Path, category: str, name: str, mime: str, *, song_title=None, artwork_svg=None) -> dict:
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
            "created_at": datetime.now(timezone.utc).isoformat(), "song_title": song_title, "artwork_svg": artwork_svg, "license_status": "not_licensed"}
    try:
        with _lock, _connect() as conn:
            conn.execute("""INSERT INTO generated_files
                (id,category,name,storage_key,size,mime,created_at,song_title,artwork_svg,license_status)
                VALUES (:id,:category,:name,:storage_key,:size,:mime,:created_at,:song_title,:artwork_svg,:license_status)""", item)
    except Exception:
        _delete_object(key)
        raise
    return {k: v for k, v in item.items() if k not in {"storage_key", "artwork_svg"}}


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
            "SELECT id,category,name,size,mime,created_at,song_title,license_status, CASE WHEN artwork_svg IS NULL THEN 0 ELSE 1 END AS has_artwork FROM generated_files "
            + ("WHERE category=? " if category else "")
            + "ORDER BY created_at DESC LIMIT 500", (category,) if category else ()
        ).fetchall()
    return {"files": [dict(row) for row in rows], "backend": BACKEND}


@router.get("/api/generated-files/{file_id}/stream")
def stream_generated_file(file_id: str):
    item = _get(file_id)
    if not item["mime"].startswith("audio/"):
        raise HTTPException(400, "Only audio files can be streamed.")
    if BACKEND == "s3":
        url = _s3().generate_presigned_url("get_object", Params={"Bucket": _bucket(), "Key": item["storage_key"], "ResponseContentType": item["mime"]}, ExpiresIn=300)
        return RedirectResponse(url, status_code=307)
    path = ROOT / item["storage_key"]
    if not path.is_file():
        raise HTTPException(404, "Stored file is missing.")
    return FileResponse(path, media_type=item["mime"], content_disposition_type="inline")


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


@router.get("/api/generated-files/{file_id}/artwork")
def artwork_for_song(file_id: str):
    from fastapi.responses import Response
    item = _get(file_id)
    if not item.get("artwork_svg"):
        raise HTTPException(404, "No cover artwork for this track.")
    return Response(item["artwork_svg"], media_type="image/svg+xml", headers={"X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox"})


@router.post("/api/generated-files/{file_id}/commercial-license-request", status_code=202)
def commercial_license_request(file_id: str, payload: dict):
    item = _get(file_id)
    if item["category"] not in {"full_song", "text_to_song"}:
        raise HTTPException(400, "Only generated songs are eligible.")
    email = str(payload.get("email", "")).strip()
    if len(email) > 254 or not re.fullmatch(r"[^\\s@]+@[^\\s@]+\\.[^\\s@]+", email):
        raise HTTPException(422, "Valid contact email required.")
    request_id = uuid4().hex
    with _lock, _connect() as conn:
        conn.execute("INSERT INTO commercial_license_requests (id,file_id,contact_email,status,created_at) VALUES (?,?,?,?,?)", (request_id,file_id,email,"pending",datetime.now(timezone.utc).isoformat()))
    return {"id":request_id,"status":"pending","payment_enabled":False,"message":"Request received. No commercial rights granted; payment and rights verification are not yet available."}
