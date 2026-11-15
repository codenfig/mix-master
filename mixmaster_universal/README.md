# MixMaster AI — Universal MVP

**Targets:** Web (desktop/mobile browsers), Windows, macOS, Linux; installable web experience on supported iPhone/Android browsers. **Not yet native iOS/Android binaries.** All audio processing is done by the Python backend; a hosted HTTPS deployment is required for phone access outside your computer's network.

## Architecture

- `static/index.html`: responsive upload UI and progress status, PWA manifest.
- `server.py`: FastAPI, upload validation, temporary storage and MP3 download.
- `engine.py`: librosa BPM/key/energy estimation, ascending energy arrangement, 12-second equal-power crossfades, FFmpeg 320 kbps encoding.
- `desktop.py`: optional pywebview native window, backed by the same local FastAPI server.

## Requirements

Python 3.10–3.12 recommended; FFmpeg with `libmp3lame` installed and available in PATH (`ffmpeg -version`). Install native Python libraries using `pip install -r requirements.txt`.

## Run on the web (local development)

```bash
python -m venv .venv
# macOS/Linux: source .venv/bin/activate
# Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn server:app --host 127.0.0.1 --port 8000
```

Open http://127.0.0.1:8000. For phones, deploy behind HTTPS with a production ASGI server and an appropriately configured reverse proxy (including upload limits/timeouts). Do **not** expose this prototype directly to the public internet: it has no authentication, job queue, rate limiting or resource quotas.

## Run as desktop app

```bash
pip install -r requirements-desktop.txt
python desktop.py
```

On Linux, pywebview may require WebKit2GTK system packages. If pywebview isn't installed, the launcher opens the local browser. Native installers / app-store packages are future work.

## MVP behavior and caveats

- Requires exactly 10 tracks; accepts MP3/WAV/FLAC/M4A/OGG/AAC, up to 200 MiB each.
- Uses approximate tempo/key and energy detection; track order builds energy, with near-tie tempo affinity.
- Renders nine 12-second crossfades (for tracks >24 seconds) and a stereo 320 kbps MP3.
- Does **not** do beatmatching, phrase detection, time stretching, stem separation or true mashups.
- Each song is fully decoded in RAM during rendering; long songs can consume significant memory. Processing is synchronous and may time out on hosted deployments.
- Uploads and mixes are temporary; mix file is deleted after transfer. The app does not retain a library.
- Only process audio you have permission to use.

## Suggested next phase

Background worker with job status/polling, authentication and quotas, streaming audio processing, robust tests, waveform previews, and true beat/phrase alignment. For mobile app-store binaries, wrap the hosted web frontend using Capacitor and configure native permissions and file handling.

## macOS installation troubleshooting (llvmlite / LLVM)

Use Python **3.12** when a Python 3.13 environment attempts to compile `llvmlite` and fails with `LLVMConfig.cmake` not found. Recreate the virtual environment; changing the system Python does not change an existing venv.

```bash
brew install python@3.12 ffmpeg
# From the mixmaster_universal directory; deactivate first if necessary.
rm -rf .venv
"$(brew --prefix python@3.12)/bin/python3.12" -m venv .venv
source .venv/bin/activate
python --version
python -m pip install --upgrade pip setuptools wheel
python -m pip install -r requirements.txt
python -m uvicorn server:app --reload --host 127.0.0.1 --port 8000
```

If `llvmlite` still tries to compile, inspect the Python version and architecture with `python -c "import platform,sys; print(sys.version,platform.machine())"`. Avoid mixing x86_64 Python with arm64 Homebrew packages.
