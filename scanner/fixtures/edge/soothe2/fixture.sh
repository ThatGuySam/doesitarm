#!/bin/sh
set -eu
base=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
exec python3 "$base/generate.py" audio-pkg 'soothe2' "${1:?fixture output path}"
