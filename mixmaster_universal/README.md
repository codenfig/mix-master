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

## Experimental phrase-grid transitions and automatic evaluation

The engine estimates 4/4, four-bar phrase entry points from detected tempo and first-beat offset. When safe for track length, it trims incoming intros toward those grid positions. This is a heuristic, not reliable detection of verses, choruses, drops or downbeats.

For each crossfade the engine evaluates up to four candidate entry offsets (0, 0.25, 0.5 and 0.75 seconds), scoring short-time loudness mismatch, spectral centroid mismatch and peak overload. It selects the highest-scoring candidate and reports the score and number of attempts via the async job status API. These are signal-based proxy scores, **not learned perceptual ratings**. Optimization is local to each crossfade; it does not rerender entire mixes, analyze human preferences or guarantee professional results. The frontend displays the per-transition report after rendering.

Run regression tests from this directory with `python -m pytest tests -q` after installing the test dependencies and FFmpeg.


## Audio-conditioned Extend Music (experimental integration)

The Music Generator's **More → Extend** editor previews the selected song, lets the user
choose a cutoff, continuation prompt, optional lyrics and duration, and polls an
asynchronous extension job. The original audio is passed to a separate extension
engine; a text-to-music engine cannot be used as a substitute.

Set `FULL_SONG_EXTENSION_EXECUTABLE` to an executable file implementing this contract:

```text
extension_engine /absolute/temp/request.json /absolute/temp/continuation.wav
```

The request JSON includes `source_audio_path` (an actual locally materialized PCM WAV),
`source_duration_seconds`, `start_seconds`, `duration_seconds`, `prompt`,
`lyrics`, `title` and `source_file_id`. The executable **must** use the audio
around the requested start point as conditioning context and output only the newly
generated continuation as uncompressed PCM WAV. It must exit nonzero on failure.
It must not return a complete copy of the original track or generate from text alone.

The integration does **not** bundle, install, or verify a continuation-capable AI model.
Until a compatible executable is configured, the editor disables generation and the
API returns HTTP 503. This is intentional: ordinary song generation is not extension.

Install FFmpeg on the backend PATH to merge the original through the selected cutoff
and the generated continuation, with a 0.5-second-or-shorter crossfade. The merged
track and standalone extension are both saved to My Music. Without FFmpeg, only the
standalone extension is saved, and the editor reports the missing merge capability.
The server keeps jobs in memory, so restarting the server loses their status.

Endpoints: `GET /api/full-song/extensions/capabilities`,
`POST /api/full-song/extensions`, `GET /api/full-song/extensions/{job_id}`.
