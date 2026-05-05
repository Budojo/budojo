## What

Retires the standalone `/dashboard/feedback` page (#311) and folds its responsibilities into `/dashboard/support` (#423). One sidebar entry, one form, one server endpoint, one paper trail.

Closes the redundancy the user flagged in v1.17.0: two near-identical "talk to us" CTAs ("Contatta il supporto" + "Invia feedback") sitting side-by-side in the sidebar broke Krug § "one obvious destination per verb".

## Why

The two pages had different intents but ~98% identical UX. Keeping them separate forced the user to pick between fire-and-forget (feedback) and reply-expected (support) before they could even type, which is the wrong order: the system can route based on the user's words after the fact, not before.

The consolidation:

- **Single channel.** One sidebar entry, one URL, one form. Icon switched from `pi-life-ring` (reads as emergency-only) to `pi-comment` (universal "speak up").
- **Reply-To is universal now.** Even tickets tagged `feedback` carry Reply-To = user. The fire-and-forget UX is preserved by the `feedback` category label, not by suppressing the reply path — a follow-up question from the support inbox is always cheap.
- **Server-derived context auto-attaches.** App version + User-Agent come from request headers, never asked from the user. The legacy feedback flow's auto-attach is preserved.
- **Optional screenshot stays.** The image upload from feedback is now a fourth field on the support form, same MIME / size validation.

## How

### Server

- New migration `add_metadata_to_support_tickets` — adds nullable `app_version` (32) + `user_agent` (512) to `support_tickets`.
- `SupportTicketCategory` gains a fifth case: `Feedback / feedback`.
- `SubmitSupportTicketRequest` adds an `image` rule (`nullable|file|max:5120|mimetypes:image/png,image/jpeg,image/webp`).
- `SubmitSupportTicketAction::execute()` accepts `appVersion`, `userAgent`, `image`. Persists the metadata on the row, attaches the image to the Mailable, and trims excessive User-Agents to 512 chars before persisting.
- `SupportTicketController` reads `X-Budojo-Version` from the request header and threads `image` from the form.
- `SupportTicketMail` accepts the new fields, renders them inline in the email body, attaches the image when present.
- `support-ticket.blade.php` now shows `App version` + `User-Agent` + `Screenshot: attached` lines.
- Drops `App\Mail\FeedbackMail`, `App\Http\Controllers\Feedback\FeedbackController`, `App\Actions\Feedback\SubmitFeedbackAction`, `App\Http\Requests\Feedback\SubmitFeedbackRequest`, `tests/Feature/Feedback/SubmitFeedbackTest.php`, the `/feedback` route, and the `feedback` OpenAPI tag.
- `SubmitSupportTicketTest` gains 6 new cases (header capture, missing-headers fallback, UA truncation, image attach, bad MIME 422, oversized 422).

### Client

- New `versionInterceptor` that adds `X-Budojo-Version: <build tag>` to every `/api/...` request. Wired first in the interceptor chain so auth + error handlers don't need to know about it.
- `SupportService` switched from JSON to multipart (`FormData`) so the optional image rides alongside the text fields. Specs updated to assert against `FormData` parts.
- `SupportComponent` gains image upload (mirrors the feedback page's native `<input type="file">` with inline preview / clear / error). Five-case category dropdown, with `feedback` as the new entry.
- Sidebar: dropped the `nav-feedback` entry; `nav-support` icon switched from `pi-life-ring` to `pi-comment`.
- Routes: dropped `/dashboard/feedback`.
- Drops `client/src/app/features/feedback/`, `core/services/feedback.service.ts`, `cypress/e2e/feedback.cy.ts`.
- i18n: dropped `feedback.*` and `nav.feedback`; added `support.image.*`, `support.category.options.feedback`. EN ⇄ IT parity preserved (`i18n-keys.spec.ts` is the trip-wire). Renamed `landing.features.feedback` to `landing.features.support` with reworded copy.

### Docs

- `docs/entities/support-ticket.md` — schema gains `app_version` + `user_agent` rows, categories table grows to five, optional-screenshot section added, business rules section calls out the auto-attach contract.
- `docs/api/v1.yaml` — `/feedback` endpoint + tag removed; `/support` requestBody is now `multipart/form-data` and includes `image`; category enum extended to five cases; description block notes the X-Budojo-Version + User-Agent auto-attach.

## Test plan

- [x] PEST: 442 passed (1421 assertions).
- [x] Vitest: 618 passed.
- [x] EN ⇄ IT i18n key parity (the spec is the trip-wire).
- [x] Spectral: 0 errors on the OpenAPI spec.
- [ ] CI — the support / dashboard-spec suite + the feedback-cy removal land in one shot.
- [ ] Manual smoke after merge: file a ticket without image, with image, with each category. Confirm the support email arrives with the screenshot attached and the version + UA lines populated.
