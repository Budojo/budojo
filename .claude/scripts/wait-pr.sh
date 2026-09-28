#!/usr/bin/env bash
# Wait for a PR's checks to finish, then print its merge state and any failures.
#
#   ./.claude/scripts/wait-pr.sh <PR#> [<head-sha-prefix>]
#
# Returns at once on DIRTY (a conflict no CI run will fix: merge develop into
# the branch). BEHIND is not a reason to wait or to update: the rulesets'
# required checks are not strict, so a branch behind develop merges as it is
# (#2020). Pass the head you just pushed to avoid reading the previous run's
# checks while GitHub has not picked up the push yet.
set -euo pipefail

pr="${1:?usage: wait-pr.sh <PR#> [<head-sha-prefix>]}"
head="${2:-}"

while true; do
  read -r state oid < <(gh pr view "$pr" --json mergeStateStatus,headRefOid \
    -q '"\(.mergeStateStatus) \(.headRefOid)"')
  if [ "$state" = "DIRTY" ]; then
    echo "DIRTY ${oid:0:8}: merge develop into the branch"
    exit 0
  fi
  if [ -z "$head" ] || [[ "$oid" == "$head"* ]]; then
    checks="$(gh pr checks "$pr" 2>&1 || true)"
    total="$(printf '%s\n' "$checks" | grep -c . || true)"
    pending="$(printf '%s\n' "$checks" | awk -F'\t' '$2=="pending"' | wc -l)"
    if [ "$total" -ge 10 ] && [ "$pending" -eq 0 ]; then break; fi
  fi
  sleep 20
done

summary="$(printf '%s\n' "$checks" | awk -F'\t' '{print $2}' | sort | uniq -c | tr '\n' ' ')"
echo "$(gh pr view "$pr" --json mergeStateStatus -q .mergeStateStatus) ${oid:0:8} ${summary}"
printf '%s\n' "$checks" | awk -F'\t' '$2=="fail"{print "FAIL: "$1}'
