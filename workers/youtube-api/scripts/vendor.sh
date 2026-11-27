#!/usr/bin/env bash
# Rebuild python_modules/ from pinned, digest-checked wheels.
# The bundled yt-dlp is the built-in fallback when no R2 wheel is active.
set -euo pipefail
cd "$(dirname "$0")/.."

wheels=(
  "https://files.pythonhosted.org/packages/30/1e/f4bf64ca733135e609696c6df77a6c22c6d4909b6e293e4563ae51ea335c/yt_dlp-2026.11.23-py3-none-any.whl e9188e0c559905f7ee05acc1ba0b6fb3f310e7565bf6dea5f62b5300e0775e35"
  "https://files.pythonhosted.org/packages/67/1e/cdef3dc0bb249e9e7dee433f6ca8796241328f5134c8d0a97056f064590c/workers_runtime_sdk-1.9.7-py3-none-any.whl 2bda7f2d640aef09cb7c3d2f3c07ad87e649340b313b80b08a06a85b2202bd1e"
)

mkdir -p .vendor
rm -rf python_modules
mkdir python_modules
for entry in "${wheels[@]}"; do
  url="${entry% *}"
  digest="${entry#* }"
  file=".vendor/$(basename "$url")"
  [ -f "$file" ] || curl -fsSL "$url" -o "$file"
  echo "$digest  $file" | sha256sum -c -
  python3 -I -c 'import sys, zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])' "$file" python_modules
done
# Keep the upload small: drop data files (man pages, completions) and caches.
rm -rf python_modules/*.data
find python_modules -name '__pycache__' -type d -prune -exec rm -rf {} +
echo "vendored: $(ls python_modules | tr '\n' ' ')"
