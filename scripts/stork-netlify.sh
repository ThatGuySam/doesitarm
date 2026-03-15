#!/usr/bin/env bash

# Hugo Bash Example https://github.com/jmooring/hugo-stork/blob/main/build.sh

# Netlify's Noble/Ubuntu 24 image needs the Ubuntu 22.04 Stork build.
# curl -fsSL https://files.stork-search.net/releases/v1.6.0/stork-macos-13-arm -o stork-executable

curl -fsSL https://files.stork-search.net/releases/v1.6.0/stork-ubuntu-22-04 -o stork-executable
# curl -fsSL https://files.stork-search.net/releases/v1.6.0/stork-macos-10-15 -o stork-executable

chmod +x stork-executable
./stork-executable build --input static/stork.toml --output static/search-index.st
