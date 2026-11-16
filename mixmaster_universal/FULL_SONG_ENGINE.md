# Full Song Studio: offline engine adapter (Stage 3)

MixMaster does not download a model or call a paid service. To enable generation,
install a **trusted local music-generation engine** and configure an executable
adapter. No specific singing model is bundled; model quality, voice selection,
lyric adherence, and duration depend on the engine you connect.

## Engine contract

Set `FULL_SONG_ENGINE_EXECUTABLE` to the **absolute path of an executable file**.
For example, after installing your own local model and adapter:

```bash
export FULL_SONG_ENGINE_EXECUTABLE="$HOME/MixMasterAI/engines/run-full-song"
```

The backend invokes it without a shell:

```text
run-full-song /temporary/workdir/project.json /temporary/workdir/song.wav
```

The first argument is a JSON object containing `title`, `description`,
`lyrics`, `voice` (`female`, `male`, `duet`), `genre`, `output`,
`bpm`, and `minutes`. The second argument is the destination **PCM WAV** file.

The adapter must exit with code 0 after writing valid nonempty PCM WAV audio.
The backend uses `FULL_SONG_JOB_TIMEOUT_SECONDS` (default 1,200 seconds,
clamped to 60–7,200 seconds) for instrumental jobs. Vocal jobs can use
`FULL_SONG_VOCAL_TIMEOUT_SECONDS` (defaulting to the same configured value).
Successful output is stored in Generated Files; failed outputs are not saved.

The engine is **not** bundled and must be installed separately. Do not point
this setting at untrusted programs. The backend currently does not enforce
network isolation for external executables; choose an offline engine and disable
its network access at the OS/container level if strict isolation is required.

## Quick checks

```bash
curl http://127.0.0.1:8000/api/full-song/engine
```

If `generation_available` is false, the Full Song Studio generation button
remains disabled. Draft saving and JSON export continue to work.

This integration is not a promise of realistic sung lyrics. It is an adapter
foundation for a model that you install, validate, and license appropriately.

## Optional MusicGen Small instrumental preview (noncommercial)

This repository includes `setup_musicgen.py`, `musicgen_adapter.py`, and
`run_musicgen.sh`. This is a **short instrumental preview** implementation,
not a full song or vocal synthesizer. MusicGen Small's model license is
CC BY-NC 4.0; do not deploy it commercially without appropriate rights.

On the Mac, from `mixmaster_universal` with your virtualenv activated:

```bash
python -m pip install torch transformers huggingface_hub sentencepiece soundfile numpy
python setup_musicgen.py
chmod +x run_musicgen.sh
export FULL_SONG_ENGINE_EXECUTABLE="$(pwd)/run_musicgen.sh"
python -m uvicorn server:app --host 127.0.0.1 --port 8000
```

The one-time download requires internet and model storage space; subsequent
inference loads only from `~/MixMasterAI/Models/musicgen-small` without network
requests. Select **Instrumental** output on the Full Song Studio page.
The adapter defaults to 512 generated tokens (approximately 10 seconds of audio)
regardless of the requested song length. Set `MIXMASTER_MUSICGEN_MAX_TOKENS`
(128–1,500) to adjust preview length. GPU/MPS availability, model dependencies,
memory and CPU performance affect generation speed. A configurable job deadline
applies; heavy CPU inference may exceed it.

The wrapper uses `MIXMASTER_PYTHON` when set, otherwise `python3` on `PATH`.
For a separate virtual environment, set for example:

```bash
export MIXMASTER_PYTHON="$HOME/MixMasterAI/mixmaster-venv/bin/python"
```

Ensure that interpreter has MusicGen dependencies installed.
No model weights are committed to GitHub. Verify the model's license and
test compatibility with your local PyTorch/Transformers versions.

## Stage 5: dedicated singing-vocal engine interface

A singing-capable local executable can be connected separately:

```bash
export FULL_SONG_VOCAL_EXECUTABLE="$HOME/MixMasterAI/engines/run-vocal-model"
```

This is **not** a bundled vocal model. The executable must follow the same
two-argument project-JSON / output-PCM-WAV contract as the instrumental
engine. For `output=full_song` it must create the **complete mixed song**
(instrumental plus singing); for `output=vocals` it must create vocals only.
The JSON includes `voice=female|male|duet`, `lyrics`, and other song settings.
The external model is responsible for obeying these settings. MixMaster does
not yet verify the sung words, voice identity, arrangement or song duration.

