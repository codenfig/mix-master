# 🎧 MixMaster AI

**MixMaster AI** is a multi-platform AI-assisted DJ mixing project. Users can upload audio tracks, estimate BPM, key and energy, arrange tracks, create crossfaded mixes and export a 320 kbps MP3.

> **Project status: development MVP.** The Python backend and web UI are prototypes. The Flutter client contains analysis and MP3 save flows, but has not been verified on devices. Desktop installers, app-store packages, true beatmatching, production hosting and release testing are not complete.

## 📁 Repository structure

```text
mix-master/
├── README.md                         # Project overview (this file)
├── PLATFORMS.md                      # Platform ownership and development status
├── flutter/                          # Flutter client (Android/iOS; desktop-capable SDK)
│   ├── pubspec.yaml                  # Flutter dependencies and metadata
│   ├── lib/main.dart                 # Track selection, API calls, MP3 save dialog
│   └── README.md                     # Flutter setup and limitations
├── web/                              # Standalone React + TypeScript + Vite studio
│   ├── package.json                  # Web dependencies and build scripts
│   ├── vite.config.ts                # Local FastAPI proxy
│   ├── index.html                    # React application entry
│   ├── src/                          # Dashboard, API client, waveform and styles
│   └── README.md                     # Web development and deployment guide
├── windows/
│   └── README.md                     # Windows desktop setup; packaging pending
├── mac/
│   └── README.md                     # macOS desktop setup; packaging pending
├── linux/
│   └── README.md                     # Linux desktop setup; packaging pending
├── mixmaster_universal/              # Shared Python backend and audio engine
│   ├── server.py                     # FastAPI routes, uploads and MP3 responses
│   ├── engine.py                     # Analysis, arrangement and audio rendering
│   ├── desktop.py                    # pywebview launcher for desktop platforms
│   ├── requirements.txt              # Backend dependencies
│   ├── requirements-desktop.txt      # Desktop launcher dependencies
│   ├── static/                       # Actual responsive web/PWA frontend
│   │   └── index.html                # DJ dashboard and browser-side API calls
│   ├── tests/                        # API and synthetic-audio integration tests
│   └── README.md                     # Detailed backend documentation
└── .github/workflows/                # GitHub Actions checks
    ├── mixmaster-checks.yml          # Python tests and MP3 encoder check
    ├── flutter-checks.yml            # Flutter source analysis
    └── desktop-builds.yml            # Windows/macOS/Linux source checks
```

### What each folder does

| Directory | Responsibility | Current state |
| --- | --- | --- |
| `flutter/` | Flutter UI for selecting tracks, calling the API, and saving MP3 output | Starter implementation; device validation pending |
| `web/` | Independent React + TypeScript DJ dashboard | Implemented in source; build validation pending |
| `windows/` | Windows-specific run instructions and future installer assets | Uses shared desktop launcher; no .exe installer yet |
| `mac/` | macOS-specific run instructions and future app packaging | Uses shared desktop launcher; no signed .app/.dmg yet |
| `linux/` | Linux-specific run instructions and future packages | Uses shared desktop launcher; no AppImage/.deb yet |
| `mixmaster_universal/` | One reusable backend and DSP engine for every client | Development MVP |
| `.github/workflows/` | Automated source checks and tests | Configured; passing status must be verified |

**Why the shared directory?** Web, Flutter and desktop clients all rely on the same Python audio engine. This avoids maintaining different mixing algorithms for every platform. The desktop launcher starts the local API; Flutter and remotely hosted web clients connect to an accessible API endpoint.

## 🔄 How the application works

1. **Select songs:** Choose exactly **5, 10 or 20** supported audio files (MP3, WAV, FLAC, M4A, OGG or AAC). The backend limits each file to **200 MiB**.
2. **Analyze:** `POST /api/analyze` estimates tempo, musical key, duration and energy and proposes an order.
3. **Arrange:** Tracks are ordered broadly from lower to higher energy, using tempo affinity for near-ties.
4. **Mix:** `POST /api/mix` renders equal-power crossfades using a selectable **4–32 second** transition (default 12 seconds).
5. **Export:** The backend returns a stereo **320 kbps MP3** for download or saving.

