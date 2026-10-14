#!/usr/bin/env bash
# Updates the Fantasy Map Generator on the Raspberry Pi: pulls the newest code, rebuilds, restarts both services.
# Usage:  bash ~/fantasy-map-generator/tools/raspberry-pi/update.sh
set -euo pipefail

DIR="${FMG_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
say() { printf '\n== %s\n' "$*"; }

cd "$DIR"
say "Fetching the newest code"
before="$(git rev-parse --short HEAD)"
git pull --ff-only
after="$(git rev-parse --short HEAD)"
if [ "$before" = "$after" ] && [ -z "${FMG_FORCE:-}" ] && [ -d dist ]; then
  echo "Already up to date ($after). Use FMG_FORCE=1 to rebuild anyway."
  exit 0
fi

say "Packages"
npm ci --ignore-scripts
(cd tools/fmg-cli && npm ci --omit=dev --ignore-scripts)

say "Building"
NODE_OPTIONS="--max-old-space-size=2048" npm run build

say "Restarting"
for s in fmg fmg-api; do
  if systemctl cat "$s" >/dev/null 2>&1; then sudo systemctl restart "$s"; fi
done
sleep 3
systemctl is-active fmg fmg-api || true
say "Updated $before -> $after"
