#!/bin/sh
set -eu
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec "$HERE/.venv/bin/python" "$HERE/ace_step_adapter.py" "$1" "$2"
