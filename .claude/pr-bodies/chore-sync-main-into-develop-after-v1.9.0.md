## What

Post-release sweep — brings the v1.9.0 release merge commit from `main` back into `develop` so semantic-release on the next `develop` push reads the right base for the next beta tag.

> **Merge style:** "Create a merge commit" — NOT squash. Squash erases the parent linkage and breaks downstream merge bookkeeping.

> **Copilot wait:** none. This is alignment-only — no new code, no review surface. Memory rule: release PR waits for Copilot; sweep does not.

## Why this is mandatory

Without the sweep, `develop`'s next beta tag would still treat v1.8.0 as the latest stable train, producing an incorrect `v1.9.0-beta.N` instead of starting the v1.10.0 beta train.

## What's in the diff

Only the merge commit from the v1.9.0 release PR. All the underlying feature commits (#286, #288, #289, #290, #292, #293, #297, #298, #299, #300) already live on `develop` — this PR re-introduces only the merge itself.

## References

- Release tag: [v1.9.0](https://github.com/m-bonanno/budojo/releases/tag/v1.9.0)
- Release PR: opened immediately after this body is drafted.
