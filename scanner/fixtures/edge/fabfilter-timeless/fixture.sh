#!/bin/sh
set -eu
base=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
exec python3 "$base/generate.py" audio-dmg 'FabFilter Timeless 3' "${1:?fixture output path}"
