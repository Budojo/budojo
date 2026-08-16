#!/usr/bin/env bash
#
# test-desktop.sh — run the desktop (Electron shell) pre-push gates.
#
# Usage:
#   ./test-desktop.sh            # full pass: tsc --noEmit + vitest
#   ./test-desktop.sh lint       # just tsc --noEmit
#   ./test-desktop.sh vitest     # just vitest
#   ./test-desktop.sh build      # compile main + preload into dist/
#
# Why this one runs on the HOST, unlike its server/client siblings:
# `desktop/node_modules` is installed natively on Windows (electron and
# electron-builder ship platform binaries), and the shipped app has no
# Docker in it at all — Docker is the dev environment for the API and the
# SPA only. Running these gates in a container would test a toolchain we
# never ship.
#
# Note: `npm run build:renderer` is deliberately NOT part of the gate. It
# shells out to `ng build` in ../client, whose node_modules are installed
# inside the Linux container — the Windows host cannot exec those binaries.
# Build the renderer in the container and copy it in with
# `node scripts/build-renderer.mjs --copy-only` (see .claude/gotchas.md
# § Desktop runtime).

set -euo pipefail

DESKTOP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/desktop"

if [ ! -d "$DESKTOP_DIR/node_modules" ]; then
  echo "desktop/node_modules missing — run 'cd desktop && npm ci' first." >&2
  exit 2
fi

run_in_desktop() {
  # `set -o pipefail` so a failing tsc/vitest is not masked by the exit
  # status of `tail` — the same trap that bit test-client.sh on #293.
  ( set -o pipefail; cd "$DESKTOP_DIR" && eval "$1" )
}

lint() {
  echo "── tsc --noEmit ──"
  run_in_desktop "npm run lint 2>&1 | tail -10"
}

vitest() {
  echo "── vitest run ──"
  run_in_desktop "npm test 2>&1 | tail -10"
}

build() {
  echo "── tsc (build main + preload) ──"
  run_in_desktop "npm run build 2>&1 | tail -10"
}

case "${1:-all}" in
  all)    lint && vitest ;;
  lint)   lint ;;
  vitest) vitest ;;
  build)  build ;;
  *)
    echo "usage: $0 [all|lint|vitest|build]" >&2
    exit 2
    ;;
esac
