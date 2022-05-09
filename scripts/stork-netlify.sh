#!/usr/bin/env bash

wget https://files.stork-search.net/releases/latest/stork-ubuntu-latest
chmod +x stork-ubuntu-latest
./stork-ubuntu-latest --build static/stork.toml
