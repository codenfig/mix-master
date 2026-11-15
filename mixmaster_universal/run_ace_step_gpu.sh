#!/bin/sh
# Executable wrapper for the local MixMaster background-job contract.
set -eu
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec "${MIXMASTER_PYTHON:-python3}" "$SCRIPT_DIR/ace_step_adapter.py" "$1" "$2"
