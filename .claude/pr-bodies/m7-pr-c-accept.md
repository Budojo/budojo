## What

M7 PR-C from [`docs/specs/m7-athlete-login.md`](https://github.com/Budojo/budojo/blob/develop/docs/specs/m7-athlete-login.md) — the athlete signup flow that consumes the invitation PR-B emits. End-to-end onboarding now works: owner invites → email arrives → athlete clicks → sets password → ticks ToS / privacy → lands authenticated in the SPA.

## Why

PR-A (#450) gave us the schema. PR-B (#453) gave us the owner-side send. Without PR-C the invite emails go out but their recipients have nowhere to land — the URL in the body would 404 the moment a user clicks it. PR-C closes the loop so the milestone has a working happy path before PR-D / PR-E layer the dashboard shell + read-only views on top.

## How

### Backend

- **`App\Actions\Auth\AcceptAthleteInvitationAction`** — the load-bearing piece. Two public methods:
  - `preview(string $rawToken): ?AthleteInvitation` — hashes the URL-presented raw token, looks up by hash, returns the row only when the `pending()` scope hits (eager-loads athlete + academy). Any non-pending state returns null so the SPA renders the friendly error page.
  - `execute(string $rawToken, string $password)` — validates the token, defends the email-already-registered race window (a public `/register` could have claimed the email between invite-send and invite-accept), wraps the user-create + athlete-link + invitation-accept in a `DB::transaction`, issues a Sanctum bearer.
- **`AcceptAthleteInvitationRequest`** — `password|min:8|confirmed` + `accept_privacy|accepted` + `accept_terms|accepted`. Mirrors `/auth/register`'s gates.
- **`AthleteInvitationAcceptController`** — thin preview/accept. 404 on any non-pending preview state (keeps the SPA's error rendering simple).
- **Routes** — public, constrained to `[A-Za-z0-9]{64}` so a malformed token 404s at the routing layer. `preview` throttled at 30/min/IP, `accept` at 5/min/IP.

### Frontend

- **`AthleteInviteService`** — types + methods for the two endpoints.
- **`AthleteInviteComponent`** — public page at `/athlete-invite/:token`, outside the dashboard shell. Three render states (`loading` / `invalid` / `ready`). Form pre-filled with read-only name + email; user supplies password + ticks the two legal checkboxes; submit consumes the token + adopts the Sanctum bearer via the new `AuthService::adoptIssuedToken` helper + routes to `/dashboard`.
- **`AuthService::adoptIssuedToken(token)`** — public wrapper around the existing private `storeToken`, so out-of-band auth flows (this one + future SSO etc.) can hydrate auth state without the service needing knowledge of every alternate path.
- EN + IT i18n keys for every visible string and every error code.

### Security boundary

Token storage is hash-only (already locked in PR-A via `AthleteInvitation::hashToken`). The accept endpoint:
- Returns the same generic `invite_invalid` error for unknown tokens as for revoked / expired / accepted, so a stranger probing learns nothing beyond "valid token format".
- Distinguishes between accepted / revoked / expired ONLY when the token actually matches a row — i.e. only the legitimate user who has the URL gets a tailored error.
- Rate-limits accept at 5/min/IP. The 64-char URL-safe token has ~10^115 keyspace so brute force is uninteresting, but defence in depth is cheap.

## Test plan

- [x] PEST 488 / 1576 assertions, all green (13 new in `AcceptAthleteInvitationTest`)
- [x] PHPStan level 9 clean
- [x] PHP CS Fixer 0 fixes
- [x] Vitest 620 specs pass (2 new in `athlete-invite.service.spec.ts`)
- [x] ESLint clean
- [x] Spectral OpenAPI lint — 0 errors
- [ ] Manual smoke after merge: owner sends an invite via PR-B endpoints, copy the raw token from the queued mail payload, hit `/athlete-invite/{token}` in the browser, complete the form, verify auto-login and `users.role = athlete`.

## References

- Closes #454
- Sub-task of #445 (M7 umbrella)
- PRD: `docs/specs/m7-athlete-login.md` § "PR-C — Athlete signup flow"
- Builds on #450 (PR-A schema) + #453 (PR-B owner-side invite)