**Audio limitation:** Current mixing uses crossfades; it does **not** yet perform beat-grid synchronization or phrase alignment; it now supports conservative pitch-preserving tempo matching for nearby BPMs, stem separation or mashups.

## 🛠 Requirements

- Python 3.10–3.12 recommended
- FFmpeg with `libmp3lame` on `PATH` (`ffmpeg -version`)
- Python dependencies from `mixmaster_universal/requirements.txt`
- Optional: Flutter SDK for the Flutter client
- Optional: pywebview and platform-specific WebKit dependencies for desktop windows

## 🌐 Run the web app and API

From the repository root:

```bash
cd mixmaster_universal
python -m venv .venv
# macOS/Linux: source .venv/bin/activate
# Windows PowerShell: .venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn server:app --host 127.0.0.1 --port 8000
```

Open **http://127.0.0.1:8000** in your browser. API health: **http://127.0.0.1:8000/health**.

This runs the legacy browser UI served from `mixmaster_universal/static/index.html`. The new React web studio is separate: run `cd web && npm install && npm run dev` from the repository root in another terminal, then open http://localhost:5173. The Vite development server proxies API requests to FastAPI on port 8000.

## 🎼 Music Generator and AI Lyrics Generator (development)

The React studio includes a **Music Generator** (`/#/full-song`) and
**AI Lyrics Generator** (`/#/lyrics-generator`) in addition to DJ mixing,
audio tools, generated-file browsing, and playback. The studio uses a flat
black/charcoal theme with cyan `#00DDE5` and gold accents.

**Current capabilities and limitations:**

| Feature | Current implementation |
| --- | --- |
| Instrumental previews | Local MusicGen Small adapter; requires separate model download and Python dependencies. Short previews only; audio quality must be tested on each machine. |
| Singing / full songs | Optional external executable interface; no working singing model is bundled or verified on Intel macOS. |
| Lyrics | Local Ollama model (default `llama3.2:3b`) generates song or chorus drafts and can refine existing lyrics. |
| Lyrics review | Offline deterministic checks for song sections, short drafts, long lines and repetition; not a measure of artistic quality. |
| Song projects | Editor draft persistence, JSON import/export, local generated-file library, playback and downloads. |
| Licensing | MusicGen Small model weights are noncommercial (CC BY-NC 4.0). Check licenses before offering commercial generation. |

### Quick start on macOS (Python 3.11)

Install backend requirements into an existing Python 3.11 virtual environment.
For the separately managed Intel Mac environment used during development:

```bash
cd /path/to/mix-master
source "$HOME/MixMasterAI/mixmaster-venv/bin/activate"
cd mixmaster_universal
python -m pip install -r requirements.txt
export MIXMASTER_PYTHON="$HOME/MixMasterAI/mixmaster-venv/bin/python"
export FULL_SONG_ENGINE_EXECUTABLE="$PWD/run_musicgen.sh"
export FULL_SONG_JOB_TIMEOUT_SECONDS=1800
export MIXMASTER_MUSICGEN_DEVICE=cpu
python -m uvicorn server:app --host 127.0.0.1 --port 8000
```

This assumes MusicGen's dependencies and model weights have already been
installed; see [FULL_SONG_ENGINE.md](mixmaster_universal/FULL_SONG_ENGINE.md)
for one-time setup, configuration and diagnostics. If the virtual environment
does not exist, create one with a compatible Python installation first.
Do not use a broken or missing `.venv` activation script.

Start the frontend in **another terminal**:

```bash
cd /path/to/mix-master/web
npm install
npm run dev
```

Open http://localhost:5173/#/full-song or
http://localhost:5173/#/lyrics-generator.