`GET /api/full-song/engine` reports separate `capabilities` for
instrumental, vocals and full_song. This indicates only that the executable
exists and can be started, **not** that the model has been tested or supports
all three voice modes. The MusicGen Small adapter remains instrumental-only.

## Background jobs and local verification

The recommended endpoint is `POST /api/full-song/jobs`, returning HTTP 202
and a job ID. Poll `GET /api/full-song/jobs/{id}` every two seconds. To
cancel, `POST /api/full-song/jobs/{id}/cancel`. The UI remembers an active
job ID in browser session storage, so refreshing the page can reconnect
while the **same Python server process** is running.

Jobs are limited to one active job per Python process. The process group is
terminated on cancellation or when the configured job timeout expires. Model stdout/stderr is
captured to a temporary log and the last part is surfaced on engine failure.
Treat engine error text as potentially sensitive; do not expose this local
development endpoint publicly without authentication and error sanitization.

Run local verification from `mixmaster_universal`:

```bash
source .venv/bin/activate
python -m pytest tests/test_song_arrangement.py tests/test_full_song_jobs.py -q
python -m uvicorn server:app --host 127.0.0.1 --port 8000
```

Then in a second terminal:

```bash
curl --max-time 10 http://127.0.0.1:8000/api/full-song/engine
```

Run `npm run build` from `web/` to check TypeScript and Vite.

**Deployment caveats:** Jobs and status are in-memory and do not survive
server restarts or work across multiple workers. No per-user access controls,
durable queue, or persistent progress database are provided. Do not deploy
this local job API as a public multi-user service without addressing these.

## Preflight before generating

From the backend virtual environment run:

```bash
python check_full_song.py
```

This reports installed Python packages, local MusicGen model-file presence,
and whether instrumental/vocal engine launchers are configured and executable.
It makes **no network requests** and does not load the model. File presence
does not prove that a model can run successfully.

If the backend was previously stuck on port 8000, verify it responds before
generating:

```bash
curl --max-time 10 http://127.0.0.1:8000/api/full-song/engine
```

A timeout here is a backend availability problem, not slow song composition.

## Intel Mac: reproducible offline preview and audio diagnostics

From the repository root, after installing dependencies and downloading the
model once, run:

```bash
source "$HOME/MixMasterAI/mixmaster-venv/bin/activate"
cd mixmaster_universal
export MIXMASTER_PYTHON="$HOME/MixMasterAI/mixmaster-venv/bin/python"
export FULL_SONG_ENGINE_EXECUTABLE="$PWD/run_musicgen.sh"
export FULL_SONG_JOB_TIMEOUT_SECONDS=1800
export MIXMASTER_MUSICGEN_DEVICE=cpu
export MIXMASTER_MUSICGEN_MAX_TOKENS=256
export MIXMASTER_MUSICGEN_GUIDANCE_SCALE=3.0
export MIXMASTER_MUSICGEN_SAVE_RAW=1
python -m uvicorn server:app --host 127.0.0.1 --port 8000
```

The optional diagnostic file is written to
`~/MixMasterAI/musicgen_raw_diagnostic.wav` **only after successful decoding**.
Its location can be changed with `MIXMASTER_MUSICGEN_RAW_PATH`. If the file is
missing, first verify the backend was restarted with these settings, then check
whether the generation job finished. Compare raw and exported WAVs using:

```bash
python diagnose_musicgen_audio.py \
  "$HOME/MixMasterAI/musicgen_raw_diagnostic.wav" \
  "/path/to/downloaded-song.wav"
```

The comparison reports sample rate, duration, RMS, peak and clipping metrics;
it does not determine whether a recording sounds musical. If raw and exported
audio are both distorted, investigate inference, model files and the decoder
rather than adding mastering effects. `MIXMASTER_MUSICGEN_DEVICE` accepts
`auto`, `cpu`, or `mps` (only where available). Do not assume MPS is faster
or higher-quality on every Mac.

For detailed references, see [MUSIC_LYRICS_UPSTREAM.md](MUSIC_LYRICS_UPSTREAM.md).
