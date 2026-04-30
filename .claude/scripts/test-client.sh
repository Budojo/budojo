#!/usr/bin/env bash
#
# test-client.sh — run the client (Angular) pre-push gates inside the
# `budojo_client` Docker container.
#
# Usage:
#   ./test-client.sh             # full pass: prettier --write + lint + vitest
#   ./test-client.sh prettier    # just prettier
#   ./test-client.sh lint        # just ESLint
#   ./test-client.sh vitest      # just vitest
#   ./test-client.sh quick       # lint + vitest (skip prettier rewrite)
#
# Why: every pre-push gate I run for a frontend change boils down to
#   docker exec budojo_client sh -c "cd /app && <cmd>"
# Wrapping it here means I (and any future agent) stops typing that
# prefix manually + gets a single argument convention.

set -euo pipefail

CONTAINER="budojo_client"
WORKDIR="/app"

# `set -o pipefail` inside the container shell — without it the pipeline
# exit status comes from `tail` (always 0) and a failing prettier / lint
# / vitest would silently report success. Enabling pipefail makes the
# overall pipeline exit code reflect the FIRST failing command. Copilot
# caught this on #293.
run_in_client() {
  docker exec "$CONTAINER" sh -c "set -o pipefail; cd $WORKDIR && $1"
}

prettier_fix() {
  echo "── prettier --write ──"
  run_in_client "npx prettier --write 'src/**/*.{ts,html,scss}' cypress 2>&1 | grep -v unchanged | tail -10"
}

lint() {
  echo "── npm run lint ──"
  run_in_client "npm run lint 2>&1 | tail -10"
}

vitest() {
  echo "── npm test (watch=false) ──"
  run_in_client "npm test -- --watch=false 2>&1 | tail -10"
}

case "${1:-all}" in
  all)      prettier_fix && lint && vitest ;;
  quick)    lint && vitest ;;
  prettier) prettier_fix ;;
  lint)     lint ;;
  vitest)   vitest ;;
  *)
    echo "usage: $0 [all|quick|prettier|lint|vitest]" >&2
    exit 2
    ;;
esac
