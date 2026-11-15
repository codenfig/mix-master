"""Local preflight diagnostics for Full Song Studio (no network calls)."""
import importlib.util
import json
import os
import sys
from pathlib import Path


def main():
    checks = {}
    for module in ("fastapi", "pydantic", "numpy", "soundfile", "torch", "transformers", "huggingface_hub", "pytest"):
        checks[module] = importlib.util.find_spec(module) is not None
    model = Path(os.environ.get("MIXMASTER_MUSICGEN_MODEL_DIR", "~/MixMasterAI/Models/musicgen-small")).expanduser()
    checks["musicgen_model_config"] = (model / "config.json").is_file()
    checks["musicgen_model_weights"] = any(model.glob("*.safetensors")) or any(model.glob("*.bin")) or any(model.glob("**/*.safetensors"))
    for label, env in (("instrumental_engine", "FULL_SONG_ENGINE_EXECUTABLE"), ("vocal_engine", "FULL_SONG_VOCAL_EXECUTABLE")):
        raw = os.environ.get(env, "")
        path = Path(raw).expanduser() if raw else None
        checks[label] = bool(path and path.is_file() and os.access(path, os.X_OK))
    print(json.dumps({"python": sys.version.split()[0], "checks": checks,
                      "note": "Presence checks only; models and audio generation are not executed."}, indent=2))
    missing_core = [name for name in ("fastapi", "pydantic", "numpy", "soundfile") if not checks[name]]
    if missing_core:
        print("Missing backend dependencies: " + ", ".join(missing_core), file=sys.stderr)
        return 1
    if not checks["instrumental_engine"] and not checks["vocal_engine"]:
        print("No song engine configured. Full-song generation will be unavailable.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
