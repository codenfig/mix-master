# Music generation and lyrics: upstream reference notes

MixMaster uses its own code and integrates established open-source model interfaces.
Do not copy model weights or source code into this repository without checking their licenses.

## References

- Meta AudioCraft: https://github.com/facebookresearch/audiocraft
- Hugging Face Transformers MusicGen: https://github.com/huggingface/transformers/blob/main/docs/source/en/model_doc/musicgen.md
- ACE-Step 1.5: https://github.com/ace-step/ACE-Step-1.5
- Ollama local API: https://github.com/ollama/ollama

MusicGen Small produces short **instrumental** previews, not full songs with vocals.
ACE-Step 1.5 supports full songs, sung lyrics, and structured sections, but requires
a separately installed compatible runtime. On Intel macOS, do not assume the
upstream Python/CUDA package will install or run; use a proven compatible build
or a user-operated remote GPU, not a paid music API.

## Diagnose distorted MusicGen output

Use the existing Python 3.11 virtual environment and run the backend with:

```sh
export MIXMASTER_PYTHON="$HOME/MixMasterAI/mixmaster-venv/bin/python"
export FULL_SONG_ENGINE_EXECUTABLE="$PWD/run_musicgen.sh"
export FULL_SONG_JOB_TIMEOUT_SECONDS=1800
export MIXMASTER_MUSICGEN_MAX_TOKENS=256
export MIXMASTER_MUSICGEN_DEVICE=cpu
export MIXMASTER_MUSICGEN_SAVE_RAW=1
python -m uvicorn server:app --host 127.0.0.1 --port 8000
```

Generate a short instrumental. The unprocessed decoder audio is saved to
`~/MixMasterAI/musicgen_raw_diagnostic.wav`; compare this with the processed
file downloaded from the app. If both are noisy, investigate model weights,
decoder and inference rather than applying more WAV effects. The diagnostic
file contains generated audio and should be removed when no longer needed.

For a separate MPS comparison, restart with
`MIXMASTER_MUSICGEN_DEVICE=mps` only if MPS is available.
Use the same text prompt, but remember generation is stochastic so outputs
will not be sample-identical.

## Lyrics

The lyrics generator uses the local Ollama API at 127.0.0.1:11434.
It prompts for verse/chorus/bridge tags and rhythmic, original lyrics.
This generates text only; it does not make MusicGen sing the lyrics.

## Validation

The GitHub changes have not been validated against the user's Intel Mac.
Run the adapter tests and listen to generated WAVs before making quality claims.
