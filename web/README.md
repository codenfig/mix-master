# MixMaster Audio Workspace

React, TypeScript and Vite frontend for **existing-audio processing**, independent of music generation.

Available routes:

- `/#/overview` — audio workspace overview
- `/#/music-mix` — energy-based Music Mix
- `/#/audio-mastering` — loudness, EQ and mastering export
- `/#/stem-splitter` — stem separation
- `/#/vocal-remover` — instrumental extraction
- `/#/voice-studio` — voice processing
- `/#/generated-files` — saved non-generation processing outputs

Full-song generation, AI lyrics, Text to Song, music model adapters and generated-song libraries now belong to [Melodiva AI](https://github.com/codenfig/Melodiva-AI).

## Start

```bash
# In one terminal:
cd mixmaster_universal
python -m pip install -r requirements.txt
python -m uvicorn server:app --host 127.0.0.1 --port 8000

# In another terminal:
cd web
npm ci
npm run dev
```

Open http://localhost:5173/#/overview .

Run `npm run build` to typecheck and produce a production Vite bundle. Do not commit `web/dist` build outputs.