For local AI lyric generation, install and start
[Ollama](https://github.com/ollama/ollama), then pull a supported model:

```bash
ollama pull llama3.2:3b
```

Ollama must be running and listening on `127.0.0.1:11434`. Set
`MIXMASTER_LYRICS_MODEL` to choose another locally installed model.
**Review Lyrics** works without Ollama, but **Generate**, **Regenerate Chorus**
and **Refine Draft with AI** require it.

Useful endpoints:

- `GET /api/full-song/engine` — instrumental and vocal engine status.
- `POST /api/full-song/jobs` — start an asynchronous generation job.
- `GET /api/lyrics/status` — local lyrics-model status.
- `POST /api/lyrics/generate` — song, chorus, or refinement.
- `POST /api/lyrics/review` — deterministic lyric feedback.

See [LYRICS_AGENT_WORKFLOW.md](mixmaster_universal/LYRICS_AGENT_WORKFLOW.md)
for the offline review/revision workflow and
[MUSIC_LYRICS_UPSTREAM.md](mixmaster_universal/MUSIC_LYRICS_UPSTREAM.md)
for upstream projects and model compatibility notes.

**Known issue:** MusicGen Small has produced distorted/noisy instrumental
results on the development Intel Mac. Diagnostic comparison is available via
`mixmaster_universal/diagnose_musicgen_audio.py`. Do not present this
engine as producing reliable commercial-quality music or sung lyrics.

## 🖥 Run Windows, macOS or Linux desktop

From `mixmaster_universal/`:

```bash
python -m pip install -r requirements.txt -r requirements-desktop.txt
python desktop.py
```

The desktop launcher opens a pywebview window connected to a local FastAPI server. It falls back to a browser if pywebview is unavailable. See `windows/README.md`, `mac/README.md` or `linux/README.md` for platform-specific prerequisites.

**This is not yet a distributable installer.**

## 📱 Run the Flutter client

Install Flutter, then:

```bash
cd flutter
flutter create . --platforms=android,ios,windows,macos,linux
flutter pub get
flutter run
```

The `flutter/` directory contains a starter client and configuration, not committed generated platform scaffolding. The app asks for the backend URL, supports audio analysis, calls the mix endpoint and offers an MP3 save dialog.

On a phone, **127.0.0.1 refers to the phone itself**, not your computer. Use a reachable backend URL; a production deployment should use HTTPS and authentication. Current file uploads and downloads are buffered in memory, so large mixes may exhaust device RAM.

## 🧪 Tests and continuous integration

From `mixmaster_universal/`:

```bash
python -m pip install -r requirements.txt pytest httpx
python -m pytest -q tests
```

Tests include API validation and synthetic audio rendering to MP3. The GitHub Actions workflows additionally check Python source, Flutter source and desktop entry points. **Passing CI and end-to-end platform testing have not been confirmed.**

## 🔌 API reference

| Route | Method | Purpose |
| --- | --- | --- |
| `/` | GET | Web dashboard |
| `/health` | GET | API health |
| `/api/analyze` | POST | Analyze uploaded songs and return ordering |
| `/api/mix` | POST | Render and return an MP3 |

For both POST endpoints, submit multipart field `songs` once per file and `count` as 5, 10 or 20. For mixing, optionally submit `transition` (4–32 seconds). Requests are processed synchronously.

## 🔐 Production considerations

This is **not ready for direct public exposure**. It lacks authentication, rate limiting, persistent jobs, quotas and streaming memory-efficient processing. Audio uploads are temporary and rendered files are deleted after transfer. Only upload audio you have permission to use.

## 🚀 Roadmap

- Validate automated tests and real-world audio processing
- Add streaming uploads/downloads, background jobs and progress reporting
- Implement beat-grid synchronization and musical phrase alignment
- Package and sign Windows, macOS and Linux desktop applications
- Test Flutter on Android and iOS and prepare release builds
- Deploy a secured HTTPS backend with monitoring and resource limits

See [PLATFORMS.md](PLATFORMS.md) and the README in each platform folder for additional details.

### Renderer memory behavior

The renderer now decodes each track to a temporary disk-backed float32 file and writes the mixed PCM output in chunks. Transition overlaps remain in memory. Optional pitch-preserving tempo stretching still materializes the full track being stretched, so memory use can be high for long tracks. FFmpeg and adequate temporary disk space are required. Beat-grid and phrase alignment remain future work.

### Beat-phase alignment (experimental)

Analysis now records an estimated first beat offset. During rendering, when consecutive tempos are sufficiently close, the mixer may trim up to 0.8 seconds from the incoming track to align its estimated beat phase with the outgoing track at the crossfade. It falls back safely when beat information is unavailable. This is **not** downbeat detection, phrase alignment, or continuous beat-grid correction, and tempo estimates can be wrong. Listen to transitions before publishing a mix.
