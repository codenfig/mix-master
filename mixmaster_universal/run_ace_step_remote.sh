#!/bin/sh
# MixMaster executable contract: project.json output.wav
set -eu
if [ "$#" -ne 2 ]; then
  echo "Usage: run_ace_step_remote.sh project.json output.wav" >&2
  exit 2
fi
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec "${MIXMASTER_PYTHON:-python3}" "$SCRIPT_DIR/ace_step_adapter.py" "$1" "$2"
