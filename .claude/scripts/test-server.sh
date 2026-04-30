#!/usr/bin/env bash
#
# test-server.sh — run the server (Laravel) pre-push gates inside the
# `budojo_api` Docker container.
#
# Usage:
#   ./test-server.sh           # full pass: cs-fixer + phpstan + pest
#   ./test-server.sh cs        # just php-cs-fixer
#   ./test-server.sh phpstan   # just phpstan
#   ./test-server.sh pest      # just pest
#   ./test-server.sh quick     # phpstan + pest (skip cs-fixer rewrite)
#
# Same shape as test-client.sh — wraps the docker exec prefix everyone
# was typing manually.

set -euo pipefail

CONTAINER="budojo_api"
WORKDIR="/var/www/api"

# `set -o pipefail` inside the container shell — without it the pipeline
# exit status comes from `tail` (always 0) and a failing cs-fixer /
# phpstan / pest would silently report success. Copilot caught this on
# #293.
run_in_server() {
  docker exec "$CONTAINER" sh -c "set -o pipefail; cd $WORKDIR && $1"
}

cs_fix() {
  echo "── php-cs-fixer fix ──"
  run_in_server "vendor/bin/php-cs-fixer fix 2>&1 | tail -20"
}

phpstan() {
  echo "── phpstan analyse ──"
  run_in_server "vendor/bin/phpstan analyse --no-progress --memory-limit=1G 2>&1 | tail -20"
}

pest() {
  echo "── pest --parallel ──"
  run_in_server "vendor/bin/pest --parallel 2>&1 | tail -20"
}

case "${1:-all}" in
  all)     cs_fix && phpstan && pest ;;
  quick)   phpstan && pest ;;
  cs)      cs_fix ;;
  phpstan) phpstan ;;
  pest)    pest ;;
  *)
    echo "usage: $0 [all|quick|cs|phpstan|pest]" >&2
    exit 2
    ;;
esac
