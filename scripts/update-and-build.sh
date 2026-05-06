#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_FILE="${FRAME_UPDATE_LOG:-/tmp/family-frame-update.log}"
BRANCH="${FRAME_UPDATE_BRANCH:-main}"

exec > >(tee -a "$LOG_FILE") 2>&1

cd "$ROOT_DIR"
echo "[$(date --iso-8601=seconds)] Starting family-frame update on ${BRANCH}."

if ! git diff --quiet || ! git diff --cached --quiet || [[ -n "$(git ls-files --others --exclude-standard)" ]]; then
  if [[ "${FRAME_UPDATE_ALLOW_DIRTY:-0}" != "1" ]]; then
    echo "Working tree is dirty; refusing to pull."
    git status --short
    exit 1
  fi
fi

CURRENT_BRANCH="$(git branch --show-current)"
if [[ "$CURRENT_BRANCH" != "$BRANCH" ]]; then
  echo "Expected branch ${BRANCH}, found ${CURRENT_BRANCH}."
  exit 1
fi

BEFORE="$(git rev-parse HEAD)"
git fetch origin "$BRANCH"
git pull --ff-only origin "$BRANCH"
AFTER="$(git rev-parse HEAD)"

if [[ ! -d node_modules ]] || git diff --name-only "$BEFORE" "$AFTER" -- package.json package-lock.json | grep -q .; then
  npm ci
fi

if [[ ! -f dist/index.html ]] || [[ "$BEFORE" != "$AFTER" ]]; then
  npm run build
fi

echo "[$(date --iso-8601=seconds)] Update complete at $(git rev-parse --short HEAD)."
