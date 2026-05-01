## What

Closes #311. New in-app feedback surface at `/dashboard/feedback`: a user fills subject + description (and optionally a screenshot ≤ 5 MB), the server emails the product owner with the message + the SPA build version + the request User-Agent. Fire-and-forget — 202 on success.

## Why

Until now triaging a beta-tester complaint required a roundtrip ("what version are you on?", "what device?"). The form bakes both into the email so an issue shows up with everything needed to reproduce — no follow-up ping required. Sits **above** What's new in the sidebar footer (active path > passive changelog in the read order).

## How

### Server (Laravel)

- `POST /api/v1/feedback` (auth + `throttle:5,1`) — controller is humble, delegates to `SubmitFeedbackAction`.
- `SubmitFeedbackRequest` validates: subject 3..100, description 10..2000, optional `image` (`mimetypes:` for png/jpeg/webp, max 5 MB), optional `app_version`.
- `SubmitFeedbackAction` builds a `FeedbackMail` Mailable carrying subject, description, user email (Reply-To), academy id (or null), app version, User-Agent, and the optional image as a non-persisted attachment (`Attachment::fromPath` on the temp upload).
- Recipient hardcoded — `SubmitFeedbackAction::OWNER_EMAIL = 'matteobonanno1990@gmail.com'`. Single-owner product, single inbox.
- Email body is a plain-text Blade view (`resources/views/emails/feedback.blade.php`) — one recipient on mobile, no HTML theming pays for itself.

### Client (Angular + PrimeNG)

- `FeedbackComponent` (`/dashboard/feedback`, lazy-loaded, OnPush) — Reactive Form (subject + description), signal-driven image state with client-side MIME + size validation that mirrors the server rules.
- `FeedbackService.submit()` posts `FormData` (always — uniform server-side parser) with `subject`, `description`, `app_version` (from `environment/version.ts` build-time tag), and the optional `image`. Doesn't set Content-Type — `HttpClient` injects the multipart boundary.
- Image upload is a plain `<input type="file">` rather than `p-fileupload` — the latter ships its own state machine + drag-and-drop + progress that the use case doesn't need; the minimal native input is closer to the Apple-minimal canon.
- Sidebar footer entry **above What's new** (`pi pi-comment` icon). Closes/opens the off-canvas drawer like the other footer links.
- Toasts for success (form resets, stay on page) / error (form contents kept so the user can retry).
- i18n: full `en.json` + `it.json` keyset under `feedback.*` and `nav.feedback`.

### Docs

- `docs/api/v1.yaml`: new `POST /feedback` operation (multipart schema, 202/401/422/429 responses).

## Tests

- **PEST feature** (`server/tests/Feature/Feedback/SubmitFeedbackTest.php`, 10 cases): happy path + image attached + appVersion fallback + missing subject / description / oversized image / wrong MIME / 401 unauth / pre-setup user (no academy) / envelope shape.
- **Vitest**:
  - `FeedbackComponent` (12 cases): validation gates submit, happy path resets form + success toast, error path keeps contents + error toast, in-flight disable, image MIME / size client rejection, clearImage.
  - `FeedbackService` (3 cases): FormData shape (subject/description/app_version), image filename roundtrip, error propagation.
  - `DashboardComponent`: sidebar order — feedback above What's new and Sign out.
- **Cypress** (`feedback.cy.ts`, 4 cases): renders + submit-disabled-when-empty, happy path with toast + form reset, error path with toast + content kept, sidebar order.

402 vitest specs and 301 PEST tests pass; PHPStan level 9, CS-Fixer, ESLint, Prettier all clean.

## Out of scope

- Per-user routing (every feedback goes to the owner mailbox).
- Multi-image attachments.
- A "feedback inbox" surface in the SPA — the email IS the inbox.
- Auto-categorisation / triage labels.

## References

- Issue #311
- Mailer config: `server/config/mail.php` § `resend` (prod), `MAIL_MAILER=log` (dev)
- Sidebar order canon: above #254's What's new entry

## Test plan

- [x] PEST `SubmitFeedbackTest` — 10/10 pass
- [x] Vitest `FeedbackComponent` + `FeedbackService` + dashboard sidebar — 402 total, all green
- [x] PHPStan level 9, PHP CS Fixer, ESLint, Prettier clean
- [ ] Cypress `feedback.cy.ts` — verified in CI
- [ ] Manual smoke locally: load `/dashboard/feedback`, fill + submit (no image), check `storage/logs/laravel.log` for the rendered email
- [ ] Manual smoke locally: load `/dashboard/feedback`, attach a 1 MB png, submit — verify `Attachment: yes — see attached file` line in the logged email
