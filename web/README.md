# MixMaster AI Web Studio

A standalone **React + TypeScript + Vite** frontend for the existing Python FastAPI audio engine.

## Features
- Responsive dark DJ dashboard with track upload and drag-and-drop
- 5, 10 or 20 song selection, audio extension and size validation
- BPM, key, duration and energy analysis
- Autonomous energy- and harmonic-aware track planning with explainable compatibility scores
- Adjustable 4–32-second crossfade settings
- MP3 rendering, WaveSurfer waveform playback and download
- Cancelable browser requests and readable error messages

## Run locally

Start the backend in terminal one:

```bash
cd mixmaster_universal
python -m pip install -r requirements.txt
python -m uvicorn server:app --host 127.0.0.1 --port 8000
```

Install FFmpeg first. Then start the frontend in terminal two, from the repository root:

```bash
cd web
npm install
npm run dev
```

Open http://localhost:5173. Vite proxies `/api` and `/health` to FastAPI on port 8000, avoiding cross-origin issues in local development.

## Build

```bash
cd web
npm install
npm run build
npm run preview
```

The production frontend build goes to `web/dist/`. Deploy it to a static web host and route `/api/*` to your secured FastAPI service. The current app uses relative API URLs, so the deployment must provide a same-origin reverse proxy or be adapted to a configurable API base URL.

## Architecture

- `src/App.tsx` — dashboard, workflow and application state
- `src/api.ts` — typed FastAPI multipart requests
- `src/Waveform.tsx` — WaveSurfer playback visualization
- `src/styles.css` — responsive neon DJ theme
- `vite.config.ts` — development proxy
- `../mixmaster_universal/server.py` — audio API
- `../mixmaster_universal/engine.py` — analysis and crossfade rendering

The legacy HTML frontend remains at `mixmaster_universal/static/index.html`; it is not automatically replaced by the React build.

## Important limitations

This is a development MVP, not a production deployment. Rendering uses conservative pitch-preserving tempo matching when BPMs are close, but beat-grid and phrase alignment are not yet implemented. Rendering remains synchronous; canceling a browser request does not guarantee cancellation of backend processing. Upload progress and server-side job status are not yet available. WaveSurfer decodes rendered audio in the browser and can use significant memory for long mixes. Authentication, background jobs, quotas, production security and real-audio testing remain necessary.
