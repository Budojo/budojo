#!/usr/bin/env bash
#
# Screenshot a route at both canon widths:
#
#   ./shot.sh /dashboard/athletes
#
# Output lands in client/cypress/screenshots/_shot.cy.ts/. See _shot.cy.ts
# for why this is a committed harness rather than a throwaway spec.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PAGE="${1:-/dashboard/athletes}"

CYPRESS_PAGE="$PAGE" CYPRESS_RUNTIME="${RUNTIME:-}" CYPRESS_THEME="${THEME:-}" "$ROOT/.claude/scripts/e2e.sh" _shot

echo
echo "── shots ──"
find "$ROOT/client/cypress/screenshots/_shot.cy.ts" -name '*.png' -newermt '-5 minutes' 2>/dev/null | sed "s|$ROOT/||"
