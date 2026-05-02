## What

Retires the dead `/privacy/en` URL from the **v1.8.0** in-app release note. Markdown source + typed array kept in lock-step.

## Why

Copilot caught this on the v1.9.0 release PR (#301): the v1.8.0 entry tells users "English Privacy policy at /privacy/en", but #292 retired that URL when it made `/privacy` the canonical English route + `/privacy/it` the Italian one. A user reading the v1.8.0 bullet today and trying the old URL gets a 404.

The "What's new" page is a live, customer-facing surface — not a frozen historical artefact — so the right move is to keep the v1.8.0 bullet honest about the feature (English Privacy was added) without the dead URL, plus a forward-pointing note that the URL scheme moved in v1.9.0.

## How

- v1.8.0 bullet rewritten in both `docs/changelog/user-facing/v1.8.0.md` and the typed array entry in `whats-new.component.ts` (line 99). The v1.6.0 bullet ("A real Privacy Policy at /privacy. GDPR Art. 13, in Italian.") is intentionally NOT touched — `/privacy` still serves a working page (now English instead of Italian); a curious user reading v1.6.0 sees a working page, not a 404.

## Tests

- `bash .claude/scripts/test-client.sh quick` — lint clean, vitest 380 → 380.
- Spec assertions for the v1.6.0 / v1.7.0 / v1.8.0 entries don't pin the bullet copy (only headings + section count), so the rewrite stays inside the test envelope.

## Out of scope

- The `copilot-replies.sh` pagination concern Copilot flagged on #301 — current usage on this repo never approaches the 50-thread / first-page limits (max seen ~7 threads on a single PR). YAGNI; will revisit if a PR ever surfaces enough comments to truth-test the limit.

## References

- Copilot review on #301 (release PR for v1.9.0).
- Originating change: #291 / #292 (privacy URL canonicalisation).
