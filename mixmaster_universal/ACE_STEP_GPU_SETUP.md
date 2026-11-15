# ACE-Step GPU worker setup (experimental)

MixMaster's **instrumental** engine remains local MusicGen. Full-song vocals can use a separately hosted ACE-Step 1.5 API on a Linux NVIDIA GPU. No third-party paid music-generation API is required, but GPU hosting is billed by the provider.

## Worker

Provision a Linux NVIDIA GPU machine with sufficient VRAM and disk, install ACE-Step from its official repository and download its model weights. Follow the ACE-Step release's installation and API-server instructions; verify that `/health`, `/release_task`, `/query_result` and `/v1/audio` match this adapter's expected API contract. Actual compatibility has **not yet been tested**.

Keep the API private. Use an authenticated HTTPS reverse proxy or private network; do not expose an unauthenticated generation endpoint to the public Internet. `ACESTEP_API_KEY` is passed as a bearer token and must be checked by the API gateway or worker. Never put it in frontend code or Git.

## MixMaster backend

From `mixmaster_universal/`:

```sh
chmod +x run_ace_step_gpu.sh
export ACESTEP_API_URL=https://YOUR-PRIVATE-GPU-ENDPOINT
export ACESTEP_API_KEY=YOUR_SECRET_TOKEN
export MIXMASTER_PYTHON="$(pwd)/.venv/bin/python"
python -m uvicorn server:app --host 127.0.0.1 --port 8000
```

The backend chooses `run_ace_step_gpu.sh` automatically for `full_song` when both ACE-Step variables are present, unless `FULL_SONG_VOCAL_EXECUTABLE` explicitly overrides it. It does not claim isolated `vocals` output. The `/api/full-song/engine` endpoint checks configuration, **not remote GPU health**. Only enable Full Song Studio after the worker is deployed and verified.

The existing in-process job queue and five-minute timeout are development-only. For production, move jobs to a durable queue, add account authentication and authorization for generated files, enforce usage credits server-side, and use shared durable storage/metadata. Check model licensing before charging users.

## Smoke test

```sh
curl http://127.0.0.1:8000/api/full-song/engine
python -m pytest tests/test_full_song_jobs.py -q
```

Then submit a short full-song project from the UI and inspect backend logs. GPU inference and end-to-end song quality have not been verified.
