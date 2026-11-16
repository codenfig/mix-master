"""Offline Intel Mac preflight for MusicGen and optional local ACE-Step.

Usage: python check_local_music_engines.py
Never downloads weights, installs packages, or sends a song to a model.
"""
import importlib.util
import json
import os
import platform
import sys
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import urlopen


def probe_ace_step(base_url, enabled):
    if not enabled:
        return {"state": "disabled", "detail": "Set MIXMASTER_ENABLE_ACESTEP=1 to opt in."}
    parsed = urlsplit(base_url)
    if parsed.scheme != "http" or parsed.hostname not in {"127.0.0.1", "localhost", "::1"} or parsed.path or parsed.username or parsed.password:
        return {"state": "unsupported", "detail": "Auto-probe requires a loopback HTTP origin."}
    try:
        with urlopen(base_url.rstrip("/") + "/health", timeout=2) as response:
            return {"state": "reachable" if 200 <= response.status < 300 else "unhealthy",
                    "detail": "HTTP " + str(response.status)}
    except (OSError, TimeoutError, ValueError) as exc:
        return {"state": "unavailable", "detail": str(exc)[:160]}


def collect():
    model_dir = Path(os.environ.get("MIXMASTER_MUSICGEN_MODEL_DIR", "~/MixMasterAI/Models/musicgen-small")).expanduser()
    modules = {name: importlib.util.find_spec(name) is not None
               for name in ("torch", "transformers", "numpy", "soundfile", "fastapi")}
    result = {
        "platform": platform.system(),
        "architecture": platform.machine(),
        "python": sys.version.split()[0],
        "dependencies": modules,
        "musicgen_model_config": (model_dir / "config.json").is_file(),
        "musicgen_weights_present": any(model_dir.glob("*.safetensors")) or any(model_dir.glob("*.bin"))
                                    or any(model_dir.glob("**/*.safetensors")),
        "ace_step": probe_ace_step(os.environ.get("ACESTEP_BASE_URL", "http://127.0.0.1:8001"),
                                   os.environ.get("MIXMASTER_ENABLE_ACESTEP") == "1"),
        "note": "Preflight only; this does not prove model inference or audio quality.",
    }
    if modules["torch"]:
        try:
            import torch
            result["torch_version"] = torch.__version__
            result["mps_available"] = bool(torch.backends.mps.is_available())
        except (ImportError, OSError, RuntimeError) as exc:
            result["torch_error"] = str(exc)[:200]
    return result


if __name__ == "__main__":
    print(json.dumps(collect(), indent=2))
