#!/usr/bin/env bash

curl https://files.stork-search.net/releases/latest/stork-amazon-linux -o stork-executable
# curl https://files.stork-search.net/releases/latest/stork-macos-latest -o stork-executable
chmod +x stork-executable
./stork-executable build --input static/stork.toml --output static/search-index.st
