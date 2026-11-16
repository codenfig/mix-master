#!/bin/sh
# Run from mixmaster_universal/. Requires python environment with MusicGen deps.
set -eu
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec "${MIXMASTER_PYTHON:-python3}" "$SCRIPT_DIR/musicgen_adapter.py" "$1" "$2"
