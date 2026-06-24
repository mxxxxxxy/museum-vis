#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DEPLOY_HOST:-}" ]]; then
  echo "Missing DEPLOY_HOST. Example:" >&2
  echo "  DEPLOY_HOST=1.2.3.4 DEPLOY_USER=root ./scripts/deploy-python-rsync.sh" >&2
  exit 1
fi

DEPLOY_USER="${DEPLOY_USER:-root}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/museum-viz-collector}"
STATIC_WEB_ROOT="${STATIC_WEB_ROOT:-/usr/share/nginx/html/collection}"
RESTART_COMMAND="${RESTART_COMMAND:-}"
REMOTE="${DEPLOY_USER}@${DEPLOY_HOST}"

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "${PROJECT_ROOT}"
npm run build

ssh "${REMOTE}" "mkdir -p '${DEPLOY_PATH}/server' '${STATIC_WEB_ROOT}'"

rsync -az server/python_server.py "${REMOTE}:${DEPLOY_PATH}/server/python_server.py"
rsync -az --delete dist/ "${REMOTE}:${STATIC_WEB_ROOT}/"

if [[ -n "${RESTART_COMMAND}" ]]; then
  ssh "${REMOTE}" "${RESTART_COMMAND}"
fi

echo "Deployment complete."
echo "Backend file: ${REMOTE}:${DEPLOY_PATH}/server/python_server.py"
echo "Frontend files: ${REMOTE}:${STATIC_WEB_ROOT}/"
