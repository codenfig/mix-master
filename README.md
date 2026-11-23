# MixMaster AI — audio processing studio

MixMaster focuses on **working with existing audio**: energy-based Music Mix, Audio Mastering, Stem Splitter, Vocal Remover, Voice Studio, and a library of processed outputs.

**Music generation has moved to [Melodiva AI](https://github.com/codenfig/Melodiva-AI).** That application now owns full-song generation, instrumental composition, lyrics generation, song extension, AI model adapters, generated-song storage, and music commercial licensing. See [the migration/cutover guide](docs/melodiva-migration.md).

> This cleanup is prepared on branch `migration/remove-music-generation`. It is not ready to merge until the Melodiva application, model engines and user-data transfer have been independently verified. Do not remove, overwrite or destroy historic music recordings or metadata.

## Run locally

### Backend

```bash
cd mixmaster_universal
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
python -m uvicorn server:app --reload --host 127.0.0.1 --port 8000
```

Install FFmpeg for audio processing.

### Web studio

```bash
cd web
npm ci
npm run dev
```

Open http://localhost:5173/#/overview . The Vite development server proxies backend requests to port 8000.

## Retained tools

- **Music Mix**: upload 2–20 songs, analyze energy and create seamless full-song mixes using crossfades.
- **Audio Mastering**: loudness targets, four-band EQ, stereo width, high-pass filters, compression, limiter, WAV/MP3/FLAC export and comparison metrics.
- **Stem Splitter** and **Vocal Remover**: source-audio separation workflows.
- **AI Voice Studio**: existing voice processing / conversion workflows.
- **Processed Files**: independent storage for audio mastering, stem and vocal processing, DJ mix archive data and voice processing outputs.

MixMaster's `generated_storage.py` remains **because mastering and separation tools depend on it**. It restricts active records and API visibility to non-generation categories, and it never deletes existing music-generation data automatically.

## Testing

```bash
cd mixmaster_universal
python -m compileall -q .
python -m pytest -q tests
cd ../web
npm ci
npm run build
```

This repository is a development MVP. Production authentication, quotas, model deployment and backup/restore procedures require additional hardening. Only process audio you have permission to use.
