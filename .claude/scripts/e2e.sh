#!/usr/bin/env bash
#
# Cypress against the running dev server, without the rebuild race.
#
#   ./e2e.sh                          # every spec
#   ./e2e.sh athletes-sort            # one spec, by basename
#   ./e2e.sh athletes-sort,attendance # several
#
# Why this exists: `test-client.sh` runs `prettier --write`, which rewrites
# source files, which makes `ng serve` rebuild. Cypress started in that window
# runs against the PREVIOUS bundle and fails on assertions that are correct —
# or worse, passes on code you just changed. It cost three false failures in
# one afternoon before anyone wrote it down, and every time the reflex is to
# suspect the change rather than the clock.
#
# So: wait for the server to answer, then wait for it to STOP changing, and
# only then run. Same container and flags the docs prescribe, in one place.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CLIENT="$ROOT/client"
BASE="${CYPRESS_BASE_URL:-http://localhost:4200}"
CYPRESS_IMAGE="cypress/included:15.21.1"

spec_arg=""
if [[ $# -gt 0 && -n "${1:-}" ]]; then
  IFS=',' read -r -a names <<< "$1"
  specs=()
  for n in "${names[@]}"; do
    n="${n%.cy.ts}"
    specs+=("cypress/e2e/${n}.cy.ts")
  done
  spec_arg="--spec $(IFS=,; echo "${specs[*]}")"
fi

echo "── waiting for $BASE ──"
for _ in $(seq 1 60); do
  if curl -sf "$BASE" -o /dev/null; then break; fi
  sleep 2
done
if ! curl -sf "$BASE" -o /dev/null; then
  echo "dev server never came up at $BASE — is \`make up\` running?" >&2
  exit 1
fi

# The settle check: the served index changes on every rebuild, so hash it
# until two reads in a row agree. A rebuild mid-flight moves the hash and the
# loop waits for the next quiet pair rather than starting Cypress into it.
echo "── waiting for the bundle to settle ──"
prev=""
stable=0
for _ in $(seq 1 60); do
  cur="$(curl -sf "$BASE" | sha256sum | cut -d' ' -f1 || true)"
  if [[ -n "$cur" && "$cur" == "$prev" ]]; then
    stable=$((stable + 1))
    [[ $stable -ge 2 ]] && break
  else
    stable=0
  fi
  prev="$cur"
  sleep 2
done

# Format the specs before running them. Editing a spec and running `make e2e`
# skips the client gate, so a formatting slip reaches CI instead of the
# terminal — that has cost two round-trips. Cheap here, expensive there.
echo "── prettier (cypress) ──"
docker compose exec -T --user "$(id -u)" client sh -lc 'npx prettier --write cypress' \
  2>/dev/null | grep -v unchanged || true

echo "── cypress ──"
# shellcheck disable=SC2086
exec docker run --rm --network host \
  --user "$(id -u):$(id -g)" \
  -v "$CLIENT":/e2e -w /e2e \
  -e "CYPRESS_PAGE=${CYPRESS_PAGE:-}" \
  "$CYPRESS_IMAGE" \
  $spec_arg --config video=false,trashAssetsBeforeRuns=false --browser electron
