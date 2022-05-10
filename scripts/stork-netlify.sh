#!/usr/bin/env bash

# curl https://files.stork-search.net/releases/latest/stork-amazon-linux -o stork-executable
# curl https://files.stork-search.net/releases/v1.4.3/stork-macos-latest -o stork-executable

curl https://files.stork-search.net/releases/v1.4.2/stork-amazon-linux -o stork-executable
# curl https://files.stork-search.net/releases/v1.4.2/stork-macos-10-15 -o stork-executable

chmod +x stork-executable
./stork-executable build --input stork.toml --output search-index.st
