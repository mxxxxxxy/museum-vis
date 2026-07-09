#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-8787}"
VITE_PORT="${VITE_PORT:-5173}"
ANALYSIS_SYNC_SCRIPT="${PROJECT_ROOT}/../analysis/ops/sync-data-from-server.sh"
LOCAL_DATA_DIR="${LOCAL_DATA_DIR:-${PROJECT_ROOT}/../analysis/data}"

if [[ "${1:-}" == "--sync" ]]; then
  "${ANALYSIS_SYNC_SCRIPT}"
fi

cleanup() {
  if [[ -n "${BACKEND_PID:-}" ]]; then
    kill "${BACKEND_PID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

cd "${PROJECT_ROOT}"

MUSEUM_VIZ_REVIEW=1 MUSEUM_VIZ_DATA_DIR="${LOCAL_DATA_DIR}" PORT="${PORT}" \
  python3 backend/python_server.py &
BACKEND_PID="$!"

echo "Review backend: http://127.0.0.1:${PORT}"
echo "Review page:    http://127.0.0.1:${VITE_PORT}/?review=1"

VITE_API_PROXY_TARGET="http://127.0.0.1:${PORT}" \
  npm run dev -- --host 127.0.0.1 --port "${VITE_PORT}"
