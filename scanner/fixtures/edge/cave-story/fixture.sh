#!/bin/sh
set -eu
base=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
exec python3 "$base/generate.py" raw-gpt 'Doukutsu' "${1:?fixture output path}"
