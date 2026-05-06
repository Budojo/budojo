## What

M7 PR-B from [`docs/specs/m7-athlete-login.md`](https://github.com/Budojo/budojo/blob/develop/docs/specs/m7-athlete-login.md) — the owner-side invitation lifecycle. **Backend + service layer only**; the UI section on the athlete detail page is deferred to a focused follow-up PR-B-UI so this diff stays small and PR-C (athlete signup) can build on the API contract without waiting.

Three endpoints, all under the existing `athletes/*` group + behind the FormRequest authorize() check (`role=owner` + academy ownership):

- `POST /api/v1/athletes/{athlete}/invite` — 201, creates or refreshes pending row
- `POST /api/v1/athletes/{athlete}/invite/resend` — 200, same action under the hood (different URL/status so the SPA can branch)
- `DELETE /api/v1/athletes/{athlete}/invitations/{invitation}` — 204, sets `revoked_at` (idempotent on terminal rows)

## Why

#445 captures the M7 milestone vision; the PRD picked PR-B as the natural next step after the PR-A schema foundation (#449) merged. Without these endpoints the PR-A schema is just dead tables — this is the first PR that actually exercises them end-to-end.

Cutting the UI section into its own follow-up keeps each diff under ~500 lines and lets reviewers focus on the security boundary in this PR (anti-squatting, hashed token, throttle) without distraction.

## How

### Action

`SendAthleteInvitationAction::execute(User $sender, Athlete $athlete)` — the load-bearing piece. Three guard clauses in order:

1. Athlete must have an email on file → 422 `email_missing`.
2. The email must NOT already be a Budojo user → 422 `email_already_registered` (anti-squatting; the V1 PRD-locked rule that public `/register` always produces `role=owner` means an athlete invite for an existing-user email is always unredeemable).
3. Re-use the most recent pending row if any → bumps `last_sent_at` + replaces token hash. The owner double-clicking "Invita" must NOT spawn parallel live tokens.

The raw 64-char URL-safe token lives only on the in-flight `AthleteInvitationMail` instance; the DB column stores the SHA-256 hash via `AthleteInvitation::hashToken()` (the helper added in PR-A for this exact purpose).

`SendAthleteInvitationAction::revoke()` — idempotent. Calling on an already-terminal invite is a no-op; calling on a pending invite sets `revoked_at`.

### Mail

`AthleteInvitationMail extends Mailable implements ShouldQueue`. Markdown template at `mail/athlete-invitation.blade.php`, single CTA button to `/athlete-invite/{rawToken}` (the public SPA route PR-C lands). Subject prefix carries the academy name when set so a busy inbox surfaces the inviting school at a glance.

### Boundary

- Controllers stay thin: validate → action → resource → return. The `destroy` method does ONE extra check — that the bound invitation belongs to the bound athlete, returning 404 on mismatch so a crafted URL can't reveal information about other invitations.
- The Resource intentionally OMITS the `token` column — emitting the SHA-256 hash gives a leaked envelope nothing actionable, and we don't want it on the wire by reflex.
- Throttle 5/min/user on both POST endpoints. The action already de-dupes pending rows, but the throttle stops scripted spamming of the mail vendor on a non-existent email.

### Tests

12 new PEST cases:
- Happy path: persists row + queues mail + correct envelope.
- 422 `email_missing` when athlete has no email.
- 422 `email_already_registered` when email is already a User.
- Resend re-uses the pending row (no parallel tokens), bumps `last_sent_at`, replaces the token hash, mails twice.
- Revoke sets `revoked_at`, leaves the row in place for audit.
- Revoke is idempotent on accepted / revoked / expired rows.
- 404 when the invitation doesn't belong to the path athlete.
- 403 when caller is not the academy owner.
- 403 when caller is `role=athlete` (defence in depth pre-PR-F middleware).
- 401 unauthenticated.
- Best-effort mail: queue blowup → row still lands + 201.
- Throttle: 5/min/user → 429 on the 6th.

`AthleteService` gains `invite()` / `resendInvite()` / `revokeInvite()` + the `AthleteInvitation` type + 4 Vitest cases asserting wire shape per endpoint.

### Docs

`docs/api/v1.yaml` extended with three new operations + the `AthleteInvitation` component schema. Spectral linter clean (0 errors).

## Test plan

- [x] `vendor/bin/php-cs-fixer fix` — clean (0 fixes)
- [x] `vendor/bin/phpstan analyse` — clean (level 9)
- [x] `vendor/bin/pest --parallel` — 484 / 1571 assertions, all green
- [x] `npm run lint` — clean
- [x] `npm test -- --watch=false` — 621 specs pass (4 new in athlete.service.spec.ts)
- [x] `spectral lint docs/api/v1.yaml` — 0 errors
- [ ] Manual smoke after merge: open the dev DB, create an academy + athlete with email, hit `POST /api/v1/athletes/{id}/invite` from the API client, verify a row lands in `athlete_invitations` + a queued job in `jobs` (queue worker is dev-only)

## References

- Closes #452
- Sub-task of #445 (M7 umbrella)
- PRD: `docs/specs/m7-athlete-login.md` § "PR-B — Owner-side invitation UI + send action"
- Builds on the schema foundation in #450 (PR-A)
