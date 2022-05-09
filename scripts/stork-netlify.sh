#!/usr/bin/env bash

curl https://files.stork-search.net/releases/latest/stork-ubuntu-latest -o stork-ubuntu-latest
# curl https://files.stork-search.net/releases/latest/stork-macos-latest -o stork-ubuntu-latest
chmod +x stork-ubuntu-latest
./stork-ubuntu-latest build --input static/stork.toml --output static/search-index.st
