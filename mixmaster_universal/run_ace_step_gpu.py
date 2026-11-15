#!/usr/bin/env python3
"""Executable bridge: MixMaster full-song job -> authenticated ACE-Step GPU API.

Configure ACESTEP_BASE_URL (HTTPS for remote servers) and ACESTEP_API_KEY.
Launch as FULL_SONG_VOCAL_EXECUTABLE; no secrets are written to project JSON.
"""
from pathlib import Path
import sys

if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from ace_step_adapter import main
    main()
