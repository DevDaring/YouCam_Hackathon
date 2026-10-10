#!/usr/bin/env bash
# DearMe - (re)start the API on 127.0.0.1:8160. Caddy serves web/ and proxies /api.
set -e
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${PORT:-8160}"
cd "$APP_DIR"
"$APP_DIR/stop.sh" >/dev/null 2>&1 || true
mkdir -p logs
# Settings come from $APP_DIR/.env (config.py reads <root>/.env). --proxy-headers so the
# login rate limiter sees real client IPs behind Caddy.
setsid bash -c "cd '$APP_DIR/backend' && export PYTHONPATH='$APP_DIR/backend' OMP_NUM_THREADS=2 && exec .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port $PORT --workers 1 --proxy-headers --forwarded-allow-ips=127.0.0.1 --timeout-graceful-shutdown 20" \
  >> logs/api.log 2>&1 < /dev/null &
echo $! > logs/api.pid
for i in $(seq 1 60); do curl -sf "http://127.0.0.1:$PORT/api/health" >/dev/null && { echo "dearme up on 127.0.0.1:$PORT"; exit 0; }; sleep 1; done
echo "dearme did not become healthy; see logs/api.log" >&2; exit 1
