#!/usr/bin/env python3
"""Executable adapter: MixMaster job JSON -> ACE-Step API -> PCM WAV.

Set ACESTEP_BASE_URL to an authenticated HTTPS ACE-Step service (or localhost).
The service must expose /health, /release_task, /query_result, /v1/audio.
"""
from ace_step_adapter import main

if __name__ == "__main__":
    main()
