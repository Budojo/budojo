## What

Address Copilot review on the v2.4.0 release PR (#551). Same shape as #543 was for #542 — a small chore PR into `develop` that fixes the comment, then the release PR can land cleanly.

## Why

Copilot flagged a SSR safety issue in `VersionCheckService.start()` that would `ReferenceError` at boot if the service runs without a DOM `defaultView` (SSR pass, non-browser test bootstrap). The previous shape did `fromEvent(this.document.defaultView ?? window, 'focus')` — but if `defaultView` is null, the global `window` is also undefined in those environments, so the fallback would throw before the service could even early-return.

## How

- `version-check.service.ts` — derive `const win = this.document.defaultView` at the top of `start()`, return early if it's null. Pipe consumes `win` directly (no `?? window` fallback). The dev-sentinel guard above already had a similar shape via `consumeForceUpdateFlag()`; this brings the rest of `start()` in line.
- `version-check.service.spec.ts` — new spec `is a no-op when document.defaultView is null (SSR / non-browser bootstrap)` configures DOCUMENT with `defaultView: null` and asserts `start()` doesn't throw and no HTTP request fires. 722 specs total now (was 721).

## Out of scope

- Any other Copilot comments on the release PR (none — this was the only one).

## References

- #551 — v2.4.0 release PR (target of the fix)
- #549 — original SPA cache-bust feature where `VersionCheckService` shipped

## Test plan

- [x] `npm test` — 722 specs green (new SSR test included)
- [x] Lint + Prettier clean
