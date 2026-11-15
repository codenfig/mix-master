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
The backend applies a five-minute subprocess timeout and stores the output in
Generated Files. Failed outputs are not saved.

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
The adapter generates approximately 20 seconds of instrumental music per
request, regardless of the target song length. GPU/MPS availability, model
dependencies, memory and CPU performance affect generation speed. A five-minute
backend deadline applies; heavy CPU inference may exceed it.

The wrapper assumes the repository virtualenv exists at
`mixmaster_universal/.venv`. If your environment is elsewhere, edit the
launcher or point `FULL_SONG_ENGINE_EXECUTABLE` at a custom executable.
No model weights are committed to GitHub. Verify the model's license and
test compatibility with your local PyTorch/Transformers versions.
