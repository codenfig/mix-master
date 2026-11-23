# MixMaster AI — shared audio processing backend

FastAPI + Python audio processing services for Music Mix, Audio Mastering, Stem Splitter, Vocal Remover, Voice Studio, and stored audio-processing outputs.

Music generation routes and model adapters have moved to [Melodiva AI](https://github.com/codenfig/Melodiva-AI). The source metadata and media files are deliberately **not** deleted by a Git commit. See `../docs/melodiva-migration.md`.

## Run

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
uvicorn server:app --reload --host 127.0.0.1 --port 8000
```

Install FFmpeg on your system. The API is documented at `/docs`. The frontend runs at http://localhost:5173 (see `../web/README.md`).

Core modules:
- `server.py`: API application and shared upload/analysis helpers
- `music_mix.py`: energy-based analysis and mixing endpoints
- `engine.py`: audio analysis and shared crossfade DSP
- `audio_mastering.py`: mastering jobs and WAV/MP3/FLAC outputs
- `vocal_remover.py` / `stem_splitter.py`: audio separation
- `voice_studio.py`: voice processing
- `generated_storage.py`: shared non-generation output storage
- `desktop.py`: desktop browser/pywebview launcher

## Storage safety

Default storage location: `~/MixMasterAI/Storage`. Do not delete the original metadata or audio. A separate Melodiva migration utility copies generation categories to `~/MelodivaAI/Storage` after backups and verification. The processing library only exposes its retained categories and does not delete archived song records.

Use `storage.env.example` to configure local/S3 output storage. Do not check credentials into source control.

## Verification

```bash
python -m compileall -q .
python -m pytest -q tests
```

Non-generation audio processing still depends on FFmpeg and local model installs for optional voice/separation workflows. No new music-generation engine is configured in MixMaster.
