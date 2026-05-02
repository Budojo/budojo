## What

Follow-up to #326. The post-org-transfer cleanup committed IDs for a project I'd ad-hoc rebuilt with only the 9 active items. We then agreed to do the migration properly: `copyProjectV2` from the m-bonanno source + a one-shot bulk import script that walked the 250 source items and re-added each to the destination preserving its Status.

End state: a single org-level project at [`orgs/Budojo/projects/2`](https://github.com/orgs/Budojo/projects/2) with the full history (241 Done + 3 In Progress + 6 Todo). Source project on `m-bonanno` archived (not deleted) so its URL keeps redirecting; the orphan stub project from the wrong path was deleted.

## Changes

- `.claude/scripts/board-set.sh` — `PROJECT_ID` / `STATUS_FIELD_ID` swapped to the migrated project's IDs (`PVT_kwDOEL6JKc4BWTmT` / `PVTSSF_lADOEL6JKc4BWTmTzhRpAQw`). Status option IDs (`f75ad846` / `47fc9ee4` / `98236657`) are GitHub-default and stayed identical across the copy, so the rest of the script needs no changes.
- `CLAUDE.md` — Project Board section URL + post-org-transfer note updated to describe the `copyProjectV2` + bulk-import path so the next reader doesn't re-discover the API.

## Why this wasn't bundled with #326

Three steps on the user's call: I initially rebuilt the project from scratch (only 9 active items), thinking `copyProjectV2` couldn't cross owners. The user pushed back, I checked the GraphQL schema and found I was wrong (the mutation explicitly takes an `ownerId` parameter), and we redid it the right way — but #326 had already shipped with the wrong IDs.

Sequence: delete-the-rebuilt-stub → reopen-source → `copyProjectV2` → bulk-import items → close source → this PR.

## Test plan

- [x] Verified the bulk import preserved status counts (241/3/6 source → 241/3/6 destination)
- [x] Verified the new IDs work end-to-end via a smoke call (`gh api graphql ... addProjectV2ItemById` against issue #283 returned a fresh item id)
- [ ] Cypress green in CI
- [ ] Smoke after merge: `./.claude/scripts/board-set.sh <PR-N> <status>` against the next opened PR routes to the migrated project

## References

- Predecessor: #326 (committed the wrong IDs)
- Source project (now archived): https://github.com/users/m-bonanno/projects/2
- Migrated project: https://github.com/orgs/Budojo/projects/2
