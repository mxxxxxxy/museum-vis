#!/usr/bin/env bash
set -euo pipefail

ANALYSIS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

DEPLOY_HOST="${DEPLOY_HOST:-49.233.250.13}"
DEPLOY_USER="${DEPLOY_USER:-root}"
REMOTE_DATA_DIR="${REMOTE_DATA_DIR:-/opt/museum-viz-collector/data}"
LOCAL_DATA_DIR="${LOCAL_DATA_DIR:-${ANALYSIS_ROOT}/data}"
REMOTE="${DEPLOY_USER}@${DEPLOY_HOST}"

mkdir -p "${LOCAL_DATA_DIR}"

echo "One-way sync from server to local analysis mirror:"
echo "  source:      ${REMOTE}:${REMOTE_DATA_DIR%/}/"
echo "  destination: ${LOCAL_DATA_DIR%/}/"
echo "This command never writes to the server. --delete-delay only removes stale local files."

rsync -az --delete-delay --progress --stats \
  "${REMOTE}:${REMOTE_DATA_DIR%/}/" \
  "${LOCAL_DATA_DIR%/}/"

echo "Local analysis data mirror is up to date: ${LOCAL_DATA_DIR}"

LOCAL_DATA_DIR="${LOCAL_DATA_DIR}" python3 - <<'PY'
import json
import os
from pathlib import Path

data_dir = Path(os.environ["LOCAL_DATA_DIR"])
missing = []
total = 0

for draft_path in (data_dir / "submissions").glob("*/draft.json"):
    try:
        draft = json.loads(draft_path.read_text(encoding="utf-8"))
    except Exception:
        continue
    assets = list(draft.get("floorplanAssets") or [])
    for unit in draft.get("units") or []:
        assets.extend(unit.get("environmentAssets") or [])
        for item in unit.get("items") or []:
            assets.extend(item.get("photos") or [])
    for asset in assets:
        url = asset.get("url") or ""
        if not url.startswith("/exhibition_uploads/"):
            continue
        total += 1
        local_file = data_dir / "uploads" / url[len("/exhibition_uploads/"):]
        if not local_file.is_file():
            missing.append((str(draft_path.relative_to(data_dir)), url))

if missing:
    print(f"Warning: {len(missing)} of {total} referenced upload files are missing.")
    for draft_path, url in missing[:20]:
        print(f"  {draft_path}: {url}")
else:
    print(f"Integrity check passed: {total} referenced upload files found.")
PY
