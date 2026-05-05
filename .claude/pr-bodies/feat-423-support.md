## What

A dedicated `/dashboard/support` contact form, distinct from the in-app feedback flow (#311). Authenticated users file a ticket with a subject, a category (Account / Billing / Bug / Other), and a body. The server persists a `support_tickets` row as the audit trail and queues a markdown-templated email to the support inbox with `Reply-To` set to the user — the inbox owner hits Reply once and the message lands in the user's mailbox, no further routing required.

## Why

The in-app feedback form is fire-and-forget — no Reply-To, no row, no expected response. SaaS without a clear "I want a reply" channel looks unprofessional, so this PR adds the missing surface and keeps it deliberately separate from feedback so the two flows can evolve independently.

## How

### Server

- **Enum** `App\Enums\SupportTicketCategory` — backed string enum (`account` / `billing` / `bug` / `other`).
- **Migration** `create_support_tickets_table` — `id`, nullable `user_id` FK (forward-compatible with the planned logged-out fallback), `subject(100)`, `category(32)`, `body` text, `created_at` only (no `updated_at` — tickets are immutable).
- **Model** `App\Models\SupportTicket` with `const UPDATED_AT = null` and the category cast.
- **FormRequest** `SubmitSupportTicketRequest` with `Rule::enum(SupportTicketCategory::class)`.
- **Action** `SubmitSupportTicketAction` — persists the row, then `Mail::to(...)->queue(...)` wrapped in `try/catch + report()` so a queue insert failure cannot 500 the request (mirrors `RegisterUserAction`'s welcome-mail pattern).
- **Mailable** `SupportTicketMail implements ShouldQueue` — markdown-templated via `mail.support-ticket`, `Reply-To` set to user `Address(email, name)`, subject prefixed `[Budojo support · <category>] <subject>`.
- **Resource** `SupportTicketResource` — lean: only `id` + `created_at`.
- **Controller** `SupportTicketController::store` — thin (validate → action → resource → 202).
- **Route** `POST /api/v1/support` under `auth:sanctum` + `throttle:5,1` (mirrors `/feedback`).

### Client

- `features/support/` — OnPush + signals, Reactive Forms, `p-select` for category, `p-inputtext` for subject, `p-inputtextarea` for body, `p-button` submit, `p-toast` for confirmation/error.
- `core/services/support.service.ts` — POST JSON to `/api/v1/support`.
- Sidebar entry **Contact support** above **Send feedback** in the dashboard footer.
- `mailto:matteo.bonanno@budojo.it?subject=Budojo%20support` link in the public landing footer for logged-out users.
- EN + IT i18n keys in lock-step (parity check passes).
- Route `dashboard/support` behind `authGuard + hasAcademyGuard` (same shell as feedback).

### Tests

- **PEST feature** (`tests/Feature/Support/SubmitSupportTicketTest.php`): persists row + queues mail, four-category data provider, 422 missing/short fields, 422 invalid enum case, 401, 429 throttle (with `RateLimiter::clear`), best-effort mail (queue throws → row still persists, 202 returned), persisted-form casing guard, no-academy fallback.
- **Vitest unit** for `SupportService` (3) + `SupportComponent` (12) covering validation gates, happy path, error path, in-flight disable, and the reply-hint computed signal.
- **Cypress E2E** (`support.cy.ts`): renders form, submits → success toast + reset, 500 → error toast + retained values, sidebar position above feedback.
- **Dashboard spec** gains a "support link in sidebar footer" block pinning the icon and the order.

### Docs

- `docs/api/v1.yaml` — new `support` tag, full `/support` operation (request/response/202/422/429/401), new `SupportTicket` schema component.
- `docs/entities/support-ticket.md` — new entity doc (purpose, schema, business rules, out-of-scope).
- `docs/README.md` — index updated.

## Notes

- **Why HTML markdown shell instead of plain text** (feedback uses plain text): support is a customer-facing thread — the inbox owner replies and the user reads the response; a branded shell is appropriate. Feedback is a triage dump for a single recipient.
- **Why JSON instead of multipart** (feedback uses multipart for the optional image attachment): support has no attachment field. Plain JSON keeps the wire format honest and the controller free of an image-parsing branch.
- **`SUPPORT_EMAIL` constant** mirrors `SubmitFeedbackAction::OWNER_EMAIL` rather than introducing a config value — single-owner product, single inbox; a future "support team" rotation extracts to config.

## Out of scope

Full ticketing (status / threads / attachments), live chat, a "my tickets" listing UI, the wiring of the public form for unauthenticated users (the `user_id` nullable column already accommodates it; the current PR only ships the public `mailto:` fallback link).

## References

Closes #423

## Test plan

- [x] PEST feature suite green (locally — agent worktree, docker gates skipped per brief)
- [x] Vitest unit suites green (service + component)
- [x] EN ↔ IT i18n key parity passes
- [x] OpenAPI YAML parses cleanly
- [x] CI: all 13 checks green (phpstan / pest / php-cs-fixer / vitest / eslint / prettier / 4 cypress shards / spectral / worker tests).
- [x] Copilot review addressed (3 comments): category field is now a real `<label for=support-category>`; mail blade comment rewritten to match what `{{ }}` actually escapes (HTML, not markdown) + `$body` wrapped in a fenced code block so markdown doesn't interpret user content; `SubmitSupportTicketRequest::authorize()` doc expanded so the deliberate permissive-on-academy contract is explicit.

