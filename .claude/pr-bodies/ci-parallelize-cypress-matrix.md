## What

Closes #295. Splits the Cypress E2E job into **4 parallel shards** on the same workflow run via a GitHub Actions matrix strategy + manual spec-list sharding. Wall-clock target: 5-7 min → ~2-3 min on the slowest CI gate.

## Why

Cypress is consistently the slowest gate on every PR — full sequential runs take 5-7 min while every other check (lint, vitest, phpstan, pest, cs-fixer, openapi, prettier) finishes in 30-60s. On a busy session it's the dominant blocker between `git push` and merge. Parallelization is the cheapest cycle-time win we can take.

The originating issue (#295) proposed `cypress-io/github-action@v6` with `parallel: true` + `record: true` to Cypress Cloud. That path needs a free Cypress Cloud account + a `CYPRESS_RECORD_KEY` repo secret — both admin-only setup. This PR ships the same wall-clock improvement using GitHub Actions matrix sharding alone, no Cloud / no secret / no admin coordination.

## How

### Matrix sharding

```yaml
cypress-e2e-shard:
  strategy:
    fail-fast: false
    matrix:
      shard: [1, 2, 3, 4]
```

Each matrix instance runs a deterministic subset of `cypress/e2e/*.cy.ts` computed via sort-then-modulo:

```bash
mapfile -t SPECS < <(ls cypress/e2e/*.cy.ts | sort)
for i in "${!SPECS[@]}"; do
  if [ $(((i + 1) % TOTAL_SHARDS)) -eq $((shard % TOTAL_SHARDS)) ]; then
    SHARD_SPECS+=("${SPECS[$i]}")
  fi
done
```

Stable across renames / additions: a new spec lands in the `(count % N)`-th bucket; other specs shift by at most one slot. No churn in shard composition every PR.

### Required-status-check name preservation

The develop + main rulesets require `🎭 Cypress E2E` as a status check context. Renaming the job to `Cypress E2E shard 1..4` would break that requirement. Solution: an aggregator job (`cypress-e2e`) keeps the original name and depends on the matrix:

```yaml
cypress-e2e:
  name: "🎭 Cypress E2E"
  needs: [cypress-e2e-shard]
  if: always()
  steps:
    - run: |
        if [ "${{ needs.cypress-e2e-shard.result }}" != "success" ]; then
          exit 1
        fi
```

`needs.<job>.result` aggregates the matrix outcome — `success` only when every shard succeeded. Develop / main rulesets keep working without ruleset edits.

### `fail-fast: false`

Default is `true` (cancel sibling matrix jobs on first failure). Disabled here so a broken spec in shard 1 doesn't hide regressions in shards 2-4. Full visibility per shard, predictable rerun behavior.

## Trade-offs

- **Per-shard startup tax.** Each shard pays the `npm install` + `ng serve` startup cost (~1.5-2 min). Wall-clock gains: 4 shards × ~2.5 min (startup + 1.5 min specs) ≈ ~3-3.5 min vs. ~5-7 min sequential. ~40-50% wall-clock cut, not 4× — the startup is the dominant fixed cost. The shared `actions/setup-node@v4` cache key keeps the install warm across runs.
- **Runner minutes 4×.** GitHub Actions free tier: unlimited on public repos, 2000 min/month on private. Even at 4× per PR, the budget is comfortably within reach for the current PR cadence (~50-80 PRs/month). Worth the cycle-time win.
- **Spec affinity (running only specs touching changed paths) NOT done.** Issue called this out as future work. Fragile to get right (cross-spec dependencies, shared `cy.visitAuthenticated` state) and the matrix split delivers most of the benefit. Revisit if cypress wall-clock is still painful after the matrix lands.

## Out of scope

- Cypress Cloud integration. Same wall-clock with no admin overhead via the matrix path.
- Spec affinity / path-mapping (deferred per issue's own out-of-scope).
- Migrating off Cypress (Playwright / etc.).

## References

- Closes #295.
- Originating brainstorm: optimization brainstorm 2026-04-30.
- Required status check context: see `.github/rulesets/` for develop + main ruleset definitions.

## Test plan

- [x] YAML parses (workflow file added; will validate on first PR run after merge).
- [ ] **Manual smoke after merge:** observe a fresh PR run on develop, confirm 4 shard jobs spawn + each runs ~4-5 specs + the aggregator passes when all green.
- [ ] **Failure path:** deliberately break a spec, verify (a) the failing spec is identified per shard, (b) the aggregator fails the required status check, (c) other shards still complete (fail-fast: false).
- [ ] **Wall-clock measurement:** stopwatch baseline vs first 3 sharded runs to confirm the ~50% wall-clock cut.
