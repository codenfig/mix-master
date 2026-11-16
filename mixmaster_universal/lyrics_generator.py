"""Offline lyrics generation through a user-installed local Ollama server."""
import json
import os
import re
import urllib.error
import urllib.request
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from lyrics_quality import build_refinement_prompt, inspect_lyrics

router = APIRouter(prefix="/api/lyrics", tags=["lyrics"])
OLLAMA_URL = "http://127.0.0.1:11434"
LANGUAGES = {"English", "Swahili", "French", "Spanish", "Portuguese", "Hindi", "Arabic", "German", "Italian"}
STRUCTURES = {"standard", "short", "extended"}

class LyricsRequest(BaseModel):
    topic: str = Field(min_length=2, max_length=300)
    genre: str = Field(default="Afro-pop", max_length=80)
    mood: str = Field(default="Uplifting", max_length=80)
    language: str = Field(default="English")
    structure: str = Field(default="standard")
    voice: str = Field(default="Any", max_length=50)
    existing_lyrics: str = Field(default="", max_length=12000)
    mode: str = Field(default="song")

class LyricsReviewRequest(BaseModel):
    lyrics: str = Field(min_length=1, max_length=12000)
    structure: str = Field(default="standard")

@router.post("/review")
def review_lyrics(body: LyricsReviewRequest):
    if body.structure not in STRUCTURES:
        raise HTTPException(422, "Unsupported song structure.")
    return inspect_lyrics(body.lyrics, body.structure)

def model_name() -> str:
    return os.environ.get("MIXMASTER_LYRICS_MODEL", "llama3.2:3b")

def ollama_request(path: str, payload: dict | None = None) -> dict:
    url = OLLAMA_URL + path
    request = urllib.request.Request(
        url, data=json.dumps(payload).encode("utf-8") if payload is not None else None,
        headers={"Content-Type": "application/json"}, method="POST" if payload is not None else "GET"
    )
    try:
        with urllib.request.urlopen(request, timeout=110 if payload is not None else 4) as response:
            return json.loads(response.read(1_500_000))
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
        raise HTTPException(503, "Local Ollama is unavailable or timed out. Start Ollama and install the configured lyrics model.") from exc

@router.get("/status")
def lyrics_status():
    try:
        models = ollama_request("/api/tags").get("models", [])
    except HTTPException:
        return {"available": False, "model": model_name(), "reason": "Ollama is not running at 127.0.0.1:11434"}
    installed = any(item.get("name") == model_name() or item.get("model") == model_name() for item in models)
    return {"available": installed, "model": model_name(), "reason": None if installed else "Install the model with: ollama pull " + model_name()}

@router.post("/generate")
def generate_lyrics(body: LyricsRequest):
    if body.language not in LANGUAGES or body.structure not in STRUCTURES or body.mode not in {"song", "chorus", "refine"}:
        raise HTTPException(422, "Unsupported lyrics generation option.")
    status = lyrics_status()
    if not status["available"]:
        raise HTTPException(503, status["reason"])
    structure = {
        "short": "[Verse 1], [Chorus], [Verse 2], [Final Chorus]",
        "standard": "[Verse 1], [Pre-Chorus], [Chorus], [Verse 2], [Bridge], [Final Chorus]",
        "extended": "[Intro], [Verse 1], [Pre-Chorus], [Chorus], [Verse 2], [Chorus], [Bridge], [Final Chorus], [Outro]",
    }[body.structure]
    if body.mode in {"chorus", "refine"} and not body.existing_lyrics.strip():
        raise HTTPException(422, "Enter or generate lyrics before revising them.")
    instruction = (
        "You are an expert songwriter. Write ORIGINAL, singable song lyrics. Do not imitate a named artist or reproduce existing songs. "
        "Return ONLY lyrics, with section headings in square brackets. No introduction or commentary. "
        "Keep language natural, use 6 to 10 syllables per line where practical, and give the chorus a memorable recurring hook. "
        "Use concise verses and avoid repetitive filler. Do not include existing copyrighted lyrics. "
        f"Language: {body.language}. Genre: {body.genre}. Mood: {body.mood}. Vocal style: {body.voice}. "
        f"Song topic: {body.topic}. "
    )
    if body.mode == "refine":
        critique = inspect_lyrics(body.existing_lyrics, body.structure)
        issues = "\n".join("- " + item for item in critique["issues"])
        if not issues:
            issues = "- Strengthen natural phrasing, imagery, musical flow and the chorus hook while preserving the original message."
        instruction = build_refinement_prompt(
            lyrics=body.existing_lyrics, topic=body.topic, genre=body.genre,
            mood=body.mood, language=body.language, feedback=issues,
        )
    elif body.mode == "chorus":
        instruction += (
            "Rewrite ONLY the chorus, using a [Chorus] heading, to fit the following existing song. "
            "Do not output the rest of the song. Existing song:\n" + body.existing_lyrics
        )
    else:
        instruction += ("Write a complete song using this exact section order: " + structure + ". "
                        "Write 4 to 8 lines per verse, 2 to 4 lines per pre-chorus, and 4 to 6 lines per chorus. "
                        "Repeat the chorus hook in the final chorus while allowing a small lyrical variation.")
    result = ollama_request("/api/generate", {
        "model": model_name(), "prompt": instruction, "stream": False,
        "options": {"temperature": 0.85, "num_predict": 1250}
    })
    lyrics = str(result.get("response", "")).strip()
    lyrics = re.sub(r"^\\x60{3}(?:text|markdown)?\\s*\\n|\\n\\x60{3}\\s*$", "", lyrics, flags=re.IGNORECASE).strip()
    if not lyrics:
        raise HTTPException(502, "The local model returned no lyrics.")
    return {"lyrics": lyrics[:12000], "model": model_name(), "mode": body.mode,
            "review": inspect_lyrics(lyrics[:12000], body.structure) if body.mode != "chorus" else None}
