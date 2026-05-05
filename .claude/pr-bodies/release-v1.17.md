## What

Promotes the v1.17 train from `develop` to `main`. semantic-release will tag the stable version automatically on push to `main`.

## What's included since v1.16.0

- **#433** — `fix(auth)`: rate-limit `/auth/login` to 5 attempts/min/IP (with `Retry-After` header documented in the OpenAPI spec).
- **#434** — `feat(spa)`: server-error + offline pages (`/error`, `/offline`). Status:0 auto-redirects to `/offline` with `skipLocationChange: true`; 5xx stays component-level (toasts).
- **#435** — `feat(legal)`: cookie consent banner + `/cookie-policy{,/it}` with locale-aware cross-links and a `ConsentService` gating future analytics.
- **#436** — `feat(help)`: in-product `/help` FAQ page with client-side search and stable `#anchor` deep-links.
- **#437** — `feat(legal)`: terms-of-service page + acceptance gate on registration. `users.terms_accepted_at` records consent; `RegisterUserAction::execute()` takes the timestamp as a typed argument so future CLI/system callers must attest their own.

## Notes

- **Placeholder legal copy** is shipped intentionally on `/terms`, `/terms/it`, `/cookie-policy{,/it}` — banner visible on each page. No production users are paying yet, so the copy is a draft + structural scaffold rather than a binding contract. Counsel review is queued separately, not blocking this train.
- **What's-new** changelog entry will be added in a follow-up `chore(whats-new)` PR per the per-release convention.
