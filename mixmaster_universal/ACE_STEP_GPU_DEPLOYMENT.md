# ACE-Step GPU worker integration (experimental)

MixMaster AI supports a **separate GPU-hosted ACE-Step 1.5 API** for mixed music with singing. MusicGen remains the instrumental engine. The GPU worker is self-hosted: no paid music-generation API is required, but GPU infrastructure costs money.

## GPU server

Provision a Linux NVIDIA GPU instance (for example, RunPod) and install ACE-Step 1.5 from its official repository. Download model weights and start the **ACE-Step API server**, not just the Gradio UI. Confirm the server exposes `/health`, `/release_task`, `/query_result`, and `/v1/audio`. The REST request/response contract may vary by ACE-Step version and must be tested against your installed version.

**Security:** Never expose an unauthenticated ACE-Step API directly to the internet. Place it behind a reverse proxy or private network with TLS and authentication. The adapter supports `ACESTEP_API_KEY` as a Bearer token. For non-loopback endpoints it requires HTTPS and a key. Limit network access and rate-limit generation. For production, use private connectivity or a proxy that verifies the token.

## MixMaster backend environment

Run these commands on the machine hosting FastAPI (not on the GPU machine):

```bash
cd mixmaster_universal
chmod +x run_acestep_gpu.py
export ACESTEP_BASE_URL="https://your-secure-gpu-api.example"
export ACESTEP_API_KEY="replace-with-a-strong-secret"
export FULL_SONG_VOCAL_EXECUTABLE="$(pwd)/run_acestep_gpu.py"
export ACESTEP_JOB_TIMEOUT_SECONDS=900
export FULL_SONG_VOCAL_TIMEOUT_SECONDS=1200
export FULL_SONG_JOB_TIMEOUT_SECONDS=1200
python -m uvicorn server:app --host 127.0.0.1 --port 8000
```

The default ACE-Step endpoint is `http://127.0.0.1:8001`, useful for local port forwarding to a private GPU service. Do not commit API keys or .env files.

Verify `GET /api/full-song/engine` then submit a Full Song Studio job with output `full_song`, description and **nonempty lyrics**. The adapter only supports **mixed full songs**, not isolated vocals. Vocal voice labels are prompts, not guarantees.

## Limits before production

- The current engine readiness check verifies the configured executable exists; it **does not probe the remote GPU service**. A configured executable does not mean the model is running.
- The ACE-Step adapter is an initial implementation and has **not been integration-tested** against a live ACE-Step 1.5 server. Confirm endpoint payloads and returned audio URL formats before production use.
- Full-song jobs are in-process and lost on restart. Migrate to durable jobs and workers for production.
- Protect FastAPI endpoints with authentication, quotas and per-user file authorization. The existing generated-files API is not multi-tenant secure.
- Generation can take longer than 5 minutes; vocal timeouts are configurable. GPU memory, model license, output quality and inference performance require verification.

## Optional shell bridge

`run_ace_step_remote.sh` is an alternative wrapper around `ace_step_adapter.py`; run `chmod +x mixmaster_universal/run_ace_step_remote.sh` before using it. The documented Python executable `run_acestep_gpu.py` remains the preferred entry point.
