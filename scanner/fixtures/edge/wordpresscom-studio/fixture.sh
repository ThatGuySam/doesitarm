#!/bin/sh
set -eu
base=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
exec python3 "$base/generate.py" transport-zip '-' "${1:?fixture output path}"
