#!/usr/bin/env bash
# Stop only the DearMe API (matches its venv path and port).
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${PORT:-8160}"
for p in $(ps -eo pid,args | awk -v port="--port $PORT" -v venv="$APP_DIR/backend/.venv" 'index($0, "uvicorn app.main:app") && index($0, port) && !/awk/ {print $1}'); do kill "$p"; done
