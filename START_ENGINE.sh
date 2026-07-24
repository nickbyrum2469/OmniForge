#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
mkdir -p logs
node server/server.mjs >logs/engine.log 2>&1 &
printf 'OmniForge started at http://127.0.0.1:4177\n'
