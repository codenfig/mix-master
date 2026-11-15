"""Local-only ACE-Step 1.5 REST adapter for MixMaster Full Song Studio.

Usage: python ace_step_adapter.py project.json output.wav
ACE-Step must already be running on 127.0.0.1:8001 with models installed.
No remote service, cloud API or paid credentials are used.
"""
import json
import os
import sys
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

BASE = os.environ.get("ACESTEP_BASE_URL", "http://127.0.0.1:8001").rstrip("/")
TIMEOUT = int(os.environ.get("ACESTEP_JOB_TIMEOUT_SECONDS", "900"))
parsed_base = urlsplit(BASE)
if parsed_base.scheme not in {"http", "https"} or not parsed_base.hostname or parsed_base.username or parsed_base.password or parsed_base.path not in {"", "/"}:
    raise RuntimeError("ACESTEP_BASE_URL must be an HTTP(S) origin without a path or credentials.")
if parsed_base.scheme == "http" and parsed_base.hostname not in {"127.0.0.1", "localhost", "::1"}:
    raise RuntimeError("Remote ACE-Step requires HTTPS; plain HTTP is allowed only on loopback.")
if parsed_base.hostname not in {"127.0.0.1", "localhost", "::1"} and not os.environ.get("ACESTEP_API_KEY", "").strip():
    raise RuntimeError("Remote ACE-Step requires ACESTEP_API_KEY.")



def _api(path, payload=None):
    headers = {"Content-Type": "application/json"}
    token = os.environ.get("ACESTEP_API_KEY", "").strip()
    if token:
        headers["Authorization"] = "Bearer " + token
    request = Request(BASE + path, data=json.dumps(payload).encode() if payload is not None else None,
                      headers=headers)
    try:
        with urlopen(request, timeout=30) as response:
            body = json.load(response)
    except (HTTPError, URLError, TimeoutError) as exc:
        raise RuntimeError("Local ACE-Step API unavailable: " + str(exc)) from exc
    if body.get("code", 200) != 200 or body.get("error"):
        raise RuntimeError("ACE-Step rejected request: " + str(body.get("error") or body.get("code")))
    return body.get("data")


def make_payload(project):
    output = project.get("output")
    if output != "full_song":
        raise ValueError("ACE-Step adapter currently supports mixed full_song only, not isolated vocal stems.")
    voice = project.get("voice", "female")
    if voice not in {"female", "male", "duet"}:
        raise ValueError("Unsupported voice option.")
    voice_prompt = {"female": "female lead singing", "male": "male lead singing",
                    "duet": "male and female duet singing"}[voice]
    description = str(project.get("description", "")).strip()
    lyrics = str(project.get("lyrics", "")).strip()
    if not description or not lyrics:
        raise ValueError("Music description and lyrics are required.")
    return {"prompt": (f"{project.get('genre', 'pop')}, {voice_prompt}, {description}")[:2000],
            "lyrics": lyrics[:12000], "bpm": int(project.get("bpm", 110)),
            "audio_duration": min(int(project.get("minutes", 3)) * 60, 600),
            "vocal_language": "en", "audio_format": "wav",
            "thinking": False, "use_format": False}


def _download_audio(path, destination):
    parsed = urlsplit(path)
    if parsed.scheme or parsed.netloc or parsed.path != "/v1/audio":
        raise RuntimeError("ACE-Step returned an invalid local audio URL.")
    request = Request(BASE + path)
    token = os.environ.get("ACESTEP_API_KEY", "").strip()
    if token:
        request.add_header("Authorization", "Bearer " + token)
    with urlopen(request, timeout=120) as response, destination.open("wb") as output:
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            output.write(chunk)


def main():
    if len(sys.argv) != 3:
        raise SystemExit("Usage: ace_step_adapter.py project.json output.wav")
    project = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    payload = make_payload(project)
    _api("/health")
    task = _api("/release_task", payload)
    if not isinstance(task, dict) or not task.get("task_id"):
        raise RuntimeError("ACE-Step did not return a task ID.")
    task_id = task["task_id"]
    deadline = time.monotonic() + TIMEOUT
    while time.monotonic() < deadline:
        result = _api("/query_result", {"task_id_list": [task_id]})
        if not isinstance(result, list) or not result:
            raise RuntimeError("ACE-Step returned no task status.")
        item = result[0]
        if item.get("status") == 2:
            raise RuntimeError("ACE-Step generation failed: " + str(item.get("result", ""))[:500])
        if item.get("status") == 1:
            files = item.get("result", [])
            if isinstance(files, str):
                files = json.loads(files)
            if not files or not isinstance(files, list):
                raise RuntimeError("ACE-Step returned no audio files.")
            _download_audio(files[0]["file"], Path(sys.argv[2]))
            return
        time.sleep(2)
    raise TimeoutError("ACE-Step did not finish within the local job time limit.")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ACE-Step adapter: {exc}", file=sys.stderr)
        raise SystemExit(1)
